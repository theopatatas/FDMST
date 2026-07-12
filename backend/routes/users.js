const express = require("express");
const mongoose = require("mongoose");

const User = require("../models/User");
const Patient = require("../models/Patient");
const AuditLog = require("../models/AuditLog");
const Notification = require("../models/Notification");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate, authorize } = require("../middleware/auth");
const { hashPasswordScrypt, verifyPassword } = require("../utils/password");
const { MOBILE_NUMBER_MESSAGE, isValidMobileNumber, normalizeMobileNumber } = require("../utils/validation");

const router = express.Router();

const sanitizeStaffUser = (user) => ({
  id: user._id,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  role: user.role,
  accountStatus: user.accountStatus,
  contactNumber: user.contactNumber,
  profilePhoto: user.profilePhoto,
  status: user.status,
  createdAt: user.createdAt,
});

const sanitizeUser = (user) => ({
  id: user._id,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  username: user.username,
  role: user.role,
  accountStatus: user.accountStatus,
  contactNumber: user.contactNumber,
  profilePhoto: user.profilePhoto,
  recoveryEmail: user.recoveryEmail,
  lastLoginAt: user.lastLoginAt,
  lastPasswordChangedAt: user.lastPasswordChangedAt,
  failedLoginAttempts: user.failedLoginAttempts || 0,
  totalLogins: user.totalLogins || 0,
  status: user.status,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const sanitizePatientProfile = (patient) => patient && ({
  id: patient._id,
  patientId: patient.patientId,
  dateOfBirth: patient.dateOfBirth,
  gender: patient.gender,
  address: patient.address,
  emergencyContactName: patient.emergencyContactName,
  emergencyContactNumber: patient.emergencyContactNumber,
  allergies: patient.allergies,
  medicalHistory: patient.medicalHistory,
  dentalHistory: patient.dentalHistory,
  registrationStatus: patient.registrationStatus,
});

const sanitizeNotification = (notification) => ({
  id: notification._id,
  title: notification.title,
  message: notification.message,
  type: notification.type,
  isRead: notification.isRead,
  scheduledFor: notification.scheduledFor,
  metadata: notification.metadata || {},
  createdAt: notification.createdAt,
});

const isValidProfilePhoto = (profilePhoto) =>
  !profilePhoto ||
  (/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(profilePhoto) &&
    profilePhoto.length <= 750000);

const verifyAdminPasswordForAction = async (adminId, adminPassword) => {
  if (!adminPassword) {
    return {
      ok: false,
      status: 400,
      message: "Admin password is required to complete this action.",
    };
  }

  const admin = await User.findById(adminId).select("+passwordHash");

  if (!admin || admin.role !== "admin") {
    return {
      ok: false,
      status: 403,
      message: "Only an authenticated admin can perform this action.",
    };
  }

  const isAdminPasswordValid = await verifyPassword(adminPassword, admin.passwordHash);

  if (!isAdminPasswordValid) {
    return {
      ok: false,
      status: 401,
      message: "Admin password is incorrect. No changes were saved.",
    };
  }

  return { ok: true, admin };
};

const logStaffAudit = async ({ action, admin, staffUser, metadata = {} }) => {
  await AuditLog.create({
    action,
    entityType: "User",
    entityId: staffUser._id,
    performedBy: admin._id,
    performedByEmail: admin.email,
    metadata: {
      staffEmail: staffUser.email,
      staffRole: staffUser.role,
      ...metadata,
    },
  });
};

router.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select("-passwordHash");

    if (!user) {
      return res.status(404).json({ message: "Profile not found." });
    }

    const patient = user.role === "patient"
      ? await Patient.findOne({ userId: user._id })
      : null;
    const recentActivity = user.role === "admin"
      ? await AuditLog.find({ performedBy: user._id })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("action entityType metadata createdAt")
        .lean()
      : [];

    res.json({
      user: {
        ...sanitizeUser(user),
        patient: sanitizePatientProfile(patient),
        recentActivity,
      },
    });
  }),
);

router.get(
  "/me/notifications",
  authenticate,
  asyncHandler(async (req, res) => {
    const patient = await Patient.findOne({ userId: req.user.id }).select("_id");
    const filters = [{ user: req.user.id }];

    if (patient) {
      filters.push({ patient: patient._id });
    }

    const query = { $or: filters };
    const [notifications, unreadCount] = await Promise.all([
      Notification.find(query)
      .sort({ createdAt: -1 })
        .limit(10),
      Notification.countDocuments({ ...query, isRead: false }),
    ]);

    res.json({
      data: notifications.map(sanitizeNotification),
      unreadCount,
    });
  }),
);

