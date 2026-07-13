const express = require("express");

const AuditLog = require("../models/AuditLog");
const Appointment = require("../models/Appointment");
const ClinicSettings = require("../models/ClinicSettings");
const DentalRecord = require("../models/DentalRecord");
const Feedback = require("../models/Feedback");
const Inventory = require("../models/Inventory");
const Notification = require("../models/Notification");
const Patient = require("../models/Patient");
const Promotion = require("../models/Promotion");
const Subscriber = require("../models/Subscriber");
const User = require("../models/User");
const authRoutes = require("./auth");
const appointmentRoutes = require("./appointments");
const dashboardRoutes = require("./dashboard");
const userRoutes = require("./users");
const createCrudRouter = require("../utils/createCrudRouter");
const { authenticate, authorize } = require("../middleware/auth");
const { preparePatientCreateBody, preparePatientUpdateBody } = require("../utils/patientRecords");
const { hashPasswordScrypt, verifyPassword } = require("../utils/password");
const { expirePromotions } = require("../utils/promotionExpiry");

const router = express.Router();

const validatePromotionImage = (value) => {
  const imageValue = value?.trim() || "";
  if (!imageValue) return "";

  const isImageData = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(imageValue);
  const isImageUrl = /^https?:\/\/.+\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(imageValue);

  if (!isImageData && !isImageUrl) {
    const error = new Error("Promotion banner must be a valid image file or image URL.");
    error.status = 400;
    error.errors = { imageUrl: "Promotion banner must be a valid image file or image URL." };
    throw error;
  }

  if (imageValue.length > 1000000) {
    const error = new Error("Promotion banner image is too large.");
    error.status = 400;
    error.errors = { imageUrl: "Promotion banner image is too large." };
    throw error;
  }

  return imageValue;
};

const slugPromoCode = (value) => String(value || "")
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, "")
  .slice(0, 18);

