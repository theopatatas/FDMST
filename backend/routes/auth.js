const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const AuditLog = require("../models/AuditLog");
const OtpToken = require("../models/OtpToken");
const Patient = require("../models/Patient");
const User = require("../models/User");
const { getJwtExpiresIn, getJwtSecret } = require("../config/auth");
const { authenticate } = require("../middleware/auth");
const { sendOtpEmail } = require("../services/mailService");
const asyncHandler = require("../utils/asyncHandler");
const { preparePatientCreateBody } = require("../utils/patientRecords");
const { hashPasswordScrypt, verifyPassword } = require("../utils/password");
const { normalizeMobileNumber } = require("../utils/validation");

const router = express.Router();

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
  status: user.status,
  createdAt: user.createdAt,
});

const sanitizePatient = (patient) => ({
  id: patient._id,
  userId: patient.userId,
  patientId: patient.patientId,
  firstName: patient.firstName,
  lastName: patient.lastName,
  email: patient.email,
  contactNumber: patient.contactNumber,
  dateOfBirth: patient.dateOfBirth,
  guardianName: patient.guardianName,
  guardianRelationship: patient.guardianRelationship,
  guardianContactNumber: patient.guardianContactNumber,
  guardianEmail: patient.guardianEmail,
  guardianAddress: patient.guardianAddress,
  gender: patient.gender,
  address: patient.address,
  medicalHistory: patient.medicalHistory,
  dentalHistory: patient.dentalHistory,
  registrationStatus: patient.registrationStatus,
  preferredDentist: patient.preferredDentist,
  preferredDentistName: patient.preferredDentistName,
  status: patient.status,
  createdAt: patient.createdAt,
});

const createAuthToken = (user) =>
  jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    },
    getJwtSecret(),
    { expiresIn: getJwtExpiresIn() },
  );

const getRequestIp = (req) =>
  String(req.headers["x-forwarded-for"] || req.ip || req.socket?.remoteAddress || "")
    .split(",")[0]
    .trim() || "Unknown";

const getBrowser = (userAgent = "") => {
  if (/edg/i.test(userAgent)) return "Microsoft Edge";
  if (/chrome|crios/i.test(userAgent)) return "Chrome";
  if (/safari/i.test(userAgent) && !/chrome|crios/i.test(userAgent)) return "Safari";
  if (/firefox/i.test(userAgent)) return "Firefox";
  return "Unknown Browser";
};

const getDevice = (userAgent = "") => {
  if (/iphone|ipad|android|mobile/i.test(userAgent)) return "Mobile Device";
  if (/mac/i.test(userAgent)) return "macOS";
  if (/windows/i.test(userAgent)) return "Windows";
  if (/linux/i.test(userAgent)) return "Linux";
  return "Unknown Device";
};

const recordLoginHistory = async (user, req, status) => {
  if (!user) return;

  const userAgent = String(req.headers["user-agent"] || "");
  user.loginHistory = [
    {
      ipAddress: getRequestIp(req),
      device: getDevice(userAgent),
      browser: getBrowser(userAgent),
      status,
      recordedAt: new Date(),
    },
    ...(user.loginHistory || []),
  ].slice(0, 25);

  if (status === "Successful") {
    user.lastLoginAt = new Date();
    user.totalLogins = Number(user.totalLogins || 0) + 1;
    user.failedLoginAttempts = 0;
  } else {
    user.failedLoginAttempts = Number(user.failedLoginAttempts || 0) + 1;
  }

  await user.save();
};

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const generateOtp = () => String(crypto.randomInt(100000, 1000000));

const hashOtp = (email, purpose, otp) =>
  crypto
    .createHash("sha256")
    .update(`${normalizeEmail(email)}:${purpose}:${otp}:${getJwtSecret()}`)
    .digest("hex");

const createOtpToken = async ({ email, purpose, payload = {} }) => {
  const normalizedEmail = normalizeEmail(email);
  const otp = generateOtp();

  await OtpToken.updateMany(
    { email: normalizedEmail, purpose, consumedAt: { $exists: false } },
    { consumedAt: new Date() },
  );

  await OtpToken.create({
    email: normalizedEmail,
    purpose,
    otpHash: hashOtp(normalizedEmail, purpose, otp),
    payload,
    expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
  });

  await sendOtpEmail({ to: normalizedEmail, otp, purpose });
};