router.patch(
  "/me/notifications/read",
  authenticate,
  asyncHandler(async (req, res) => {
    const patient = await Patient.findOne({ userId: req.user.id }).select("_id");
    const filters = [{ user: req.user.id }];

    if (patient) {
      filters.push({ patient: patient._id });
    }

    await Notification.updateMany({ $or: filters, isRead: false }, { isRead: true });

    res.json({ message: "Notifications marked as read." });
  }),
);

router.patch(
  "/me/notifications/:id/read",
  authenticate,
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid notification." });
    }

    const patient = await Patient.findOne({ userId: req.user.id }).select("_id");
    const filters = [{ user: req.user.id }];

    if (patient) {
      filters.push({ patient: patient._id });
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, $or: filters },
      { isRead: true },
      { new: true },
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found." });
    }

    res.json({ data: sanitizeNotification(notification) });
  }),
);

router.patch(
  "/me/password",
  authenticate,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        message: "Current password, new password, and confirmation are required.",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        message: "New password must be at least 8 characters long.",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        message: "New password and confirmation do not match.",
      });
    }

    const user = await User.findById(req.user.id).select("+passwordHash");

    if (!user) {
      return res.status(404).json({ message: "Profile not found." });
    }

    const isCurrentPasswordValid = await verifyPassword(currentPassword, user.passwordHash);

    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        message: "Current password is incorrect.",
      });
    }

    user.passwordHash = await hashPasswordScrypt(newPassword);
    await user.save();

    res.json({ message: "Password updated successfully." });
  }),
);

router.patch(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const {
      firstName,
      lastName,
      email,
      contactNumber,
      profilePhoto,
      recoveryEmail,
      currentPassword,
      newPassword,
      confirmPassword,
    } = req.body;

    if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) {
      return res.status(400).json({
        message: "First name, last name, and email are required.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({
      email: normalizedEmail,
      _id: { $ne: req.user.id },
    });

    if (existingUser) {
      return res.status(409).json({
        message: "An account with this email already exists.",
      });
    }

    if (!isValidProfilePhoto(profilePhoto)) {
      return res.status(400).json({
        message: "Profile photo must be a PNG, JPG, or WebP image under 550 KB.",
      });
    }

    if (!isValidMobileNumber(contactNumber)) {
      return res.status(400).json({
        message: MOBILE_NUMBER_MESSAGE,
        errors: { contactNumber: MOBILE_NUMBER_MESSAGE },
      });
    }

    if (recoveryEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(recoveryEmail).trim())) {
      return res.status(400).json({
        message: "Enter a valid recovery email address.",
        errors: { recoveryEmail: "Enter a valid recovery email address." },
      });
    }

    const user = await User.findById(req.user.id).select("+passwordHash");

    if (!user) {
      return res.status(404).json({ message: "Profile not found." });
    }

    if (newPassword || currentPassword || confirmPassword) {
      if (!currentPassword || !newPassword || !confirmPassword) {
        return res.status(400).json({
          message: "Current password, new password, and confirmation are required.",
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          message: "New password must be at least 8 characters long.",
        });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({
          message: "New password and confirmation do not match.",
        });
      }

      const isCurrentPasswordValid = await verifyPassword(currentPassword, user.passwordHash);

      if (!isCurrentPasswordValid) {
        return res.status(401).json({
          message: "Current password is incorrect.",
        });
      }

      user.passwordHash = await hashPasswordScrypt(newPassword);
      user.lastPasswordChangedAt = new Date();
    }

    user.firstName = firstName.trim();
    user.lastName = lastName.trim();
    user.email = normalizedEmail;
    user.contactNumber = normalizeMobileNumber(contactNumber);
    user.profilePhoto = profilePhoto || "";

    if (user.role === "admin") {
      user.recoveryEmail = recoveryEmail ? String(recoveryEmail).trim().toLowerCase() : "";
    }

    await user.save();

    if (user.role === "patient") {
      await Patient.findOneAndUpdate(
        { userId: user._id },
        {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          contactNumber: user.contactNumber,
        },
      );
    }

    const patient = user.role === "patient"
      ? await Patient.findOne({ userId: user._id })
      : null;

    res.json({
      message: "Profile updated successfully.",
      user: {
        ...sanitizeUser(user),
        patient: sanitizePatientProfile(patient),
      },
    });
  }),
);

router.get(
  "/staff",
  authenticate,
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const staff = await User.find({ role: { $in: ["staff", "dentist"] } })
      .sort({ createdAt: -1 })
      .select("-passwordHash");

    res.json({
      data: staff.map(sanitizeStaffUser),
    });
  }),
);

