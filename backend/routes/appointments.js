const express = require("express");
const mongoose = require("mongoose");

const Appointment = require("../models/Appointment");
const AuditLog = require("../models/AuditLog");
const ClinicSettings = require("../models/ClinicSettings");
const DentalRecord = require("../models/DentalRecord");
const Notification = require("../models/Notification");
const Patient = require("../models/Patient");
const Promotion = require("../models/Promotion");
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
const ACTIVE_APPOINTMENT_STATUSES = ["pending", "confirmed", "checked_in", "in_consultation", "completed", "rescheduled"];

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

const addDays = (date, days) => {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
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

const getScheduledDateTime = (appointment) => {
  const date = new Date(appointment.appointmentDate);
  if (Number.isNaN(date.getTime())) return new Date(0);

  const minutes = toMinutes(appointment.appointmentTime);
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
};

const compareAppointmentsBySchedule = (left, right) => {
  const leftTime = getScheduledDateTime(left).getTime();
  const rightTime = getScheduledDateTime(right).getTime();
  return leftTime - rightTime;
};

const fullName = (user) => [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();

const normalizeServiceName = (value) => String(value || "").trim().toLowerCase();

const promotionAppliesToService = (promotion, serviceName) => {
  const selected = normalizeServiceName(serviceName);
  const services = Array.isArray(promotion.applicableServices) && promotion.applicableServices.length
    ? promotion.applicableServices
    : promotion.serviceType
      ? [promotion.serviceType]
      : ["All Services"];

  return services.some((service) => {
    const normalized = normalizeServiceName(service);
    return normalized === "all services" || normalized === selected;
  });
};

const isPromotionAvailableByDate = (promotion, now = new Date()) => {
  if (!promotion || promotion.status !== "active") return false;
  if (promotion.startDate && startOfDay(promotion.startDate) > now) return false;
  if (promotion.endDate && endOfDay(promotion.endDate) < now) return false;
  return true;
};

const calculatePromotionPrice = (promotion, originalPrice) => {
  const price = Math.max(Number(originalPrice) || 0, 0);
  const discountType = promotion.effectiveDiscountType || promotion.discountType;
  const discountValue = Math.max(Number(promotion.effectiveDiscountValue ?? promotion.discountValue) || 0, 0);
  const discountAmount = discountType === "percentage"
    ? price * Math.min(discountValue, 100) / 100
    : Math.min(discountValue, price);
  const normalizedDiscount = Math.min(Math.max(Math.round(discountAmount * 100) / 100, 0), price);

  return {
    originalPrice: price,
    discountAmount: normalizedDiscount,
    finalPrice: Math.max(Math.round((price - normalizedDiscount) * 100) / 100, 0),
  };
};

const resolvePromotionDiscount = (promotion) => {
  const currentType = promotion.discountType === "percentage" ? "percentage" : "fixed";
  const currentValue = Number(promotion.discountValue);

  if (Number.isFinite(currentValue) && currentValue > 0) {
    return {
      discountType: currentType,
      discountValue: currentType === "percentage" ? Math.min(currentValue, 100) : currentValue,
    };
  }

  const label = String(promotion.discountLabel || "").trim();
  const percentageMatch = label.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percentageMatch) {
    const value = Number(percentageMatch[1]);
    if (Number.isFinite(value) && value > 0) {
      return { discountType: "percentage", discountValue: Math.min(value, 100) };
    }
  }

  const amountMatch = label.replace(/,/g, "").match(/(?:₱|PHP)?\s*(\d+(?:\.\d+)?)/i);
  if (amountMatch) {
    const value = Number(amountMatch[1]);
    if (Number.isFinite(value) && value > 0) {
      return { discountType: "fixed", discountValue: value };
    }
  }

  return { discountType: currentType, discountValue: 0 };
};

const validatePromotionForBooking = async ({ patientId, serviceName, servicePrice, promoCode, autoApply = false }) => {
  if (!patientId) {
    return {
      valid: false,
      message: "Patient profile is required before applying a promo code.",
    };
  }

  const now = new Date();
  const baseQuery = {
    status: "active",
    $or: [
      { startDate: { $exists: false } },
      { startDate: null },
      { startDate: { $lte: now } },
    ],
  };

  const query = promoCode
    ? { ...baseQuery, promoCode: String(promoCode).trim().toUpperCase() }
    : baseQuery;

  const candidates = await Promotion.find(query).sort({ discountValue: -1, endDate: 1, createdAt: -1 });
  const promotion = candidates.find((item) => isPromotionAvailableByDate(item, now) && promotionAppliesToService(item, serviceName));

  if (!promotion) {
    return {
      valid: false,
      message: promoCode
        ? "Promo code is invalid, expired, inactive, or not applicable to this service."
        : "No active promotion is available for this service.",
    };
  }

  const resolvedDiscount = resolvePromotionDiscount(promotion);

  if (!resolvedDiscount.discountValue) {
    return {
      valid: false,
      message: "This promotion does not have a valid discount amount configured.",
      promotion,
    };
  }

  const existingRedemption = await Appointment.findOne({
    patient: patientId,
    promotion: promotion._id,
  }).select("_id");

  if (existingRedemption) {
    return {
      valid: false,
      message: "This promo code has already been redeemed on your account.",
      promotion,
    };
  }

  if (promotion.maxRedemptions) {
    const redemptionCount = await Appointment.countDocuments({ promotion: promotion._id });
    if (redemptionCount >= promotion.maxRedemptions) {
      return {
        valid: false,
        message: "This promo code has reached its redemption limit.",
        promotion,
      };
    }
  }

  const promotionWithResolvedDiscount = {
    ...(promotion.toObject?.() || promotion),
    effectiveDiscountType: resolvedDiscount.discountType,
    effectiveDiscountValue: resolvedDiscount.discountValue,
  };
  const price = calculatePromotionPrice(promotionWithResolvedDiscount, servicePrice);
  return {
    valid: true,
    autoApplied: autoApply,
    promotion,
    discountType: resolvedDiscount.discountType,
    discountValue: resolvedDiscount.discountValue,
    ...price,
    message: autoApply ? "Promotion applied automatically." : "Promo code applied.",
  };
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
    ["completed", "no_show"].includes(appointment.status) ||
    (appointment.status === "confirmed" && settings?.notifications?.appointmentConfirmationEmail !== false) ||
    (["cancelled", "declined"].includes(appointment.status) && settings?.notifications?.appointmentCancellationNotification !== false);

  if (!shouldNotify) return;

  const patient = appointment.patient
    ? await Patient.findById(appointment.patient).select("userId")
    : await Patient.findOne({ email: appointment.email }).select("userId");

  if (!patient?.userId) return;

  await Notification.create({
    user: patient.userId,
    patient: patient._id,
    title: appointment.status === "confirmed"
      ? "Appointment confirmed"
      : appointment.status === "declined"
        ? "Appointment declined"
        : appointment.status === "completed"
          ? "Appointment completed"
          : appointment.status === "no_show"
            ? "Appointment marked as no-show"
            : "Appointment cancelled",
    message:
      appointment.status === "confirmed"
        ? `Your ${appointment.service} appointment is confirmed for ${appointment.appointmentTime}.`
        : appointment.status === "completed"
          ? `Your ${appointment.service} appointment has been marked as completed. Thank you for visiting the clinic.`
          : appointment.status === "no_show"
            ? `Your ${appointment.service} appointment has been marked as no-show. Please contact the clinic if you need to reschedule.`
            : `Your ${appointment.service} appointment has been ${appointment.status === "declined" ? "declined" : "cancelled"}.${appointment.declineReason ? ` Reason: ${appointment.declineReason}` : " Please contact the clinic for assistance."}`,
    type: "appointment",
    metadata: {
      appointmentId: appointment._id,
      event: appointment.status === "no_show" ? "appointment_no_show" : appointment.status === "declined" ? "appointment_declined" : `appointment_${appointment.status}`,
      declineReason: appointment.declineReason,
    },
  });
};

const sanitizeAppointment = (appointment) => ({
  id: appointment._id,
  patient: appointment.patient,
  patientName: appointment.patientName,
  contactNumber: appointment.contactNumber,
  email: appointment.email,
  service: appointment.service,
  serviceRef: appointment.serviceRef,
  servicePriceSnapshot: appointment.servicePriceSnapshot,
  serviceDurationSnapshot: appointment.serviceDurationSnapshot,
  promotion: appointment.promotion,
  promoCode: appointment.promoCode,
  promoTitle: appointment.promoTitle,
  promoDiscountType: appointment.promoDiscountType,
  promoDiscountValue: appointment.promoDiscountValue,
  originalPrice: appointment.originalPrice,
  discountAmount: appointment.discountAmount,
  finalPrice: appointment.finalPrice,
  appointmentDate: appointment.appointmentDate,
  appointmentTime: appointment.appointmentTime,
  dentistName: appointment.dentistName,
  reason: appointment.reason,
  notes: appointment.notes,
  declineReason: appointment.declineReason,
  requestSubmittedAt: appointment.requestSubmittedAt || appointment.createdAt,
  autoDeclineWarningSentAt: appointment.autoDeclineWarningSentAt,
  autoDeclinedAt: appointment.autoDeclinedAt,
  completedAt: appointment.completedAt,
  completedBy: appointment.completedBy,
  completedByEmail: appointment.completedByEmail,
  noShowAt: appointment.noShowAt,
  noShowBy: appointment.noShowBy,
  noShowByEmail: appointment.noShowByEmail,
  statusUpdatedAt: appointment.statusUpdatedAt,
  statusUpdatedBy: appointment.statusUpdatedBy,
  statusUpdatedByEmail: appointment.statusUpdatedByEmail,
  estimatedRevenueAmount: appointment.estimatedRevenueAmount,
  status: appointment.status,
  createdAt: appointment.createdAt,
});

router.get(
  "/dentists",
  asyncHandler(async (req, res) => {
    const dentists = await User.find({
      role: "dentist",
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
      status: { $in: ACTIVE_APPOINTMENT_STATUSES },
    };
    const dentistName = req.query.dentistName?.trim();

    if (dentistName) {
      dayQuery.dentistName = dentistName;
    }

    const [appointmentsForDay, bookedAppointments] = await Promise.all([
      Appointment.countDocuments({
        appointmentDate: parsedDate,
        status: { $in: ACTIVE_APPOINTMENT_STATUSES },
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
  "/promo/validate",
  authenticate,
  authorize("patient"),
  asyncHandler(async (req, res) => {
    const { service, promoCode, autoApply } = req.body || {};
    const selectedServiceName = String(service || "").trim();

    if (!selectedServiceName) {
      return res.status(400).json({
        message: "Please select a dental service before applying a promo code.",
        errors: { service: "Please select a dental service before applying a promo code." },
      });
    }

    const [settings, patientRecord] = await Promise.all([
      getCurrentSettings(),
      Patient.findOne({ userId: req.user.id }),
    ]);
    const activeServices = (settings.services || []).filter((item) => item.status !== "inactive");
    const selectedService = activeServices.find((item) => item.serviceName === selectedServiceName);

    if (!selectedService) {
      return res.status(400).json({
        message: "The selected service is no longer available for new appointments.",
        errors: { service: "The selected service is no longer available for new appointments." },
      });
    }

    if (!autoApply && !String(promoCode || "").trim()) {
      return res.status(400).json({
        message: "Please enter a promo code.",
        errors: { promoCode: "Please enter a promo code." },
      });
    }

    const result = await validatePromotionForBooking({
      patientId: patientRecord?._id,
      serviceName: selectedService.serviceName,
      servicePrice: selectedService.price,
      promoCode,
      autoApply: Boolean(autoApply),
    });

    if (!result.valid) {
      return res.status(autoApply ? 200 : 400).json({
        valid: false,
        message: result.message,
      });
    }

    res.json({
      valid: true,
      message: result.message,
      autoApplied: result.autoApplied,
      promotion: {
        id: result.promotion._id,
        title: result.promotion.title,
        promoCode: result.promotion.promoCode,
        discountType: result.discountType,
        discountValue: result.discountValue,
        discountLabel: result.promotion.discountLabel,
        applicableServices: result.promotion.applicableServices,
        endDate: result.promotion.endDate,
      },
      originalPrice: result.originalPrice,
      discountAmount: result.discountAmount,
      finalPrice: result.finalPrice,
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
      promoCode,
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

    const selectedServiceName = service.trim();
    const activeServices = (settings.services || []).filter((item) => item.status !== "inactive");
    const selectedService = activeServices.find((item) => item.serviceName === selectedServiceName);

    if (!selectedService) {
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
      status: { $in: ACTIVE_APPOINTMENT_STATUSES },
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
      status: { $in: ACTIVE_APPOINTMENT_STATUSES },
    });

    if (existingBooking) {
      return res.status(409).json({
        message: "This dentist and time slot is already booked. Please choose another time or dentist.",
      });
    }

    const patientRecord = await Patient.findOne({ userId: req.user.id });
    const servicePrice = Number.isFinite(Number(selectedService.price)) ? Number(selectedService.price) : 0;
    const promotionResult = String(promoCode || "").trim()
      ? await validatePromotionForBooking({
          patientId: patientRecord?._id,
          serviceName: selectedService.serviceName,
          servicePrice,
          promoCode,
        })
      : await validatePromotionForBooking({
          patientId: patientRecord?._id,
          serviceName: selectedService.serviceName,
          servicePrice,
          autoApply: true,
        });

    if (String(promoCode || "").trim() && !promotionResult.valid) {
      return res.status(400).json({
        message: promotionResult.message,
        errors: { promoCode: promotionResult.message },
      });
    }

    const appliedPromotion = promotionResult.valid ? promotionResult.promotion : null;
    const originalPrice = promotionResult.valid ? promotionResult.originalPrice : servicePrice;
    const discountAmount = promotionResult.valid ? promotionResult.discountAmount : 0;
    const finalPrice = promotionResult.valid ? promotionResult.finalPrice : servicePrice;

    const appointment = await Appointment.create({
      patient: patientRecord?._id,
      patientName: patientName.trim(),
      contactNumber: normalizeMobileNumber(contactNumber),
      email: email.trim().toLowerCase(),
      appointmentDate: parsedDate,
      appointmentTime: appointmentTime.trim(),
      dentistName: normalizedDentistName,
      service: selectedService.serviceName,
      serviceRef: selectedService._id,
      servicePriceSnapshot: servicePrice,
      serviceDurationSnapshot: Number.isFinite(Number(selectedService.duration)) ? Number(selectedService.duration) : undefined,
      promotion: appliedPromotion?._id,
      promoCode: appliedPromotion?.promoCode,
      promoTitle: appliedPromotion?.title,
      promoDiscountType: promotionResult.valid ? promotionResult.discountType : undefined,
      promoDiscountValue: promotionResult.valid ? promotionResult.discountValue : undefined,
      originalPrice,
      discountAmount,
      finalPrice,
      notes: notes?.trim(),
      reason: reason?.trim(),
      status: "pending",
      requestSubmittedAt: new Date(),
    });

    await Promise.allSettled([
      notifyAdminsOfNewAppointment(appointment, settings),
      AuditLog.create({
        action: "Appointment Booked",
        entityType: "Appointments",
        entityId: appointment._id,
        performedBy: req.user.id,
        performedByEmail: req.user.email,
        metadata: {
          service: appointment.service,
          status: appointment.status,
          promoCode: appointment.promoCode,
          discountAmount: appointment.discountAmount,
          finalPrice: appointment.finalPrice,
        },
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

    const { status, declineReason, treatmentRecord = {}, clinicalNotes = {}, followUp = {} } = req.body;
    const settings = await getCurrentSettings();
    const allowedStatuses = ["pending", "confirmed", "checked_in", "in_consultation", "completed", "cancelled", "declined", "no_show", "rescheduled"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: "Status must be one of: pending, confirmed, checked_in, in_consultation, completed, cancelled, declined, no_show, rescheduled.",
      });
    }

    const normalizedDeclineReason = String(declineReason || "").trim();

    if (["cancelled", "declined"].includes(status) && !normalizedDeclineReason) {
      return res.status(400).json({
        message: `Please provide a reason for ${status === "declined" ? "declining" : "cancelling"} this appointment.`,
      });
    }

    const existingAppointment = await Appointment.findById(req.params.id);

    if (!existingAppointment) {
      return res.status(404).json({ message: "Appointment not found." });
    }

    if (req.user.role === "dentist") {
      const assignedDentist = String(existingAppointment.dentistName || "").trim().toLowerCase();
      const currentDentist = fullName(req.user).toLowerCase();

      if (!assignedDentist || assignedDentist === "any available dentist" || assignedDentist !== currentDentist) {
        return res.status(403).json({ message: "Only the assigned dentist can update this appointment outcome." });
      }
    }

    const transitionRules = {
      confirmed: ["pending"],
      declined: ["pending"],
      checked_in: ["confirmed"],
      in_consultation: ["checked_in"],
      cancelled: ["pending", "confirmed", "checked_in", "in_consultation"],
      completed: ["confirmed", "checked_in", "in_consultation"],
      no_show: ["confirmed", "checked_in"],
      rescheduled: ["pending", "confirmed", "checked_in", "in_consultation"],
      pending: [],
    };
    const allowedCurrentStatuses = transitionRules[status] || [];

    if (!allowedCurrentStatuses.includes(existingAppointment.status)) {
      return res.status(400).json({
        message:
          status === "completed" || status === "no_show"
            ? "Only active appointments can be marked as completed or no-show."
            : "This appointment can no longer be updated to the selected status.",
      });
    }

    const now = new Date();
    const update = {
      status,
      statusUpdatedAt: now,
      statusUpdatedBy: req.user.id,
      statusUpdatedByEmail: req.user.email,
    };
    const unset = {};

    if (["cancelled", "declined"].includes(status)) {
      update.declineReason = normalizedDeclineReason;
    } else {
      unset.declineReason = "";
    }

    if (status === "completed") {
      const currentService = (settings.services || []).find((service) => service.serviceName === existingAppointment.service);
      const revenueAmount = Number.isFinite(Number(existingAppointment.finalPrice))
        ? Number(existingAppointment.finalPrice)
        : Number.isFinite(Number(existingAppointment.servicePriceSnapshot))
          ? Number(existingAppointment.servicePriceSnapshot)
        : Number.isFinite(Number(currentService?.price))
          ? Number(currentService.price)
          : 0;

      update.completedAt = now;
      update.completedBy = req.user.id;
      update.completedByEmail = req.user.email;
      update.estimatedRevenueAmount = revenueAmount;
      if (!existingAppointment.servicePriceSnapshot && currentService) update.servicePriceSnapshot = revenueAmount;
      if (!existingAppointment.serviceDurationSnapshot && currentService?.duration) update.serviceDurationSnapshot = Number(currentService.duration);
      if (!existingAppointment.serviceRef && currentService?._id) update.serviceRef = currentService._id;
    }

    if (status === "no_show") {
      update.noShowAt = now;
      update.noShowBy = req.user.id;
      update.noShowByEmail = req.user.email;
      update.estimatedRevenueAmount = 0;
    }

    const updatePayload = {
      $set: update,
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
    };

    const appointment = await Appointment.findOneAndUpdate(
      { _id: req.params.id, status: existingAppointment.status },
      updatePayload,
      { new: true, runValidators: true },
    );

    if (!appointment) {
      return res.status(409).json({ message: "Appointment status changed before this action could be completed. Please refresh and try again." });
    }

    const createdRecords = [];
    const createdFollowUps = [];

    if (status === "completed" && (treatmentRecord.servicePerformed || treatmentRecord.chiefComplaint || treatmentRecord.diagnosis || treatmentRecord.treatmentPerformed || treatmentRecord.dentistNotes || clinicalNotes.observation || clinicalNotes.assessment || clinicalNotes.recommendations || clinicalNotes.additionalNotes)) {
      const record = await DentalRecord.create({
        patient: appointment.patient,
        appointment: appointment._id,
        patientName: appointment.patientName,
        visitDate: now,
        servicePerformed: treatmentRecord.servicePerformed || appointment.service,
        chiefComplaint: treatmentRecord.chiefComplaint || "",
        diagnosis: treatmentRecord.diagnosis || "",
        treatment: treatmentRecord.treatmentPerformed || appointment.service,
        treatmentPerformed: treatmentRecord.treatmentPerformed || "",
        procedure: treatmentRecord.servicePerformed || appointment.service,
        recommendations: treatmentRecord.recommendations || "",
        nextVisitRecommendation: treatmentRecord.nextVisitRecommendation || "",
        dentistName: appointment.dentistName,
        notes: treatmentRecord.dentistNotes || "",
        clinicalNotes: {
          observation: clinicalNotes.observation || "",
          assessment: clinicalNotes.assessment || "",
          recommendations: clinicalNotes.recommendations || "",
          additionalNotes: clinicalNotes.additionalNotes || "",
        },
      });
      createdRecords.push(record);
    }

    if (status === "completed" && followUp.date && followUp.time) {
      const parsedFollowUpDate = parseAppointmentDate(followUp.date);
      if (parsedFollowUpDate) {
        const followUpAppointment = await Appointment.create({
          patient: appointment.patient,
          patientName: appointment.patientName,
          contactNumber: appointment.contactNumber,
          email: appointment.email,
          service: appointment.service,
          serviceRef: appointment.serviceRef,
          servicePriceSnapshot: appointment.servicePriceSnapshot,
          serviceDurationSnapshot: appointment.serviceDurationSnapshot,
          appointmentDate: parsedFollowUpDate,
          appointmentTime: String(followUp.time).trim(),
          dentistName: appointment.dentistName,
          reason: String(followUp.reason || "Follow-up visit").trim(),
          status: "pending",
          requestSubmittedAt: now,
        });
        createdFollowUps.push(followUpAppointment);
      }
    }

    await Promise.allSettled([
      notifyPatientOfStatus(appointment, settings),
      AuditLog.create({
        action: `Appointment ${status}`,
        entityType: "Appointments",
        entityId: appointment._id,
        performedBy: req.user.id,
        performedByEmail: req.user.email,
        metadata: {
          status,
          declineReason: ["cancelled", "declined"].includes(status) ? normalizedDeclineReason : undefined,
          estimatedRevenueAmount: status === "completed" ? appointment.estimatedRevenueAmount || 0 : undefined,
          completedAt: status === "completed" ? appointment.completedAt : undefined,
          noShowAt: status === "no_show" ? appointment.noShowAt : undefined,
          treatmentRecordCreated: createdRecords.length > 0,
          followUpCreated: createdFollowUps.length > 0,
        },
      }),
    ]);

    res.json({
      message:
        status === "confirmed"
          ? "Appointment approved and confirmed."
          : status === "checked_in"
            ? "Patient checked in."
            : status === "in_consultation"
              ? "Consultation started."
          : status === "declined"
            ? "Appointment declined."
            : status === "completed"
              ? "Appointment marked as completed."
              : status === "no_show"
                ? "Appointment marked as no-show."
                : status === "rescheduled"
                  ? "Appointment marked for rescheduling."
          : "Appointment status updated.",
      appointment: sanitizeAppointment(appointment),
      treatmentRecord: createdRecords[0],
      followUpAppointment: createdFollowUps[0] ? sanitizeAppointment(createdFollowUps[0]) : undefined,
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
    const now = new Date();
    const todayStart = startOfDay(now);
    const tomorrowStart = addDays(todayStart, 1);
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const period = req.query.period || "default";
    const query = {};

    if (req.query.dentist && req.query.dentist !== "all") {
      query.dentistName = req.query.dentist;
    }

    if (req.query.status && req.query.status !== "all") {
      query.status = req.query.status;
    }

    if (req.query.service && req.query.service !== "all") {
      query.service = req.query.service;
    }

    if (req.query.patient) {
      const pattern = new RegExp(String(req.query.patient).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [{ patientName: pattern }, { email: pattern }];
    }

    if (req.query.date) {
      const parsedDate = parseAppointmentDate(req.query.date);
      if (!parsedDate) {
        return res.status(400).json({ message: "Appointment date filter is invalid." });
      }
      query.appointmentDate = { $gte: parsedDate, $lte: endOfDay(parsedDate) };
    } else if (period === "today") {
      query.appointmentDate = { $gte: todayStart, $lt: tomorrowStart };
    } else if (period === "upcoming") {
      query.appointmentDate = { $gte: todayStart };
    } else if (period === "past") {
      query.appointmentDate = { $lt: todayStart };
    } else if (period === "last7") {
      query.appointmentDate = { $gte: addDays(todayStart, -7), $lte: now };
    } else if (period === "last30") {
      query.appointmentDate = { $gte: addDays(todayStart, -30), $lte: now };
    } else if (period === "custom") {
      const startDate = req.query.startDate ? parseAppointmentDate(req.query.startDate) : null;
      const endDate = req.query.endDate ? parseAppointmentDate(req.query.endDate) : null;

      if (req.query.startDate && !startDate) return res.status(400).json({ message: "Start date filter is invalid." });
      if (req.query.endDate && !endDate) return res.status(400).json({ message: "End date filter is invalid." });

      if (startDate || endDate) {
        query.appointmentDate = {
          ...(startDate ? { $gte: startDate } : {}),
          ...(endDate ? { $lte: endOfDay(endDate) } : {}),
        };
      }
    } else if (period !== "all") {
      query.appointmentDate = { $gte: todayStart };
    }

    const [allMatchingAppointments, serviceOptions] = await Promise.all([
      Appointment.find(query)
        .sort({ appointmentDate: 1, appointmentTime: 1 })
        .lean(),
      Appointment.distinct("service", { service: { $nin: [null, ""] } }),
    ]);

    const includeHiddenHistory = ["past", "last7", "last30", "custom", "all"].includes(period) || Boolean(req.query.date);
    const visibleAppointments = includeHiddenHistory
      ? allMatchingAppointments
      : allMatchingAppointments.filter((appointment) => getScheduledDateTime(appointment) >= cutoff);
    const sortedAppointments = visibleAppointments.sort(compareAppointmentsBySchedule);
    const total = sortedAppointments.length;
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const currentPage = Math.min(page, totalPages);
    const skip = (currentPage - 1) * limit;
    const appointments = sortedAppointments.slice(skip, skip + limit);

    res.json({
      data: appointments.map(sanitizeAppointment),
      pagination: {
        page: currentPage,
        limit,
        total,
        pages: totalPages,
      },
      filters: {
        services: serviceOptions.filter(Boolean).sort(),
      },
    });
  }),
);

module.exports = router;
