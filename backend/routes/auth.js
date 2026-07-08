const express = require("express");
const jwt = require("jsonwebtoken");

const AuditLog = require("../models/AuditLog");
const Patient = require("../models/Patient");
const User = require("../models/User");
const { getJwtExpiresIn, getJwtSecret } = require("../config/auth");
const { authenticate } = require("../middleware/auth");
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
  gender: patient.gender,
  address: patient.address,
  medicalHistory: patient.medicalHistory,
  dentalHistory: patient.dentalHistory,
  registrationStatus: patient.registrationStatus,
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

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const {
      firstName,
      lastName,
      email,
      username,
      contactNumber,
      dateOfBirth,
      gender,
      address,
      allergies,
      medicalHistory,
      dentalHistory,
      password,
      confirmPassword,
    } = req.body;

    if (!firstName || !lastName || !email || !contactNumber || !dateOfBirth || !password) {
      return res.status(400).json({
        message: "First name, last name, email, mobile number, birth date, and password are required.",
      });
    }

    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({
        message: "Passwords do not match.",
        errors: { confirmPassword: "Passwords do not match." },
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters long.",
        errors: { password: "Password must be at least 8 characters long." },
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
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
      return res.status(409).json({
        message:
          existingUser.email === normalizedEmail
            ? "An account with this email already exists."
            : existingUser.contactNumber === normalizedContactNumber
              ? "An account with this mobile number already exists."
            : "This username is already taken.",
        errors:
          existingUser.email === normalizedEmail
            ? { email: "This email is already registered." }
            : existingUser.contactNumber === normalizedContactNumber
              ? { contactNumber: "This mobile number is already registered." }
              : { username: "This username is already taken." },
      });
    }

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

    res.status(201).json({
      message: "Registration successful.",
      user: sanitizeUser(user),
      patient: sanitizePatient(patient),
    });
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
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    if (user.status === "inactive") {
      return res.status(403).json({
        message: "This account is deactivated. Please contact the clinic.",
      });
    }

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