const generatePromoCode = (title) => {
  const base = slugPromoCode(title).slice(0, 10) || "PROMO";
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base}${suffix}`;
};

const parseDiscountFromLabel = (label = "", fallbackType = "fixed") => {
  const text = String(label || "").trim();
  const percentageMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);

  if (percentageMatch) {
    const value = Number(percentageMatch[1]);
    if (Number.isFinite(value) && value > 0) {
      return { discountType: "percentage", discountValue: Math.min(value, 100) };
    }
  }

  const amountMatch = text.replace(/,/g, "").match(/(?:₱|PHP)?\s*(\d+(?:\.\d+)?)/i);
  if (amountMatch) {
    const value = Number(amountMatch[1]);
    if (Number.isFinite(value) && value > 0) {
      return { discountType: fallbackType, discountValue: value };
    }
  }

  return null;
};

const normalizeApplicableServices = (body = {}) => {
  const rawServices = Array.isArray(body.applicableServices)
    ? body.applicableServices
    : body.serviceType
      ? [body.serviceType]
      : [];
  const services = rawServices
    .map((service) => String(service || "").trim())
    .filter(Boolean);

  if (!services.length || services.some((service) => service.toLowerCase() === "all services")) {
    return ["All Services"];
  }

  return [...new Set(services)];
};

const normalizePromotionBody = async (body = {}, req) => {
  const title = body.title?.trim();

  if (!title) {
    const error = new Error("Promotion title is required.");
    error.status = 400;
    error.errors = { title: "Promotion title is required." };
    throw error;
  }

  const startDate = body.startDate ? new Date(body.startDate) : undefined;
  const endDate = body.endDate ? new Date(body.endDate) : undefined;
  let discountType = body.discountType === "percentage" ? "percentage" : "fixed";
  let discountValue = Number(body.discountValue ?? 0);
  const parsedDiscount = parseDiscountFromLabel(body.discountLabel, discountType);

  if ((!Number.isFinite(discountValue) || discountValue <= 0) && parsedDiscount) {
    discountType = parsedDiscount.discountType;
    discountValue = parsedDiscount.discountValue;
  }
  const maxRedemptions = body.maxRedemptions === "" || body.maxRedemptions === null || body.maxRedemptions === undefined
    ? undefined
    : Number(body.maxRedemptions);
  const promoCode = slugPromoCode(body.promoCode) || generatePromoCode(title);

  if (startDate && Number.isNaN(startDate.getTime())) {
    const error = new Error("Start date is invalid.");
    error.status = 400;
    error.errors = { startDate: "Start date is invalid." };
    throw error;
  }

  if (endDate && Number.isNaN(endDate.getTime())) {
    const error = new Error("End date is invalid.");
    error.status = 400;
    error.errors = { endDate: "End date is invalid." };
    throw error;
  }

  if (startDate && endDate && endDate < startDate) {
    const error = new Error("End date must be after the start date.");
    error.status = 400;
    error.errors = { endDate: "End date must be after the start date." };
    throw error;
  }

  if (!Number.isFinite(discountValue) || discountValue <= 0 || (discountType === "percentage" && discountValue > 100)) {
    const error = new Error(discountType === "percentage"
      ? "Percentage discount must be greater than 0 and no more than 100."
      : "Fixed discount must be greater than 0.");
    error.status = 400;
    error.errors = { discountValue: error.message };
    throw error;
  }

  if (maxRedemptions !== undefined && (!Number.isInteger(maxRedemptions) || maxRedemptions < 1)) {
    const error = new Error("Maximum redemption must be a whole number greater than zero.");
    error.status = 400;
    error.errors = { maxRedemptions: "Maximum redemption must be a whole number greater than zero." };
    throw error;
  }

  const existingPromotion = await Promotion.findOne({
    promoCode,
    ...(req.params?.id ? { _id: { $ne: req.params.id } } : {}),
  }).select("_id");

  if (existingPromotion) {
    const error = new Error("Promo code is already in use.");
    error.status = 409;
    error.errors = { promoCode: "Promo code is already in use." };
    throw error;
  }

  const now = new Date();
  const requestedStatus = body.status || "active";
  const status = requestedStatus === "expired" && (!endDate || endDate > now)
    ? "active"
    : requestedStatus;
  const applicableServices = normalizeApplicableServices(body);

  return {
    title,
    description: body.description?.trim() || "",
    imageUrl: validatePromotionImage(body.imageUrl),
    serviceType: applicableServices.includes("All Services") ? "All Services" : applicableServices[0],
    applicableServices,
    promoCode,
    discountType,
    discountValue,
    discountLabel: body.discountLabel?.trim() || (discountType === "percentage" ? `${discountValue}% off` : `₱${discountValue} off`),
    maxRedemptions,
    audience: body.audience || "all",
    status,
    startDate,
    endDate,
    createdBy: body.createdBy || req.user.id,
  };
};

const notifyUsersOfPromotion = async (promotion) => {
  if (promotion.status !== "active") return;
  if (promotion._id) {
    const existingNotificationCount = await Notification.countDocuments({
      type: "promotion",
      "metadata.promotionId": promotion._id,
    });

    if (existingNotificationCount) return;
  }

  const users = await User.find({
    role: { $in: ["patient", "staff", "dentist"] },
    status: "active",
  }).select("_id");

  if (!users.length) return;

  const services = promotion.applicableServices?.length ? promotion.applicableServices.join(", ") : promotion.serviceType || "All Services";
  const discount = promotion.discountLabel || (promotion.discountType === "percentage" ? `${promotion.discountValue}% off` : `₱${promotion.discountValue} off`);
  const expiry = promotion.endDate ? ` Valid until ${promotion.endDate.toLocaleDateString()}.` : "";
  const detail = `${promotion.description || "A new clinic promotion is now available."} Code: ${promotion.promoCode}. ${discount} for ${services}.${expiry}`;

  await Notification.insertMany(
    users.map((user) => ({
      user: user._id,
      title: `New promotion: ${promotion.title}`,
      message: detail,
      type: "promotion",
      metadata: {
        target: "promotion",
        promotionId: promotion._id,
        promotionTitle: promotion.title,
        promotionCode: promotion.promoCode,
        promotionDiscount: discount,
        promotionServices: services,
        promotionImageUrl: promotion.imageUrl || "",
        promotionStatus: promotion.status,
        promotionEndDate: promotion.endDate || null,
      },
    })),
  );
};

const verifyAdminPasswordForPatientAction = async (req) => {
  if (req.user?.role !== "admin") {
    return;
  }

  const { adminPassword } = req.body || {};

  if (!adminPassword) {
    const error = new Error("Admin password is required to complete this patient action.");
    error.status = 400;
    throw error;
  }

  const admin = await User.findById(req.user.id).select("+passwordHash");
  const isValidPassword = admin?.passwordHash && await verifyPassword(adminPassword, admin.passwordHash);

  if (!isValidPassword) {
    const error = new Error("Admin password is incorrect. No patient changes were saved.");
    error.status = 401;
    throw error;
  }
};

const withoutAdminPassword = (body) => {
  const { adminPassword, ...safeBody } = body || {};
  return safeBody;
};

const toStockStatus = ({ quantity = 0, reorderLevel = 0 }) => {
  const quantityValue = Number(quantity);
  const reorderValue = Number(reorderLevel || 0);

  if (quantityValue <= 0) {
    return "out_of_stock";
  }

  if (quantityValue <= reorderValue) {
    return "low_stock";
  }

  return "available";
};

const inventoryListHandler = async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Inventory.find({}).sort({ itemName: 1 }).skip(skip).limit(limit),
      Inventory.countDocuments({}),
    ]);

    res.json({
      data: items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

const inventoryUsageHandler = async (req, res, next) => {
  try {
    const quantityUsed = Number(req.body.quantity);

    if (!Number.isFinite(quantityUsed) || quantityUsed <= 0) {
      return res.status(400).json({ message: "Quantity used must be greater than zero." });
    }

    const appointment = req.body.appointmentId
      ? await Appointment.findById(req.body.appointmentId).lean()
      : null;

    if (req.body.appointmentId && !appointment) {
      return res.status(404).json({ message: "Appointment or treatment record was not found." });
    }

    if (appointment && appointment.status !== "completed") {
      return res.status(400).json({ message: "Inventory usage can only be recorded for completed treatments." });
    }

    if (req.user.role === "dentist" && appointment?.dentistName) {
      const dentistName = [req.user.firstName, req.user.lastName].filter(Boolean).join(" ").trim();
      if (dentistName && appointment.dentistName !== dentistName) {
        return res.status(403).json({ message: "Dentists can only record usage for their assigned treatments." });
      }
    }

    const inventoryItem = await Inventory.findById(req.params.id);

    if (!inventoryItem) {
      return res.status(404).json({ message: "Inventory item was not found." });
    }

    if (Number(inventoryItem.quantity || 0) < quantityUsed) {
      return res.status(400).json({ message: "Insufficient stock. Inventory quantity cannot go below zero." });
    }

    const treatmentRecord = appointment
      ? await DentalRecord.findOne({ appointment: appointment._id }).sort({ createdAt: -1 }).lean()
      : null;
    const staffName = [req.user.firstName, req.user.lastName].filter(Boolean).join(" ").trim() || req.user.email;
    const updatedQuantity = Number(inventoryItem.quantity || 0) - quantityUsed;
    const usageEntry = {
      quantity: quantityUsed,
      patient: appointment?.patient,
      patientName: appointment?.patientName || req.body.patientName || "",
      appointment: appointment?._id,
      treatmentRecord: treatmentRecord?._id,
      dentistName: appointment?.dentistName || req.body.dentistName || "",
      staffMember: req.user.id,
      staffName,
      note: String(req.body.note || "").trim(),
      recordedAt: new Date(),
    };

    inventoryItem.quantity = updatedQuantity;
    inventoryItem.status = toStockStatus({
      quantity: updatedQuantity,
      reorderLevel: inventoryItem.reorderLevel,
    });
    inventoryItem.usageHistory.push(usageEntry);
    inventoryItem.transactionHistory.push({
      type: "treatment_usage",
      quantityBefore: Number(inventoryItem.quantity || 0) + quantityUsed,
      quantityChanged: -quantityUsed,
      quantityAfter: updatedQuantity,
      patientName: usageEntry.patientName,
      appointment: appointment?._id,
      dentistName: usageEntry.dentistName,
      processedBy: req.user.id,
      processedByName: usageEntry.staffName,
      notes: usageEntry.note,
      recordedAt: usageEntry.recordedAt,
    });
    await inventoryItem.save();

    await AuditLog.create({
      action: "Inventory usage recorded",
      entityType: "Inventory",
      entityId: inventoryItem._id,
      performedBy: req.user.id,
      performedByEmail: req.user.email,
      metadata: {
        inventoryItem: inventoryItem.itemName,
        quantityDeducted: quantityUsed,
        remainingQuantity: updatedQuantity,
        patient: usageEntry.patientName,
        appointmentId: appointment?._id,
        treatmentRecordId: treatmentRecord?._id,
        dentist: usageEntry.dentistName,
        staffMember: usageEntry.staffName,
      },
    });

    res.json({
      message: "Inventory usage recorded and stock updated.",
      item: inventoryItem,
    });
  } catch (error) {
    next(error);
  }
};

const inventorySaleHandler = async (req, res, next) => {
  try {
    const quantitySold = Number(req.body.quantity);

    if (!Number.isFinite(quantitySold) || quantitySold <= 0) {
      return res.status(400).json({ message: "Quantity must be greater than zero." });
    }

    const inventoryItem = await Inventory.findById(req.params.id);

    if (!inventoryItem || inventoryItem.isActive === false) {
      return res.status(404).json({ message: "Inventory item is unavailable." });
    }

    if (Number(inventoryItem.quantity || 0) < quantitySold) {
      return res.status(400).json({ message: "Insufficient stock. Inventory quantity cannot go below zero." });
    }

    const appointment = req.body.appointmentId
      ? await Appointment.findById(req.body.appointmentId).lean()
      : null;

    if (req.body.appointmentId && !appointment) {
      return res.status(404).json({ message: "Connected appointment was not found." });
    }

    if (inventoryItem.requiresPrescription) {
      const prescriptionReference = String(req.body.prescriptionReference || "").trim();
      const dentistName = String(req.body.dentistName || appointment?.dentistName || "").trim();

      if (req.user.role === "staff" && (!prescriptionReference || !dentistName)) {
        return res.status(400).json({ message: "A dentist prescription or approval is required before releasing this item." });
      }
    }

    const unitPrice = Math.max(Number(inventoryItem.sellingPrice ?? inventoryItem.purchasePrice ?? 0) || 0, 0);
    const totalAmount = Math.round(unitPrice * quantitySold * 100) / 100;
    const quantityBefore = Number(inventoryItem.quantity || 0);
    const quantityAfter = quantityBefore - quantitySold;
    const transactionId = `SALE-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const processedByName = [req.user.firstName, req.user.lastName].filter(Boolean).join(" ").trim() || req.user.email;
    const transaction = {
      transactionId,
      type: "sale",
      quantityBefore,
      quantityChanged: -quantitySold,
      quantityAfter,
      unitPrice,
      totalAmount,
      patientName: String(req.body.patientName || appointment?.patientName || "").trim(),
      appointment: appointment?._id,
      prescriptionReference: String(req.body.prescriptionReference || "").trim(),
      dentistName: String(req.body.dentistName || appointment?.dentistName || "").trim(),
      processedBy: req.user.id,
      processedByName,
      notes: String(req.body.notes || "").trim(),
      recordedAt: new Date(),
    };

    inventoryItem.quantity = quantityAfter;
    inventoryItem.status = toStockStatus({
      quantity: quantityAfter,
      reorderLevel: inventoryItem.reorderLevel,
    });
    inventoryItem.transactionHistory.push(transaction);
    await inventoryItem.save();

    await AuditLog.create({
      action: "Inventory sale recorded",
      entityType: "Inventory",
      entityId: inventoryItem._id,
      performedBy: req.user.id,
      performedByEmail: req.user.email,
      metadata: {
        transactionId,
        inventoryItem: inventoryItem.itemName,
        quantitySold,
        unitPrice,
        totalAmount,
        patientName: transaction.patientName,
        appointmentId: appointment?._id,
        prescriptionReference: transaction.prescriptionReference,
        dentistName: transaction.dentistName,
        quantityBefore,
        quantityAfter,
      },
    });

    res.json({
      message: "Sale/release recorded and stock updated.",
      transactionId,
      item: inventoryItem,
      transaction,
    });
  } catch (error) {
    next(error);
  }
};

