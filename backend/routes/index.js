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

const normalizePromotionBody = (body = {}, req) => {
  const title = body.title?.trim();

  if (!title) {
    const error = new Error("Promotion title is required.");
    error.status = 400;
    error.errors = { title: "Promotion title is required." };
    throw error;
  }

  const startDate = body.startDate ? new Date(body.startDate) : undefined;
  const endDate = body.endDate ? new Date(body.endDate) : undefined;

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

  return {
    title,
    description: body.description?.trim() || "",
    imageUrl: validatePromotionImage(body.imageUrl),
    serviceType: body.serviceType?.trim() || "",
    promoCode: body.promoCode?.trim() || undefined,
    discountLabel: body.discountLabel?.trim() || "",
    audience: body.audience || "all",
    status: body.status || "active",
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

  const detail = promotion.description || promotion.discountLabel || "A new clinic promotion is now available.";

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
      data: records,
      appointments,
      patient,
    });
  } catch (error) {
    next(error);
  }
});
router.use("/dentalrecords", authorize("admin", "staff", "dentist"), createCrudRouter(DentalRecord));
router.use(
  "/inventory",
  authorize("admin", "staff", "dentist"),
  createCrudRouter(Inventory, {
    defaultSort: { itemName: 1 },
    beforeCreate: (body) => ({
      ...body,
      status: toStockStatus(body),
    }),
    beforeUpdate: async (body, req) => {
      const existing = await Inventory.findById(req.params.id).lean();
      const merged = { ...existing, ...body };

      return {
        ...body,
        status: toStockStatus(merged),
      };
    },
  }),
);
router.use("/feedback", authorize("admin", "staff", "dentist"), createCrudRouter(Feedback));
router.get("/promotions", authorize("admin", "staff", "dentist", "patient"), async (req, res, next) => {
  try {
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
router.use("/clinic-settings", authorize("admin"), createCrudRouter(ClinicSettings));

module.exports = router;