const verifyOtpToken = async ({ email, purpose, otp }) => {
  const normalizedEmail = normalizeEmail(email);
  const token = await OtpToken.findOne({
    email: normalizedEmail,
    purpose,
    consumedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (!token) {
    const error = new Error("OTP is invalid or has expired. Please request a new code.");
    error.status = 400;
    error.errors = { otp: "OTP is invalid or has expired." };
    throw error;
  }

  if (token.attempts >= OTP_MAX_ATTEMPTS) {
    token.consumedAt = new Date();
    await token.save();
    const error = new Error("Too many incorrect OTP attempts. Please request a new code.");
    error.status = 429;
    error.errors = { otp: "Too many incorrect attempts." };
    throw error;
  }

  if (token.otpHash !== hashOtp(normalizedEmail, purpose, String(otp || "").trim())) {
    token.attempts += 1;
    await token.save();
    const error = new Error("Incorrect OTP. Please check your email and try again.");
    error.status = 400;
    error.errors = { otp: "Incorrect OTP." };
    throw error;
  }

  token.consumedAt = new Date();
  await token.save();
  return token.payload || {};
};

const validateRegistrationPayload = async (body) => {
  const {
    firstName,
    lastName,
    email,
    username,
    contactNumber,
    dateOfBirth,
    gender,
    address,
    guardianName,
    guardianRelationship,
    guardianContactNumber,
    guardianEmail,
    guardianAddress,
    allergies,
    medicalHistory,
    dentalHistory,
    password,
    confirmPassword,
  } = body;

  if (!firstName || !lastName || !email || !contactNumber || !dateOfBirth || !password) {
    const error = new Error("First name, last name, email, mobile number, birth date, and password are required.");
    error.status = 400;
    throw error;
  }

  if (confirmPassword !== undefined && password !== confirmPassword) {
    const error = new Error("Passwords do not match.");
    error.status = 400;
    error.errors = { confirmPassword: "Passwords do not match." };
    throw error;
  }

  if (password.length < 8) {
    const error = new Error("Password must be at least 8 characters long.");
    error.status = 400;
    error.errors = { password: "Password must be at least 8 characters long." };
    throw error;
  }

  const normalizedEmail = normalizeEmail(email);
  const normalizedUsername = username?.trim();
  const normalizedContactNumber = normalizeMobileNumber(contactNumber);
  const patientPayload = await preparePatientCreateBody(
    {
      firstName,
      lastName,
      email: normalizedEmail,
      contactNumber: normalizedContactNumber,
      dateOfBirth,
      gender,
      address,
      guardianName,
      guardianRelationship,
      guardianContactNumber,
      guardianEmail,
      guardianAddress,
      allergies,
      medicalHistory,
      dentalHistory,
      registrationStatus: "unverified",
      status: "active",
    },
    { requireEmail: true, requireMobile: true, requireBirthDate: true },
  );
  const duplicateFilters = [{ email: normalizedEmail }, { contactNumber: normalizedContactNumber }];

  if (normalizedUsername) {
    duplicateFilters.push({ username: normalizedUsername });
  }

  const existingUser = await User.findOne({ $or: duplicateFilters });

  if (existingUser) {
    const error = new Error(
      existingUser.email === normalizedEmail
        ? "An account with this email already exists."
        : existingUser.contactNumber === normalizedContactNumber
          ? "An account with this mobile number already exists."
          : "This username is already taken.",
    );
    error.status = 409;
    error.errors = existingUser.email === normalizedEmail
      ? { email: "This email is already registered." }
      : existingUser.contactNumber === normalizedContactNumber
        ? { contactNumber: "This mobile number is already registered." }
        : { username: "This username is already taken." };
    throw error;
  }

  return {
    patientPayload,
    normalizedEmail,
    normalizedUsername,
    normalizedContactNumber,
    password,
  };
};

const createPatientAccount = async ({ patientPayload, normalizedEmail, normalizedUsername, normalizedContactNumber, password }) => {
  const passwordHash = await hashPasswordScrypt(password);
  const user = await User.create({
    firstName: patientPayload.firstName,
    lastName: patientPayload.lastName,
    email: normalizedEmail,
    username: normalizedUsername || undefined,
    contactNumber: normalizedContactNumber,
    passwordHash,
    role: "patient",
    accountStatus: "unverified_user",
    status: "active",
  });

  let patient;

  try {
    patient = await Patient.create({
      ...patientPayload,
      userId: user._id,
    });
  } catch (error) {
    await User.findByIdAndDelete(user._id).catch(() => {});
    throw error;
  }

  return { user, patient };
};

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const registration = await validateRegistrationPayload(req.body);

    await createOtpToken({
      email: registration.normalizedEmail,
      purpose: "registration",
      payload: {
        patientPayload: registration.patientPayload,
        normalizedEmail: registration.normalizedEmail,
        normalizedUsername: registration.normalizedUsername,
        normalizedContactNumber: registration.normalizedContactNumber,
        password: registration.password,
      },
    });

    res.status(202).json({
      message: "Verification code sent to your email.",
      email: registration.normalizedEmail,
    });
  }),
);