const inventoryAdjustmentHandler = async (req, res, next) => {
  try {
    const type = req.body.type === "deduct" ? "manual_adjustment" : "restock";
    const quantity = Number(req.body.quantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ message: "Adjustment quantity must be greater than zero." });
    }

    const inventoryItem = await Inventory.findById(req.params.id);

    if (!inventoryItem) {
      return res.status(404).json({ message: "Inventory item was not found." });
    }

    const quantityBefore = Number(inventoryItem.quantity || 0);
    const quantityChanged = type === "restock" ? quantity : -quantity;
    const quantityAfter = quantityBefore + quantityChanged;

    if (quantityAfter < 0) {
      return res.status(400).json({ message: "Insufficient stock. Inventory quantity cannot go below zero." });
    }

    const processedByName = [req.user.firstName, req.user.lastName].filter(Boolean).join(" ").trim() || req.user.email;
    const transaction = {
      type,
      quantityBefore,
      quantityChanged,
      quantityAfter,
      processedBy: req.user.id,
      processedByName,
      notes: String(req.body.note || "").trim(),
      recordedAt: new Date(),
    };

    inventoryItem.quantity = quantityAfter;
    inventoryItem.status = toStockStatus({ quantity: quantityAfter, reorderLevel: inventoryItem.reorderLevel });
    inventoryItem.transactionHistory.push(transaction);
    await inventoryItem.save();

    await AuditLog.create({
      action: type === "restock" ? "Inventory restocked" : "Inventory manually adjusted",
      entityType: "Inventory",
      entityId: inventoryItem._id,
      performedBy: req.user.id,
      performedByEmail: req.user.email,
      metadata: {
        inventoryItem: inventoryItem.itemName,
        transactionType: type,
        quantityBefore,
        quantityChanged,
        quantityAfter,
        notes: transaction.notes,
      },
    });

    res.json({
      message: type === "restock" ? "Inventory restocked successfully." : "Inventory deducted successfully.",
      item: inventoryItem,
      transaction,
    });
  } catch (error) {
    next(error);
  }
};

const normalizeClinicSettingsBody = (body = {}) => {
  const normalized = { ...body };

  if (Array.isArray(body.services)) {
    normalized.services = body.services.map((service, index) => {
      const serviceName = String(service.serviceName || "").trim();
      const price = Number(service.price ?? 0);
      const duration = Number(service.duration ?? 0);

      if (!serviceName) {
        const error = new Error("Service name is required.");
        error.status = 400;
        error.errors = { [`services.${index}.serviceName`]: "Service name is required." };
        throw error;
      }

      if (!Number.isFinite(price) || price < 0) {
        const error = new Error("Service price must be a valid non-negative amount.");
        error.status = 400;
        error.errors = { [`services.${index}.price`]: "Service price must be a valid non-negative amount." };
        throw error;
      }

      if (!Number.isFinite(duration) || duration < 1) {
        const error = new Error("Service duration must be a valid number of minutes.");
        error.status = 400;
        error.errors = { [`services.${index}.duration`]: "Service duration must be a valid number of minutes." };
        throw error;
      }

      return {
        ...service,
        serviceName,
        category: String(service.category || "General").trim() || "General",
        price,
        duration,
        status: service.status === "inactive" ? "inactive" : "active",
      };
    });
  }

  return normalized;
};

const sanitizePatientDentalRecord = (record) => {
  const value = record.toObject ? record.toObject() : { ...record };
  delete value.clinicalNotes;
  return value;
};

const escapeRegex = (value) => String(value || "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const providerName = (user) => [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();

const parseReportDate = (value, endOfDay = false) => {
  if (!value) return null;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
    ? new Date(...String(value).split("-").map((part, index) => index === 1 ? Number(part) - 1 : Number(part)))
    : new Date(value);

  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return parsed;
};

const patientFullName = (patient) => [patient?.firstName, patient?.lastName].filter(Boolean).join(" ").trim();

const getPatientDisplayStatus = (patient) => {
  if ((patient.status || "active") === "inactive") return "Inactive";
  return patient.registrationStatus === "verified" ? "Verified" : "New";
};

const formatScheduleLabel = (appointment) => {
  if (!appointment) return "";
  const date = appointment.appointmentDate ? new Date(appointment.appointmentDate).toLocaleDateString() : "";
  return [date, appointment.appointmentTime].filter(Boolean).join(" ");
};

const patientMatchesSearch = (patient, search) => {
  const normalized = String(search || "").trim().toLowerCase();
  if (!normalized) return true;
  return [
    patientFullName(patient),
    patient.patientId,
    patient.contactNumber,
    patient.email,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalized));
};

const buildCarePatientResponse = (patient, appointments = [], records = []) => {
  const patientName = patientFullName(patient);
  const patientEmail = String(patient.email || "").toLowerCase();
  const patientAppointments = appointments
    .filter((appointment) => {
      const appointmentPatient = String(appointment.patient || appointment.patient?._id || "");
      return (
        appointmentPatient === String(patient._id) ||
        (patientEmail && String(appointment.email || "").toLowerCase() === patientEmail) ||
        String(appointment.patientName || "").trim().toLowerCase() === patientName.toLowerCase()
      );
    })
    .sort((left, right) => new Date(right.appointmentDate || 0) - new Date(left.appointmentDate || 0));
  const patientRecords = records
    .filter((record) => {
      const recordPatient = String(record.patient || record.patient?._id || "");
      return recordPatient === String(patient._id) || String(record.patientName || "").trim().toLowerCase() === patientName.toLowerCase();
    })
    .sort((left, right) => new Date(right.visitDate || right.createdAt || 0) - new Date(left.visitDate || left.createdAt || 0));
  const now = new Date();
  const pastAppointments = patientAppointments
    .filter((appointment) => new Date(appointment.appointmentDate || 0) <= now)
    .sort((left, right) => new Date(right.appointmentDate || 0) - new Date(left.appointmentDate || 0));
  const futureAppointments = patientAppointments
    .filter((appointment) => new Date(appointment.appointmentDate || 0) >= now)
    .sort((left, right) => new Date(left.appointmentDate || 0) - new Date(right.appointmentDate || 0));

  return {
    ...patient.toObject(),
    fullName: patientName,
    displayStatus: getPatientDisplayStatus(patient),
    lastVisit: formatScheduleLabel(pastAppointments[0]),
    nextAppointment: formatScheduleLabel(futureAppointments[0]),
    appointmentHistory: patientAppointments,
    treatmentRecords: patientRecords.filter((record) => record.recordType !== "clinical_note"),
    clinicalNotes: patientRecords.filter((record) => record.recordType === "clinical_note" || clinicalNoteHasContent(record)),
  };
};

