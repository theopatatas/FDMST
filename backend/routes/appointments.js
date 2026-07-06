const express = require("express");
const mongoose = require("mongoose");

const Appointment = require("../models/Appointment");
const Patient = require("../models/Patient");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate, authorize } = require("../middleware/auth");
const { MOBILE_NUMBER_MESSAGE, isValidMobileNumber, normalizeMobileNumber } = require("../utils/validation");

const router = express.Router();

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

    if (!parsedDate) {
      return res.status(400).json({ message: "Preferred date is invalid." });
    }

    const today = startOfDay(new Date());

    if (parsedDate < today) {
      return res.status(400).json({ message: "Appointment date cannot be in the past." });
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

    const { status } = req.body;
    const allowedStatuses = ["pending", "confirmed", "completed", "cancelled"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: "Status must be one of: pending, confirmed, completed, cancelled.",
      });
    }

    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true },
    );

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found." });
    }

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