router.post(
  "/register/request-otp",
  asyncHandler(async (req, res) => {
    const registration = await validateRegistrationPayload(req.body);

    await createOtpToken({
      email: registration.normalizedEmail,
      purpose: "registration",
      payload: {
        patientPayload: registration.patientPayload,
        normalizedEmail: registration.normalizedEmail,
        normalizedUsername: registration.normalizedUsername,
        normalizedContactNumber: registration.normalizedContactNumber,
        password: registration.password,
      },
    });

    res.json({
      message: "Verification code sent to your email.",
      email: registration.normalizedEmail,
    });
  }),
);

router.post(
  "/register/verify-otp",
  asyncHandler(async (req, res) => {
    const payload = await verifyOtpToken({
      email: req.body.email,
      purpose: "registration",
      otp: req.body.otp,
    });
    await validateRegistrationPayload({
      ...payload.patientPayload,
      username: payload.normalizedUsername,
      password: payload.password,
      confirmPassword: payload.password,
    });
    const { user, patient } = await createPatientAccount(payload);

    res.status(201).json({
      message: "Registration successful.",
      user: sanitizeUser(user),
      patient: sanitizePatient(patient),
    });
  }),
);

router.post(
  "/forgot-password/request-otp",
  asyncHandler(async (req, res) => {
    const normalizedEmail = normalizeEmail(req.body.email);

    if (!normalizedEmail) {
      return res.status(400).json({ message: "Email address is required.", errors: { email: "Email address is required." } });
    }

    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({ message: "No account was found with this email address.", errors: { email: "No account found." } });
    }

    if (user.role !== "patient") {
      return res.status(403).json({
        message: "Email password reset is currently available for patient accounts only. Please contact the clinic administrator for staff account access.",
        errors: { email: "Email password reset is currently available for patient accounts only." },
      });
    }

    await createOtpToken({
      email: normalizedEmail,
      purpose: "password_reset",
      payload: { userId: user._id },
    });

    res.json({ message: "Password reset code sent to your email." });
  }),
);

router.post(
  "/forgot-password/reset",
  asyncHandler(async (req, res) => {
    const { email, otp, newPassword, confirmPassword } = req.body;

    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ message: "New password and confirmation are required." });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "New password and confirmation do not match.", errors: { confirmPassword: "Passwords do not match." } });
    }

    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      return res.status(400).json({
        message: "Password must be at least 8 characters and include uppercase, lowercase, and number.",
        errors: { newPassword: "Password must be at least 8 characters and include uppercase, lowercase, and number." },
      });
    }

    const payload = await verifyOtpToken({
      email,
      purpose: "password_reset",
      otp,
    });
    const user = await User.findById(payload.userId).select("+passwordHash");

    if (!user) {
      return res.status(404).json({ message: "Account not found." });
    }

    user.passwordHash = await hashPasswordScrypt(newPassword);
    user.lastPasswordChangedAt = new Date();
    await user.save();

    AuditLog.create({
      action: "Password Reset",
      entityType: "Authentication",
      entityId: user._id,
      performedBy: user._id,
      performedByEmail: user.email,
      metadata: { method: "email_otp" },
    }).catch(() => {});

    res.json({ message: "Password reset successful. You can now sign in with your new password." });
  }),
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).select("+passwordHash");

    if (!user || !user.passwordHash) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    const isValidPassword = await verifyPassword(password, user.passwordHash);

    if (!isValidPassword) {
      await recordLoginHistory(user, req, "Failed").catch(() => {});
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    if (user.status === "inactive") {
      return res.status(403).json({
        message: "This account is deactivated. Please contact the clinic.",
      });
    }

    if (!["admin", "staff", "patient"].includes(String(user.role || "").toLowerCase())) {
      return res.status(403).json({
        message: "This account role is no longer supported. Please contact the clinic administrator.",
      });
    }

    await recordLoginHistory(user, req, "Successful").catch(() => {});

    const token = createAuthToken(user);

    AuditLog.create({
      action: "Login",
      entityType: "Authentication",
      entityId: user._id,
      performedBy: user._id,
      performedByEmail: user.email,
      metadata: { role: user.role, status: "Success" },
    }).catch(() => {});

    res.json({
      message: "Login successful.",
      token,
      user: sanitizeUser(user),
    });
  }),
);

router.post(
  "/logout",
  authenticate,
  asyncHandler(async (req, res) => {
    AuditLog.create({
      action: "Logout",
      entityType: "Authentication",
      entityId: req.user.id,
      performedBy: req.user.id,
      performedByEmail: req.user.email,
      metadata: { role: req.user.role, status: "Success" },
    }).catch(() => {});

    res.json({ message: "Logout recorded." });
  }),
);

module.exports = router;