const getProviderCareData = async (req) => {
  const name = providerName(req.user);
  const email = String(req.user.email || "").toLowerCase();
  const userId = String(req.user.id);

  if (req.user.role === "staff") {
    const [appointments, records, patients] = await Promise.all([
      Appointment.find({}).sort({ appointmentDate: -1 }).lean(),
      DentalRecord.find({}).sort({ visitDate: -1, createdAt: -1 }).lean(),
      Patient.find({}).sort({ updatedAt: -1 }),
    ]);

    return { appointments, records, patients };
  }

  const appointmentFilters = [
    { statusUpdatedBy: req.user.id },
    { completedBy: req.user.id },
    { noShowBy: req.user.id },
    { statusUpdatedByEmail: email },
    { completedByEmail: email },
    { noShowByEmail: email },
  ];
  const recordFilters = [
    { createdBy: req.user.id },
    { createdByEmail: email },
  ];

  if (req.user.role === "dentist" && name) {
    appointmentFilters.push({ dentistName: name });
    recordFilters.push({ dentistName: name });
  }

  const appointmentQuery = { $or: appointmentFilters };
  const recordQuery = { $or: recordFilters };

  const [appointments, records, assignedPatients] = await Promise.all([
    Appointment.find(appointmentQuery).sort({ appointmentDate: -1 }).lean(),
    DentalRecord.find(recordQuery).sort({ visitDate: -1, createdAt: -1 }).lean(),
    Patient.find({ assignedDentist: req.user.id }).sort({ updatedAt: -1 }),
  ]);
  const patientIds = new Set(assignedPatients.map((patient) => String(patient._id)));
  const patientEmails = new Set(assignedPatients.map((patient) => String(patient.email || "").toLowerCase()).filter(Boolean));
  const patientNames = new Set(assignedPatients.map((patient) => patientFullName(patient).toLowerCase()).filter(Boolean));

  appointments.forEach((appointment) => {
    if (appointment.patient) patientIds.add(String(appointment.patient));
    if (appointment.email) patientEmails.add(String(appointment.email).toLowerCase());
    if (appointment.patientName) patientNames.add(String(appointment.patientName).toLowerCase());
  });

  records.forEach((record) => {
    if (record.patient) patientIds.add(String(record.patient));
    if (record.patientName) patientNames.add(String(record.patientName).toLowerCase());
  });

  const patientQuery = [];
  if (patientIds.size) patientQuery.push({ _id: { $in: [...patientIds] } });
  if (patientEmails.size) patientQuery.push({ email: { $in: [...patientEmails] } });

  const patients = patientQuery.length
    ? await Patient.find({ $or: patientQuery }).sort({ updatedAt: -1 })
    : [];
  const missingNamePatients = patientNames.size
    ? (await Patient.find({}).sort({ updatedAt: -1 })).filter((patient) => patientNames.has(patientFullName(patient).toLowerCase()))
    : [];
  const merged = new Map();
  [...assignedPatients, ...patients, ...missingNamePatients].forEach((patient) => merged.set(String(patient._id), patient));

  return {
    appointments,
    records,
    patients: [...merged.values()].filter((patient) => {
      if (req.user.role === "dentist" && patient.assignedDentist && String(patient.assignedDentist) === userId) return true;
      return true;
    }),
  };
};

const clinicalNoteHasContent = (record) => {
  const notes = record.clinicalNotes || {};
  return [notes.observation, notes.assessment, notes.recommendations, notes.additionalNotes]
    .some((value) => String(value || "").trim());
};

