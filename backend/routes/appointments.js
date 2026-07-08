const express = require("express");
const mongoose = require("mongoose");

const Appointment = require("../models/Appointment");
const AuditLog = require("../models/AuditLog");
const ClinicSettings = require("../models/ClinicSettings");
const Notification = require("../models/Notification");
const Patient = require("../models/Patient");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate, authorize } = require("../middleware/auth");
const { MOBILE_NUMBER_MESSAGE, isValidMobileNumber, normalizeMobileNumber } = require("../utils/validation");

const router = express.Router();
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DEFAULT_APPOINTMENT_SETTINGS = {
  openingTime: "09:00",
  closingTime: "18:00",
  appointmentDuration: 30,
  workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  maxAppointmentsPerDay: 20,
  bufferTime: 10,
  allowWeekendAppointments: true,
  allowOnlineBooking: true,
};

const startOfDay = (date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const parseAppointmentDate = (value) => {
  if (!value) return null;

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
};

const endOfDay = (date) => {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
};

const toMinutes = (value) => {
  const normalized = String(value || "").trim();
  const meridiemMatch = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (meridiemMatch) {
    let hours = Number(meridiemMatch[1]);
    const minutes = Number(meridiemMatch[2]);
    const period = meridiemMatch[3].toUpperCase();

    if (period === "PM" && hours !== 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;

    return hours * 60 + minutes;
  }

  const [hours = 0, minutes = 0] = normalized.split(":").map(Number);
  return (Number(hours) || 0) * 60 + (Number(minutes) || 0);
};

const formatTime = (minutes, timeFormat = "12") => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (timeFormat === "24") {
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  }

  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${String(displayHours).padStart(2, "0")}:${String(mins).padStart(2, "0")} ${period}`;
};

const getCurrentSettings = async () => {
  const settings = await ClinicSettings.findOne({}).sort({ updatedAt: -1 }).lean();
  return {
    ...settings,
    appointmentSettings: {
      ...DEFAULT_APPOINTMENT_SETTINGS,
      ...(settings?.appointmentSettings || {}),
    },
  };
};

const generateTimeSlots = (appointmentSettings) => {
  const opening = toMinutes(appointmentSettings.openingTime);
  const closing = toMinutes(appointmentSettings.closingTime);
  const duration = Math.max(Number(appointmentSettings.appointmentDuration) || 30, 5);
  const buffer = Math.max(Number(appointmentSettings.bufferTime) || 0, 0);
  const step = duration + buffer;
  const slots = new Set();

  if (!Number.isFinite(opening) || !Number.isFinite(closing) || closing <= opening || step <= 0) {
    return slots;
  }

  for (let current = opening; current + duration <= closing && slots.size < 96; current += step) {
    slots.add(current);
  }

  return slots;
};

const isAllowedAppointmentDate = (date, appointmentSettings) => {
  const dayName = DAY_NAMES[date.getDay()];
  const isWeekend = dayName === "Saturday" || dayName === "Sunday";
  const workingDays = appointmentSettings.workingDays?.length
    ? appointmentSettings.workingDays
    : DEFAULT_APPOINTMENT_SETTINGS.workingDays;

  if (isWeekend && appointmentSettings.allowWeekendAppointments === false) {
    return false;
  }

  return workingDays.includes(dayName);
};

const notifyAdminsOfNewAppointment = async (appointment, settings) => {
  if (settings?.notifications?.newAppointmentAlertForAdmin === false) return;

  const admins = await User.find({ role: "admin", status: "active" }).select("_id");

  if (!admins.length) return;

  await Notification.insertMany(
    admins.map((admin) => ({
      user: admin._id,
      title: "New appointment request",
      message: `${appointment.patientName} requested ${appointment.service} on ${appointment.appointmentDate.toLocaleDateString()} at ${appointment.appointmentTime}.`,
      type: "appointment",
    })),
  );
};

const notifyPatientOfStatus = async (appointment, settings) => {
  const shouldNotify =
    (appointment.status === "confirmed" && settings?.notifications?.appointmentConfirmationEmail !== false) ||
    (appointment.status === "cancelled" && settings?.notifications?.appointmentCancellationNotification !== false);

  if (!shouldNotify) return;

  const patient = appointment.patient
    ? await Patient.findById(appointment.patient).select("userId")
    : await Patient.findOne({ email: appointment.email }).select("userId");

  if (!patient?.userId) return;

  await Notification.create({
    user: patient.userId,
    patient: patient._id,
    title: appointment.status === "confirmed" ? "Appointment confirmed" : "Appointment cancelled",
    message:
      appointment.status === "confirmed"
        ? `Your ${appointment.service} appointment is confirmed for ${appointment.appointmentTime}.`
        : `Your ${appointment.service} appointment has been cancelled.${appointment.declineReason ? ` Reason: ${appointment.declineReason}` : " Please contact the clinic for assistance."}`,
    type: "appointment",
  });
};

const sanitizeAppointment = (appointment) => ({
  id: appointment._id,
  patient: appointment.patient,
  patientName: appointment.patientName,
  contactNumber: appointment.contactNumber,
  email: appointment.email,
  service: appointment.service,
  appointmentDate: appointment.appointmentDate,
  appointmentTime: appointment.appointmentTime,
  dentistName: appointment.dentistName,
  reason: appointment.reason,
  notes: appointment.notes,
  declineReason: appointment.declineReason,
  status: appointment.status,
  createdAt: appointment.createdAt,
});

router.get(
  "/dentists",
  asyncHandler(async (req, res) => {
    const dentists = await User.find({
      role: { $in: ["dentist", "staff"] },
      status: "active",
    })
      .sort({ firstName: 1, lastName: 1 })
      .select("firstName lastName email role");

    res.json({
      data: dentists.map((dentist) => ({
        id: dentist._id,
        name: `${dentist.firstName} ${dentist.lastName}`.trim(),
        email: dentist.email,
        role: dentist.role,
      })),
    });
  }),
);

router.get(
  "/availability",
  authenticate,
  authorize("patient", "admin", "staff", "dentist"),
  asyncHandler(async (req, res) => {
    const parsedDate = parseAppointmentDate(req.query.date);

    if (!parsedDate) {
      return res.status(400).json({
        message: "Please select a valid appointment date.",
        slots: [],
      });
    }

    const settings = await getCurrentSettings();
    const appointmentSettings = settings.appointmentSettings;

    if (appointmentSettings.allowOnlineBooking === false && req.user.role === "patient") {
      return res.json({
        slots: [],
        message: "Online booking is currently unavailable. Please contact the clinic to schedule an appointment.",
      });
    }

    if (!isAllowedAppointmentDate(parsedDate, appointmentSettings)) {
      return res.json({
        slots: [],
        message: "No available appointments for this date. Please select another date.",
      });
    }

    const dayQuery = {
      appointmentDate: parsedDate,
      status: { $in: ["pending", "confirmed", "completed"] },
    };
    const dentistName = req.query.dentistName?.trim();

    if (dentistName) {
      dayQuery.dentistName = dentistName;
    }

    const [appointmentsForDay, bookedAppointments] = await Promise.all([
      Appointment.countDocuments({
        appointmentDate: parsedDate,
        status: { $in: ["pending", "confirmed", "completed"] },
      }),
      Appointment.find(dayQuery).select("appointmentTime dentistName status").lean(),
    ]);

    if (appointmentsForDay >= Number(appointmentSettings.maxAppointmentsPerDay || 20)) {
      return res.json({
        slots: [],
        message: "No available appointments for this date. Please select another date.",
      });
    }

    const bookedSlotMinutes = new Set(bookedAppointments.map((appointment) => toMinutes(appointment.appointmentTime)));
    const timeFormat = settings?.systemPreferences?.timeFormat || "12";
    const slots = [...generateTimeSlots(appointmentSettings)]
      .filter((slot) => !bookedSlotMinutes.has(slot))
      .map((slot) => formatTime(slot, timeFormat));

    res.json({
      slots,
      bookedCount: bookedAppointments.length,
      message: slots.length
        ? "Available time slots loaded."
        : "No available appointments for this date. Please select another date.",
    });
  }),
);

router.post(
  "/book",
  authenticate,
  authorize("patient"),
  asyncHandler(async (req, res) => {
    const {
      patientName,
      contactNumber,
      email,
      appointmentDate,
      appointmentTime,
      dentistName,
      service,
      notes,
      reason,
    } = req.body;

    if (!patientName?.trim() || !contactNumber?.trim() || !email?.trim() || !appointmentDate || !appointmentTime || !service?.trim()) {
      return res.status(400).json({
        message: "Full name, contact number, email, preferred date, preferred time, and service are required.",
      });
    }

    if (!isValidMobileNumber(contactNumber, { required: true })) {
      return res.status(400).json({
        message: MOBILE_NUMBER_MESSAGE,
        errors: { contactNumber: MOBILE_NUMBER_MESSAGE },
      });
    }

    const parsedDate = parseAppointmentDate(appointmentDate);
    const settings = await getCurrentSettings();
    const appointmentSettings = settings.appointmentSettings;

    if (!parsedDate) {
      return res.status(400).json({ message: "Preferred date is invalid." });
    }

    const today = startOfDay(new Date());

    if (parsedDate < today) {
      return res.status(400).json({ message: "Appointment date cannot be in the past." });
    }

    if (appointmentSettings.allowOnlineBooking === false) {
      return res.status(403).json({
        message: "Online booking is currently unavailable. Please contact the clinic to schedule an appointment.",
      });
    }

    if (!isAllowedAppointmentDate(parsedDate, appointmentSettings)) {
      return res.status(400).json({
        message: "The selected date is outside the clinic appointment schedule.",
        errors: { appointmentDate: "The selected date is outside the clinic appointment schedule." },
      });
    }

    const activeServices = (settings.services || []).filter((item) => item.status !== "inactive");

    if (activeServices.length && !activeServices.some((item) => item.serviceName === service.trim())) {
      return res.status(400).json({
        message: "The selected service is no longer available for new appointments.",
        errors: { service: "The selected service is no longer available for new appointments." },
      });
    }

    const allowedSlots = generateTimeSlots(appointmentSettings);

    if (!allowedSlots.has(toMinutes(appointmentTime))) {
      return res.status(400).json({
        message: "The selected time is outside the clinic appointment schedule.",
        errors: { appointmentTime: "The selected time is outside the clinic appointment schedule." },
      });
    }

    const appointmentsForDay = await Appointment.countDocuments({
      appointmentDate: parsedDate,
      status: { $in: ["pending", "confirmed", "completed"] },
    });

    if (appointmentsForDay >= Number(appointmentSettings.maxAppointmentsPerDay || 20)) {
      return res.status(409).json({
        message: "The clinic has reached the maximum number of appointments for this date.",
      });
    }

    const normalizedDentistName = dentistName?.trim() || "Any Available Dentist";

    const existingBooking = await Appointment.findOne({
      appointmentDate: parsedDate,
      appointmentTime: appointmentTime.trim(),
      dentistName: normalizedDentistName,
      status: { $in: ["pending", "confirmed", "completed"] },
    });

    if (existingBooking) {
      return res.status(409).json({
        message: "This dentist and time slot is already booked. Please choose another time or dentist.",
      });
    }

    const patientRecord = await Patient.findOne({ userId: req.user.id });

    const appointment = await Appointment.create({
      patient: patientRecord?._id,
      patientName: patientName.trim(),
      contactNumber: normalizeMobileNumber(contactNumber),
      email: email.trim().toLowerCase(),
      appointmentDate: parsedDate,
      appointmentTime: appointmentTime.trim(),
      dentistName: normalizedDentistName,
      service: service.trim(),
      notes: notes?.trim(),
      reason: reason?.trim(),
      status: "pending",
    });

    await Promise.allSettled([
      notifyAdminsOfNewAppointment(appointment, settings),
      AuditLog.create({
        action: "Appointment Booked",
        entityType: "Appointments",
        entityId: appointment._id,
        performedBy: req.user.id,
        performedByEmail: req.user.email,
        metadata: { service: appointment.service, status: appointment.status },
      }),
    ]);

    res.status(201).json({
      message: "Appointment booked successfully. Your request is pending confirmation.",
      appointment: sanitizeAppointment(appointment),
    });
  }),
);

router.get(
  "/my",
  authenticate,
  authorize("patient"),
  asyncHandler(async (req, res) => {
    const patientRecord = await Patient.findOne({ userId: req.user.id });
    const filters = [{ email: req.user.email }];

    if (patientRecord) {
      filters.push({ patient: patientRecord._id });
    }

    const appointments = await Appointment.find({ $or: filters })
      .sort({ appointmentDate: 1, appointmentTime: 1 })
      .limit(20);

    res.json({
      data: appointments.map(sanitizeAppointment),
    });
  }),
);

router.patch(
  "/:id/status",
  authenticate,
  authorize("admin", "staff", "dentist"),
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid appointment ID." });
    }

    const { status, declineReason } = req.body;
    const settings = await getCurrentSettings();
    const allowedStatuses = ["pending", "confirmed", "completed", "cancelled"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: "Status must be one of: pending, confirmed, completed, cancelled.",
      });
    }

    const normalizedDeclineReason = String(declineReason || "").trim();

    if (status === "cancelled" && !normalizedDeclineReason) {
      return res.status(400).json({
        message: "Please provide a reason for declining this appointment.",
      });
    }

    const update = status === "cancelled"
      ? { status, declineReason: normalizedDeclineReason }
      : { status, $unset: { declineReason: "" } };

    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true },
    );

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found." });
    }

    await Promise.allSettled([
      notifyPatientOfStatus(appointment, settings),
      AuditLog.create({
        action: `Appointment ${status}`,
        entityType: "Appointments",
        entityId: appointment._id,
        performedBy: req.user.id,
        performedByEmail: req.user.email,
        metadata: { status, declineReason: status === "cancelled" ? normalizedDeclineReason : undefined },
      }),
    ]);

    res.json({
      message:
        status === "confirmed"
          ? "Appointment approved and confirmed."
          : "Appointment status updated.",
      appointment: sanitizeAppointment(appointment),
    });
  }),
);

router.get(
  "/",
  authenticate,
  authorize("admin", "staff", "dentist"),
  asyncHandler(async (req, res) => {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    const skip = (page - 1) * limit;

    const [appointments, total] = await Promise.all([
      Appointment.find({}).sort({ appointmentDate: 1, appointmentTime: 1 }).skip(skip).limit(limit),
      Appointment.countDocuments({}),
    ]);

    res.json({
      data: appointments.map(sanitizeAppointment),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  }),
);

module.exports = router;