router.post(
  "/admin/verify-password",
  authenticate,
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const { adminPassword } = req.body;
    const adminVerification = await verifyAdminPasswordForAction(req.user.id, adminPassword);

    if (!adminVerification.ok) {
      return res.status(adminVerification.status).json({
        message: adminVerification.message,
      });
    }

    res.json({
      message: "Admin password verified.",
    });
  }),
);

router.post(
  "/staff",
  authenticate,
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const { firstName, lastName, email, password, role, contactNumber, adminPassword } = req.body;

    if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !password || !adminPassword) {
      return res.status(400).json({
        message: "First name, last name, email, temporary password, and admin password are required.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters long.",
      });
    }

    if (!isValidMobileNumber(contactNumber)) {
      return res.status(400).json({
        message: MOBILE_NUMBER_MESSAGE,
        errors: { contactNumber: MOBILE_NUMBER_MESSAGE },
      });
    }

    const staffRole = role === "dentist" ? "dentist" : "staff";
    const normalizedEmail = email.trim().toLowerCase();
    const adminVerification = await verifyAdminPasswordForAction(req.user.id, adminPassword);

    if (!adminVerification.ok) {
      return res.status(adminVerification.status).json({
        message: adminVerification.message,
      });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(409).json({
        message: "An account with this email already exists.",
      });
    }

    const passwordHash = await hashPasswordScrypt(password);

    const user = await User.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: normalizedEmail,
      contactNumber: normalizeMobileNumber(contactNumber),
      passwordHash,
      role: staffRole,
      accountStatus: "active_staff",
      status: "active",
    });

    await logStaffAudit({
      action: "staff_created",
      admin: adminVerification.admin,
      staffUser: user,
    });

    res.status(201).json({
      message: "Staff account created successfully.",
      user: sanitizeStaffUser(user),
    });
  }),
);

router.patch(
  "/staff/:id",
  authenticate,
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { firstName, lastName, email, role, contactNumber, adminPassword } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid staff account ID." });
    }

    if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) {
      return res.status(400).json({
        message: "First name, last name, and email are required.",
      });
    }

    if (!isValidMobileNumber(contactNumber)) {
      return res.status(400).json({
        message: MOBILE_NUMBER_MESSAGE,
        errors: { contactNumber: MOBILE_NUMBER_MESSAGE },
      });
    }

    const adminVerification = await verifyAdminPasswordForAction(req.user.id, adminPassword);

    if (!adminVerification.ok) {
      return res.status(adminVerification.status).json({
        message: adminVerification.message,
      });
    }

    const staffUser = await User.findOne({
      _id: id,
      role: { $in: ["staff", "dentist"] },
    });

    if (!staffUser) {
      return res.status(404).json({ message: "Staff account not found." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({
      email: normalizedEmail,
      _id: { $ne: staffUser._id },
    });

    if (existingUser) {
      return res.status(409).json({
        message: "An account with this email already exists.",
      });
    }

    const previousValues = {
      firstName: staffUser.firstName,
      lastName: staffUser.lastName,
      email: staffUser.email,
      role: staffUser.role,
      contactNumber: staffUser.contactNumber,
    };

    staffUser.firstName = firstName.trim();
    staffUser.lastName = lastName.trim();
    staffUser.email = normalizedEmail;
    staffUser.role = role === "dentist" ? "dentist" : "staff";
    staffUser.contactNumber = normalizeMobileNumber(contactNumber);
    staffUser.accountStatus = "active_staff";

    await staffUser.save();

    await logStaffAudit({
      action: "staff_updated",
      admin: adminVerification.admin,
      staffUser,
      metadata: { previousValues },
    });

    res.json({
      message: "Staff account updated successfully.",
      user: sanitizeStaffUser(staffUser),
    });
  }),
);

router.patch(
  "/staff/:id/status",
  authenticate,
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, adminPassword } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid staff account ID." });
    }

    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({ message: "Status must be active or inactive." });
    }

    const adminVerification = await verifyAdminPasswordForAction(req.user.id, adminPassword);

    if (!adminVerification.ok) {
      return res.status(adminVerification.status).json({
        message: adminVerification.message,
      });
    }

    const staffUser = await User.findOne({
      _id: id,
      role: { $in: ["staff", "dentist"] },
    });

    if (!staffUser) {
      return res.status(404).json({ message: "Staff account not found." });
    }

    const previousStatus = staffUser.status;
    staffUser.status = status;
    await staffUser.save();

    await logStaffAudit({
      action: status === "active" ? "staff_activated" : "staff_deactivated",
      admin: adminVerification.admin,
      staffUser,
      metadata: { previousStatus, newStatus: status },
    });

    res.json({
      message: `Staff account ${status === "active" ? "activated" : "deactivated"} successfully.`,
      user: sanitizeStaffUser(staffUser),
    });
  }),
);

module.exports = router;