const sanitizeClinicalNote = (record) => {
  const value = record.toObject ? record.toObject() : { ...record };
  return {
    id: value._id,
    patient: value.patient,
    appointment: value.appointment,
    patientName: value.patientName,
    noteType: value.noteType || "Clinical Note",
    visitDate: value.visitDate,
    clinicalNotes: value.clinicalNotes || {},
    createdBy: value.createdBy,
    createdByName: value.createdByName,
    createdByEmail: value.createdByEmail,
    dentistName: value.dentistName,
    servicePerformed: value.servicePerformed,
    procedure: value.procedure,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
};

const clinicalNoteScope = (req, ownOnly = false) => {
  const name = providerName(req.user);
  const ownFilters = [
    { createdBy: req.user.id },
    { createdByEmail: req.user.email },
  ];

  if (req.user.role === "dentist" && name) {
    ownFilters.push({ dentistName: name });
  }

  if (req.user.role === "admin" && !ownOnly) return {};
  return { $or: ownFilters };
};

const buildClinicalNoteQuery = (req) => {
  const ownOnly = req.query.scope !== "all";
  const query = clinicalNoteScope(req, ownOnly);
  const startDate = req.query.startDate ? parseReportDate(req.query.startDate) : null;
  const endDate = req.query.endDate ? parseReportDate(req.query.endDate, true) : null;

  query.$and = query.$and || [];
  query.$and.push({
    $or: [
      { "clinicalNotes.observation": { $nin: [null, ""] } },
      { "clinicalNotes.assessment": { $nin: [null, ""] } },
      { "clinicalNotes.recommendations": { $nin: [null, ""] } },
      { "clinicalNotes.additionalNotes": { $nin: [null, ""] } },
    ],
  });

  if (req.query.startDate && !startDate) {
    const error = new Error("Start date filter is invalid.");
    error.status = 400;
    throw error;
  }

  if (req.query.endDate && !endDate) {
    const error = new Error("End date filter is invalid.");
    error.status = 400;
    throw error;
  }

  if (startDate || endDate) {
    query.$and.push({
      visitDate: {
        ...(startDate ? { $gte: startDate } : {}),
        ...(endDate ? { $lte: endDate } : {}),
      },
    });
  }

  if (req.query.provider && req.user.role === "admin") {
    const pattern = new RegExp(escapeRegex(req.query.provider), "i");
    query.$and.push({ $or: [{ createdByName: pattern }, { createdByEmail: pattern }, { dentistName: pattern }] });
  }

  if (req.query.appointment && mongoose.Types.ObjectId.isValid(req.query.appointment)) {
    query.$and.push({ appointment: req.query.appointment });
  }

  if (req.query.search) {
    const pattern = new RegExp(escapeRegex(req.query.search), "i");
    query.$and.push({
      $or: [
        { patientName: pattern },
        { noteType: pattern },
        { servicePerformed: pattern },
        { procedure: pattern },
        { createdByName: pattern },
        { dentistName: pattern },
        { "clinicalNotes.observation": pattern },
        { "clinicalNotes.assessment": pattern },
        { "clinicalNotes.recommendations": pattern },
        { "clinicalNotes.additionalNotes": pattern },
      ],
    });
  }

  if (!query.$and.length) delete query.$and;
  return query;
};

const auditClinicalNoteAction = (req, record, action) => AuditLog.create({
  action,
  entityType: "Clinical Notes",
  entityId: record?._id,
  performedBy: req.user.id,
  performedByEmail: req.user.email,
  metadata: {
    userName: providerName(req.user),
    patient: record?.patient,
    patientName: record?.patientName,
    appointment: record?.appointment,
  },
}).catch(() => {});

const sanitizeTreatmentRecord = (record) => {
  const value = record.toObject ? record.toObject() : { ...record };
  return {
    id: value._id,
    patient: value.patient,
    appointment: value.appointment,
    patientName: value.patientName,
    contactNumber: value.contactNumber,
    dateOfBirth: value.dateOfBirth,
    visitDate: value.visitDate,
    procedure: value.procedure || value.servicePerformed || value.treatment,
    servicePerformed: value.servicePerformed,
    toothNumber: value.toothNumber,
    diagnosis: value.diagnosis,
    treatmentPerformed: value.treatmentPerformed || value.treatment,
    materialsUsed: value.materialsUsed,
    treatmentStatus: value.treatmentStatus || "completed",
    recommendations: value.recommendations,
    nextVisitRecommendation: value.nextVisitRecommendation,
    notes: value.notes,
    dentistName: value.dentistName,
    createdBy: value.createdBy,
    createdByName: value.createdByName,
    createdByEmail: value.createdByEmail,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
};

const treatmentRecordHasContent = (record) => [
  record?.procedure,
  record?.servicePerformed,
  record?.treatment,
  record?.treatmentPerformed,
  record?.diagnosis,
  record?.materialsUsed,
  record?.recommendations,
  record?.nextVisitRecommendation,
  record?.notes,
].some((value) => String(value || "").trim());

const treatmentRecordScope = (req, ownOnly = false) => {
  const name = providerName(req.user);
  const ownFilters = [
    { createdBy: req.user.id },
    { createdByEmail: req.user.email },
  ];

  if ((req.user.role === "dentist" || req.user.role === "admin") && name) {
    ownFilters.push({ dentistName: name });
  }

  if (req.user.role === "admin" && !ownOnly) return {};
  return { $or: ownFilters };
};

const buildTreatmentRecordQuery = (req) => {
  const ownOnly = req.query.scope !== "all";
  const query = treatmentRecordScope(req, ownOnly);
  const startDate = req.query.startDate ? parseReportDate(req.query.startDate) : null;
  const endDate = req.query.endDate ? parseReportDate(req.query.endDate, true) : null;

  query.$and = query.$and || [];
  query.$and.push({
    $or: [
      { procedure: { $nin: [null, ""] } },
      { servicePerformed: { $nin: [null, ""] } },
      { treatment: { $nin: [null, ""] } },
      { treatmentPerformed: { $nin: [null, ""] } },
      { diagnosis: { $nin: [null, ""] } },
    ],
  });

  if (req.query.startDate && !startDate) {
    const error = new Error("Start date filter is invalid.");
    error.status = 400;
    throw error;
  }

  if (req.query.endDate && !endDate) {
    const error = new Error("End date filter is invalid.");
    error.status = 400;
    throw error;
  }

  if (startDate || endDate) {
    query.$and.push({
      visitDate: {
        ...(startDate ? { $gte: startDate } : {}),
        ...(endDate ? { $lte: endDate } : {}),
      },
    });
  }

  if (req.query.provider && req.user.role === "admin") {
    const pattern = new RegExp(escapeRegex(req.query.provider), "i");
    query.$and.push({ $or: [{ createdByName: pattern }, { createdByEmail: pattern }, { dentistName: pattern }] });
  }

  if (req.query.status && req.query.status !== "all") {
    query.$and.push({ treatmentStatus: req.query.status });
  }

  if (req.query.procedure && req.query.procedure !== "all") {
    const pattern = new RegExp(escapeRegex(req.query.procedure), "i");
    query.$and.push({ $or: [{ procedure: pattern }, { servicePerformed: pattern }, { treatment: pattern }] });
  }

  if (req.query.search) {
    const pattern = new RegExp(escapeRegex(req.query.search), "i");
    query.$and.push({
      $or: [
        { patientName: pattern },
        { procedure: pattern },
        { servicePerformed: pattern },
        { treatment: pattern },
        { diagnosis: pattern },
        { treatmentPerformed: pattern },
        { dentistName: pattern },
        { createdByName: pattern },
      ],
    });
  }

  if (!query.$and.length) delete query.$and;
  return query;
};

const auditTreatmentRecordAction = (req, record, action) => AuditLog.create({
  action,
  entityType: "Treatment Records",
  entityId: record?._id,
  performedBy: req.user.id,
  performedByEmail: req.user.email,
  metadata: {
    userName: providerName(req.user),
    patient: record?.patient,
    patientName: record?.patientName,
    appointment: record?.appointment,
    treatmentRecordId: record?._id,
  },
}).catch(() => {});

const sanitizePublicSettings = (settings) => ({
  clinicName: settings?.clinicName || "Flores-Dizon Dental Clinic",
  address: settings?.address || "",
  contactNumber: settings?.contactNumber || "",
  email: settings?.email || "",
  operatingHours: settings?.operatingHours || "Monday to Saturday, 9:00 AM - 6:00 PM",
  clinicLogo: settings?.clinicLogo || "",
  services: (settings?.services || []).map((service) => ({
    id: service._id,
    serviceName: service.serviceName,
    category: service.category,
    duration: service.duration,
    price: service.price,
    status: service.status,
  })),
  appointmentSettings: settings?.appointmentSettings || {},
  systemPreferences: settings?.systemPreferences || {},
  security: {
    sessionTimeout: settings?.security?.sessionTimeout || 30,
  },
  notifications: {
    appointmentConfirmationEmail: settings?.notifications?.appointmentConfirmationEmail ?? true,
    appointmentReminderEmail: settings?.notifications?.appointmentReminderEmail ?? true,
    appointmentCancellationNotification: settings?.notifications?.appointmentCancellationNotification ?? true,
    lowInventoryAlert: settings?.notifications?.lowInventoryAlert ?? true,
    newAppointmentAlertForAdmin: settings?.notifications?.newAppointmentAlertForAdmin ?? true,
  },
});

router.get("/", (req, res) => {
  res.json({
    modules: [
      "auth",
      "dashboard",
      "users",
      "patients",
      "appointments",
      "dentalrecords",
      "inventory",
      "feedback",
      "promotions",
      "notifications",
      "subscribers",
    ],
  });
});

router.use("/auth", authRoutes);
router.get("/public-settings", async (req, res, next) => {
  try {
    const settings = await ClinicSettings.findOne({}).sort({ updatedAt: -1 });
    res.json(sanitizePublicSettings(settings));
  } catch (error) {
    next(error);
  }
});
router.use("/dashboard", dashboardRoutes);
router.use("/users", userRoutes);
router.use("/appointments", appointmentRoutes);
router.use(authenticate);
router.use("/users", authorize("admin"), createCrudRouter(User, { hiddenFields: "-passwordHash" }));
router.get("/patients/my-care", authorize("staff", "dentist"), async (req, res, next) => {
  try {
    const { appointments, records, patients } = await getProviderCareData(req);
    const filteredPatients = patients
      .map((patient) => buildCarePatientResponse(patient, appointments, records))
      .filter((patient) => patientMatchesSearch(patient, req.query.search));

    res.json({
      data: filteredPatients,
      total: filteredPatients.length,
    });
  } catch (error) {
    next(error);
  }
});
router.get("/patients/my-care/:id", authorize("staff", "dentist"), async (req, res, next) => {
  try {
    const { appointments, records, patients } = await getProviderCareData(req);
    const patient = patients.find((item) => String(item._id) === String(req.params.id));

    if (!patient) {
      return res.status(404).json({ message: "Patient record is not available for your account." });
    }

    res.json(buildCarePatientResponse(patient, appointments, records));
  } catch (error) {
    next(error);
  }
});
router.use(
  "/patients",
  authorize("admin"),
  createCrudRouter(Patient, {
    beforeCreate: async (body, req) => {
      await verifyAdminPasswordForPatientAction(req);
      const temporaryPassword = String(body.temporaryPassword || "").trim();
      if (temporaryPassword && temporaryPassword.length < 8) {
        const error = new Error("Temporary password must be at least 8 characters.");
        error.status = 400;
        error.errors = { temporaryPassword: "Temporary password must be at least 8 characters." };
        throw error;
      }
      if (body.username && await User.findOne({ username: String(body.username).trim() }).select("_id").lean()) {
        const error = new Error("This username is already registered.");
        error.status = 409;
        error.errors = { username: "This username is already registered." };
        throw error;
      }
      return preparePatientCreateBody(withoutAdminPassword(body));
    },
    afterCreate: async (patient, req) => {
      const temporaryPassword = String(req.body.temporaryPassword || "").trim();
      const username = String(req.body.username || "").trim();

      if (temporaryPassword && patient.email && !patient.userId) {
        const passwordHash = await hashPasswordScrypt(temporaryPassword);
        const user = await User.create({
          firstName: patient.firstName,
          lastName: patient.lastName,
          email: patient.email,
          username: username || undefined,
          contactNumber: patient.contactNumber,
          passwordHash,
          role: "patient",
          accountStatus: patient.registrationStatus === "verified" ? "verified_patient" : "unverified_user",
          status: patient.status || "active",
        });
        patient.userId = user._id;
        if (username) patient.username = username;
        await patient.save();
      }

      await AuditLog.create({
        action: "Patient Created",
        entityType: "Patient",
        entityId: patient._id,
        performedBy: req.user.id,
        performedByEmail: req.user.email,
        metadata: { patientId: patient.patientId, status: getPatientDisplayStatus(patient) },
      });
    },
    beforeUpdate: async (body, req) => {
      await verifyAdminPasswordForPatientAction(req);
      const existingPatient = await Patient.findById(req.params.id).lean();
      if (!existingPatient) {
        const error = new Error("Patient record not found.");
        error.status = 404;
        throw error;
      }
      const nextBody = withoutAdminPassword(body);
      const nextStatus = nextBody.status || existingPatient.status;
      const nextRegistrationStatus = nextBody.registrationStatus || existingPatient.registrationStatus;
      const statusChanged = nextStatus !== existingPatient.status || nextRegistrationStatus !== existingPatient.registrationStatus;
      if (statusChanged) {
        nextBody.verificationHistory = [
          ...(existingPatient.verificationHistory || []),
          {
            status: nextStatus === "inactive" ? "inactive" : nextRegistrationStatus === "verified" ? "verified" : "new",
            changedBy: req.user.id,
            changedByEmail: req.user.email,
            note: "Patient status updated by admin.",
            changedAt: new Date(),
          },
        ];
        if (nextRegistrationStatus === "verified" && !existingPatient.verifiedAt) {
          nextBody.verifiedAt = new Date();
        }
      }
      if (existingPatient.userId && statusChanged) {
        await User.findByIdAndUpdate(existingPatient.userId, {
          status: nextStatus,
          accountStatus: nextStatus === "inactive"
            ? "inactive"
            : nextRegistrationStatus === "verified"
              ? "verified_patient"
              : "unverified_user",
        });
      }
      await AuditLog.create({
        action: statusChanged ? "Patient Status Changed" : "Patient Updated",
        entityType: "Patient",
        entityId: existingPatient._id,
        performedBy: req.user.id,
        performedByEmail: req.user.email,
        metadata: {
          patientId: existingPatient.patientId,
          previousStatus: existingPatient.status === "inactive" ? "Inactive" : existingPatient.registrationStatus === "verified" ? "Verified" : "New",
          nextStatus: nextStatus === "inactive" ? "Inactive" : nextRegistrationStatus === "verified" ? "Verified" : "New",
        },
      });
      return preparePatientUpdateBody(
        { ...existingPatient, ...nextBody },
        { excludePatientId: req.params.id, excludeUserId: existingPatient?.userId },
      );
    },
    beforeDelete: async (id, req) => {
      await verifyAdminPasswordForPatientAction(req);
      await AuditLog.create({
        action: "Patient Deleted",
        entityType: "Patient",
        entityId: id,
        performedBy: req.user.id,
        performedByEmail: req.user.email,
      });
    },
  }),
);
router.get("/dentalrecords/provider/reports", authorize("staff", "dentist"), async (req, res, next) => {
  try {
    const name = providerName(req.user);
    const query = {
      $or: [
        { createdBy: req.user.id },
        { createdByEmail: req.user.email },
        ...(req.user.role === "dentist" && name ? [{ dentistName: name }] : []),
      ],
    };
    const startDate = req.query.startDate ? parseReportDate(req.query.startDate) : null;
    const endDate = req.query.endDate ? parseReportDate(req.query.endDate, true) : null;

    if (req.query.startDate && !startDate) {
      return res.status(400).json({ message: "Start date filter is invalid." });
    }

    if (req.query.endDate && !endDate) {
      return res.status(400).json({ message: "End date filter is invalid." });
    }

    if (startDate || endDate) {
      query.$and = query.$and || [];
      query.$and.push({
        visitDate: {
          ...(startDate ? { $gte: startDate } : {}),
          ...(endDate ? { $lte: endDate } : {}),
        },
      });
    }

    if (req.query.search) {
      const pattern = new RegExp(escapeRegex(req.query.search), "i");
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { patientName: pattern },
          { servicePerformed: pattern },
          { treatment: pattern },
          { treatmentPerformed: pattern },
          { procedure: pattern },
          { diagnosis: pattern },
        ],
      });
    }

    const records = await DentalRecord.find(query)
      .sort({ visitDate: -1, createdAt: -1 })
      .limit(500)
      .lean();

    res.json({ data: records });
  } catch (error) {
    next(error);
  }
});
router.get("/dentalrecords/clinical-notes", authorize("admin", "staff", "dentist"), async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    const query = buildClinicalNoteQuery(req);
    const [records, total] = await Promise.all([
      DentalRecord.find(query)
        .sort({ visitDate: -1, updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      DentalRecord.countDocuments(query),
    ]);

    res.json({
      data: records.map(sanitizeClinicalNote),
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(Math.ceil(total / limit), 1),
      },
    });
  } catch (error) {
    next(error);
  }
});
router.post("/dentalrecords/clinical-notes", authorize("admin", "staff", "dentist"), async (req, res, next) => {
  try {
    const patientName = String(req.body.patientName || "").trim();
    const notes = req.body.clinicalNotes || {};
    const appointmentId = String(req.body.appointment || "").trim();

    if (!patientName) {
      return res.status(400).json({ message: "Patient name is required.", errors: { patientName: "Patient name is required." } });
    }

    const clinicalNotes = {
      observation: String(notes.observation || "").trim(),
      assessment: String(notes.assessment || "").trim(),
      recommendations: String(notes.recommendations || "").trim(),
      additionalNotes: String(notes.additionalNotes || "").trim(),
    };

    if (!Object.values(clinicalNotes).some(Boolean)) {
      return res.status(400).json({ message: "Enter at least one clinical note field.", errors: { clinicalNotes: "Enter at least one clinical note field." } });
    }

    let appointment = null;
    if (appointmentId) {
      if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
        return res.status(400).json({ message: "Appointment reference is invalid.", errors: { appointment: "Appointment reference is invalid." } });
      }
      appointment = await Appointment.findById(appointmentId).lean();
      if (!appointment) {
        return res.status(404).json({ message: "Appointment reference was not found." });
      }
    }

    const patient = appointment?.patient
      ? await Patient.findById(appointment.patient).select("_id").lean()
      : await Patient.findOne({ patientName }).select("_id").lean();
    const provider = providerName(req.user);
    const record = await DentalRecord.create({
      patient: patient?._id || appointment?.patient,
      appointment: appointment?._id,
      patientName,
      visitDate: req.body.visitDate ? parseReportDate(req.body.visitDate) || new Date() : new Date(),
      noteType: String(req.body.noteType || "Clinical Note").trim() || "Clinical Note",
      clinicalNotes,
      dentistName: appointment?.dentistName || (req.user.role === "dentist" || req.user.role === "admin" ? provider : ""),
      servicePerformed: appointment?.service || "",
      procedure: appointment?.service || "",
      createdBy: req.user.id,
      createdByName: provider,
      createdByEmail: req.user.email,
    });

    await auditClinicalNoteAction(req, record, "Clinical Note Created");
    res.status(201).json({
      message: "Clinical note created successfully.",
      data: sanitizeClinicalNote(record),
    });
  } catch (error) {
    next(error);
  }
});
router.get("/dentalrecords/clinical-notes/:id", authorize("admin", "staff", "dentist"), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid clinical note ID." });
    }

    const scope = clinicalNoteScope(req, req.user.role !== "admin" || req.query.scope !== "all");
    const record = await DentalRecord.findOne({ _id: req.params.id, ...scope });

    if (!record || !clinicalNoteHasContent(record)) {
      return res.status(404).json({ message: "Clinical note not found." });
    }

    await auditClinicalNoteAction(req, record, "Clinical Note Viewed");
    res.json({ data: sanitizeClinicalNote(record) });
  } catch (error) {
    next(error);
  }
});
router.patch("/dentalrecords/clinical-notes/:id", authorize("admin", "staff", "dentist"), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid clinical note ID." });
    }

    const record = await DentalRecord.findById(req.params.id);
    if (!record || !clinicalNoteHasContent(record)) {
      return res.status(404).json({ message: "Clinical note not found." });
    }

    const isOwner = String(record.createdBy || "") === String(req.user.id) || String(record.createdByEmail || "").toLowerCase() === String(req.user.email || "").toLowerCase();
    if (!isOwner) {
      return res.status(403).json({ message: "Only the original note creator can edit this clinical note." });
    }

    const notes = req.body.clinicalNotes || {};
    const clinicalNotes = {
      observation: String(notes.observation || "").trim(),
      assessment: String(notes.assessment || "").trim(),
      recommendations: String(notes.recommendations || "").trim(),
      additionalNotes: String(notes.additionalNotes || "").trim(),
    };

    if (!Object.values(clinicalNotes).some(Boolean)) {
      return res.status(400).json({ message: "Enter at least one clinical note field.", errors: { clinicalNotes: "Enter at least one clinical note field." } });
    }

    record.clinicalNotes = clinicalNotes;
    record.visitDate = req.body.visitDate ? parseReportDate(req.body.visitDate) || record.visitDate : record.visitDate;
    record.noteType = String(req.body.noteType || record.noteType || "Clinical Note").trim();
    await record.save();

    await auditClinicalNoteAction(req, record, "Clinical Note Updated");
    res.json({
      message: "Clinical note updated successfully.",
      data: sanitizeClinicalNote(record),
    });
  } catch (error) {
    next(error);
  }
});
router.post("/dentalrecords/clinical-notes/export", authorize("admin"), async (req, res, next) => {
  try {
    await AuditLog.create({
      action: "Clinical Note Exported",
      entityType: "Clinical Notes",
      performedBy: req.user.id,
      performedByEmail: req.user.email,
      metadata: {
        userName: providerName(req.user),
        filters: req.body?.filters || {},
      },
    });
    res.json({ message: "Clinical notes export logged." });
  } catch (error) {
    next(error);
  }
});
router.get("/dentalrecords/treatment-records", authorize("admin", "staff", "dentist"), async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    const query = buildTreatmentRecordQuery(req);
    const [records, total, allMatching] = await Promise.all([
      DentalRecord.find(query).sort({ visitDate: -1, updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      DentalRecord.countDocuments(query),
      DentalRecord.find(query).select("procedure servicePerformed treatment treatmentStatus createdByName dentistName").lean(),
    ]);
    const procedures = [...new Set(allMatching.map((record) => record.procedure || record.servicePerformed || record.treatment).filter(Boolean))].sort();
    const providers = [...new Set(allMatching.map((record) => record.createdByName || record.dentistName).filter(Boolean))].sort();

    res.json({
      data: records.map(sanitizeTreatmentRecord),
      summary: {
        total,
        completed: allMatching.filter((record) => (record.treatmentStatus || "completed") === "completed").length,
        followUps: allMatching.filter((record) => record.treatmentStatus === "follow_up_required").length,
        inProgress: allMatching.filter((record) => record.treatmentStatus === "in_progress").length,
      },
      filters: { procedures, providers },
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(Math.ceil(total / limit), 1),
      },
    });
  } catch (error) {
    next(error);
  }
});
router.post("/dentalrecords/treatment-records", authorize("admin", "staff", "dentist"), async (req, res, next) => {
  try {
    const patientName = String(req.body.patientName || "").trim();
    const procedure = String(req.body.procedure || req.body.servicePerformed || "").trim();
    const appointmentId = String(req.body.appointment || "").trim();

    if (!patientName) return res.status(400).json({ message: "Patient name is required.", errors: { patientName: "Patient name is required." } });
    if (!procedure) return res.status(400).json({ message: "Procedure or service is required.", errors: { procedure: "Procedure or service is required." } });

    let appointment = null;
    if (appointmentId) {
      if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
        return res.status(400).json({ message: "Appointment reference is invalid.", errors: { appointment: "Appointment reference is invalid." } });
      }
      appointment = await Appointment.findById(appointmentId).lean();
      if (!appointment) return res.status(404).json({ message: "Appointment reference was not found." });
    }

    const provider = providerName(req.user);
    const record = await DentalRecord.create({
      patient: appointment?.patient,
      appointment: appointment?._id,
      patientName,
      visitDate: req.body.visitDate ? parseReportDate(req.body.visitDate) || new Date() : new Date(),
      procedure,
      servicePerformed: procedure,
      toothNumber: String(req.body.toothNumber || "").trim(),
      diagnosis: String(req.body.diagnosis || "").trim(),
      treatment: String(req.body.treatmentPerformed || req.body.treatmentDescription || "").trim(),
      treatmentPerformed: String(req.body.treatmentPerformed || req.body.treatmentDescription || "").trim(),
      materialsUsed: String(req.body.materialsUsed || "").trim(),
      treatmentStatus: ["completed", "in_progress", "cancelled", "follow_up_required"].includes(req.body.treatmentStatus) ? req.body.treatmentStatus : "completed",
      recommendations: String(req.body.recommendations || req.body.followUpNotes || "").trim(),
      nextVisitRecommendation: String(req.body.nextVisitRecommendation || req.body.followUpNotes || "").trim(),
      dentistName: provider,
      notes: String(req.body.notes || "").trim(),
      createdBy: req.user.id,
      createdByName: provider,
      createdByEmail: req.user.email,
    });

    await auditTreatmentRecordAction(req, record, "Treatment Record Created");
    res.status(201).json({ message: "Treatment record created successfully.", data: sanitizeTreatmentRecord(record) });
  } catch (error) {
    next(error);
  }
});
router.get("/dentalrecords/treatment-records/:id", authorize("admin", "staff", "dentist"), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid treatment record ID." });
    const scope = treatmentRecordScope(req, req.user.role !== "admin" || req.query.scope !== "all");
    const record = await DentalRecord.findOne({ _id: req.params.id, ...scope });

    if (!record || !treatmentRecordHasContent(record)) return res.status(404).json({ message: "Treatment record not found." });

    await auditTreatmentRecordAction(req, record, "Treatment Record Viewed");
    res.json({ data: sanitizeTreatmentRecord(record) });
  } catch (error) {
    next(error);
  }
});
router.patch("/dentalrecords/treatment-records/:id", authorize("admin", "staff", "dentist"), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Invalid treatment record ID." });
    const record = await DentalRecord.findById(req.params.id);

    if (!record || !treatmentRecordHasContent(record)) return res.status(404).json({ message: "Treatment record not found." });

    const isOwner = String(record.createdBy || "") === String(req.user.id) || String(record.createdByEmail || "").toLowerCase() === String(req.user.email || "").toLowerCase();
    if (!isOwner) return res.status(403).json({ message: "Only the original provider can edit this treatment record." });

    record.visitDate = req.body.visitDate ? parseReportDate(req.body.visitDate) || record.visitDate : record.visitDate;
    record.procedure = String(req.body.procedure || record.procedure || "").trim();
    record.servicePerformed = String(req.body.procedure || req.body.servicePerformed || record.servicePerformed || "").trim();
    record.toothNumber = String(req.body.toothNumber || "").trim();
    record.diagnosis = String(req.body.diagnosis || "").trim();
    record.treatment = String(req.body.treatmentPerformed || req.body.treatmentDescription || "").trim();
    record.treatmentPerformed = String(req.body.treatmentPerformed || req.body.treatmentDescription || "").trim();
    record.materialsUsed = String(req.body.materialsUsed || "").trim();
    record.treatmentStatus = ["completed", "in_progress", "cancelled", "follow_up_required"].includes(req.body.treatmentStatus) ? req.body.treatmentStatus : record.treatmentStatus || "completed";
    record.recommendations = String(req.body.recommendations || req.body.followUpNotes || "").trim();
    record.nextVisitRecommendation = String(req.body.nextVisitRecommendation || req.body.followUpNotes || "").trim();
    record.notes = String(req.body.notes || "").trim();
    await record.save();

    await auditTreatmentRecordAction(req, record, "Treatment Record Updated");
    res.json({ message: "Treatment record updated successfully.", data: sanitizeTreatmentRecord(record) });
  } catch (error) {
    next(error);
  }
});
router.post("/dentalrecords/treatment-records/export", authorize("admin", "staff", "dentist"), async (req, res, next) => {
  try {
    await AuditLog.create({
      action: "Treatment Record Exported",
      entityType: "Treatment Records",
      performedBy: req.user.id,
      performedByEmail: req.user.email,
      metadata: {
        userName: providerName(req.user),
        filters: req.body?.filters || {},
      },
    });
    res.json({ message: "Treatment records export logged." });
  } catch (error) {
    next(error);
  }
});
router.get("/dentalrecords/my", authorize("patient"), async (req, res, next) => {
  try {
    const patient = await Patient.findOne({ userId: req.user.id });

    if (!patient) {
      return res.json({
        data: [],
        appointments: [],
        patient: null,
      });
    }

    const [records, appointments] = await Promise.all([
      DentalRecord.find({
        $or: [
          { patient: patient._id },
          { patientName: [patient.firstName, patient.lastName].filter(Boolean).join(" ") },
        ],
      }).sort({ visitDate: -1, createdAt: -1 }),
      Appointment.find({
        $or: [
          { patient: patient._id },
          { email: patient.email },
          { patientName: [patient.firstName, patient.lastName].filter(Boolean).join(" ") },
        ],
      }).sort({ appointmentDate: -1, createdAt: -1 }),
    ]);

    res.json({
      data: records.map(sanitizePatientDentalRecord),
      appointments,
      patient,
    });
  } catch (error) {
    next(error);
  }
});
router.use("/dentalrecords", authorize("admin", "staff", "dentist"), createCrudRouter(DentalRecord));
router.get("/inventory", authorize("admin", "staff", "dentist"), inventoryListHandler);
router.post("/inventory/:id/usage", authorize("admin", "staff", "dentist"), inventoryUsageHandler);
router.post("/inventory/:id/sale", authorize("admin", "staff", "dentist"), inventorySaleHandler);
router.post("/inventory/:id/adjust", authorize("admin"), inventoryAdjustmentHandler);
router.use(
  "/inventory",
  authorize("admin"),
  createCrudRouter(Inventory, {
    defaultSort: { itemName: 1 },
    beforeCreate: (body) => ({
      ...body,
      costPrice: Number(body.costPrice ?? body.purchasePrice ?? 0) || 0,
      expirationDate: body.expirationDate || undefined,
      isActive: body.isActive ?? true,
      requiresPrescription: Boolean(body.requiresPrescription),
      sellingPrice: Number(body.sellingPrice ?? 0) || 0,
      status: toStockStatus(body),
      transactionHistory: [
        {
          type: "initial_stock",
          quantityBefore: 0,
          quantityChanged: Number(body.quantity || 0),
          quantityAfter: Number(body.quantity || 0),
          unitPrice: Number(body.sellingPrice ?? 0) || 0,
          notes: "Initial stock entry",
          recordedAt: new Date(),
        },
      ],
    }),
    beforeUpdate: async (body, req) => {
      const existing = await Inventory.findById(req.params.id).lean();
      const merged = { ...existing, ...body };

      return {
        ...body,
        costPrice: body.costPrice === undefined ? undefined : Number(body.costPrice) || 0,
        sellingPrice: body.sellingPrice === undefined ? undefined : Number(body.sellingPrice) || 0,
        requiresPrescription: body.requiresPrescription === undefined ? undefined : Boolean(body.requiresPrescription),
        status: toStockStatus(merged),
      };
    },
  }),
);
router.use("/feedback", authorize("admin", "staff", "dentist"), createCrudRouter(Feedback));
router.get("/promotions", authorize("admin", "staff", "dentist", "patient"), async (req, res, next) => {
  try {
    await expirePromotions();
    const now = new Date();
    const query = req.user.role === "admin"
      ? {}
      : {
          status: "active",
          $or: [
            { endDate: { $exists: false } },
            { endDate: null },
            { endDate: { $gte: now } },
          ],
        };
    const promotions = await Promotion.find(query).sort({ endDate: 1, createdAt: -1 });

    res.json({
      data: promotions,
      pagination: {
        page: 1,
        limit: promotions.length,
        total: promotions.length,
        pages: 1,
      },
    });
  } catch (error) {
    next(error);
  }
});
router.use(
  "/promotions",
  authorize("admin"),
  createCrudRouter(Promotion, {
    beforeCreate: normalizePromotionBody,
    beforeUpdate: normalizePromotionBody,
    afterCreate: notifyUsersOfPromotion,
  }),
);
router.use("/notifications", authorize("admin", "staff", "dentist", "patient"), createCrudRouter(Notification));
router.use("/subscribers", authorize("admin"), createCrudRouter(Subscriber));
router.use(
  "/audit-logs",
  authorize("admin"),
  createCrudRouter(AuditLog, {
    defaultSort: { createdAt: -1 },
    beforeCreate: (body, req) => ({
      ...body,
      performedBy: req.user.id,
      performedByEmail: req.user.email,
    }),
  }),
);
router.use(
  "/clinic-settings",
  authorize("admin"),
  createCrudRouter(ClinicSettings, {
    beforeCreate: normalizeClinicSettingsBody,
    beforeUpdate: normalizeClinicSettingsBody,
  }),
);

module.exports = router;
