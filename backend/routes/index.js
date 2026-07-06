const express = require("express");

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
const { verifyPassword } = require("../utils/password");

const router = express.Router();

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
      return withoutAdminPassword(body);
    },
    beforeUpdate: async (body, req) => {
      await verifyAdminPasswordForPatientAction(req);
      return withoutAdminPassword(body);
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
    const promotions = await Promotion.find({
      status: "active",
      audience: { $in: ["all", "current_patients"] },
    }).sort({ endDate: 1, createdAt: -1 });

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
router.use("/promotions", authorize("admin"), createCrudRouter(Promotion));
router.use("/notifications", authorize("admin", "staff", "dentist", "patient"), createCrudRouter(Notification));
router.use("/subscribers", authorize("admin"), createCrudRouter(Subscriber));
router.use("/clinic-settings", authorize("admin"), createCrudRouter(ClinicSettings));

module.exports = router;
