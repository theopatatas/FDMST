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
const { verifyPassword } = require("../utils/password");
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
router.use(
  "/patients",
  authorize("admin", "staff", "dentist"),
  createCrudRouter(Patient, {
    beforeCreate: async (body, req) => {
      await verifyAdminPasswordForPatientAction(req);
      return preparePatientCreateBody(withoutAdminPassword(body));
    },
    beforeUpdate: async (body, req) => {
      await verifyAdminPasswordForPatientAction(req);
      const existingPatient = await Patient.findById(req.params.id).lean();
      return preparePatientUpdateBody(
        { ...existingPatient, ...withoutAdminPassword(body) },
        { excludePatientId: req.params.id, excludeUserId: existingPatient?.userId },
      );
    },
    beforeDelete: async (id, req) => {
      await verifyAdminPasswordForPatientAction(req);
    },
  }),
);
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
