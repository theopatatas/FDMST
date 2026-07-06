const express = require("express");
const jwt = require("jsonwebtoken");

const Patient = require("../models/Patient");
const User = require("../models/User");
const { getJwtExpiresIn, getJwtSecret } = require("../config/auth");
const asyncHandler = require("../utils/asyncHandler");
const { hashPasswordScrypt, verifyPassword } = require("../utils/password");
const { MOBILE_NUMBER_MESSAGE, isValidMobileNumber, normalizeMobileNumber } = require("../utils/validation");

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
  registrationStatus: patient.registrationStatus,
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

const generatePatientId = async () => {
  const year = new Date().getFullYear();
  const prefix = `FDMST-${year}-`;
  const latestPatient = await Patient.findOne({
    patientId: { $regex: `^${prefix}` },
  })
    .sort({ patientId: -1 })
    .select("patientId");

  const latestNumber = latestPatient?.patientId
    ? Number(latestPatient.patientId.replace(prefix, ""))
    : 0;

  return `${prefix}${String(latestNumber + 1).padStart(5, "0")}`;
};

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { firstName, lastName, email, username, contactNumber, dateOfBirth, password } = req.body;

    if (!firstName || !lastName || !email || !dateOfBirth || !password) {
      return res.status(400).json({
        message: "First name, last name, email, birth date, and password are required.",
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

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = username?.trim();
    const normalizedContactNumber = normalizeMobileNumber(contactNumber);

    const duplicateFilters = [{ email: normalizedEmail }];

    if (normalizedUsername) {
      duplicateFilters.push({ username: normalizedUsername });
    }

    const existingUser = await User.findOne({ $or: duplicateFilters });

    if (existingUser) {
      return res.status(409).json({
        message:
          existingUser.email === normalizedEmail
            ? "An account with this email already exists."
            : "This username is already taken.",
      });
    }

    const passwordHash = await hashPasswordScrypt(password);
    const patientId = await generatePatientId();

    const user = await User.create({
      firstName,
      lastName,
      email: normalizedEmail,
      username: normalizedUsername || undefined,
      contactNumber: normalizedContactNumber,
      passwordHash,
      role: "patient",
      accountStatus: "unverified_user",
      status: "active",
    });

    const patient = await Patient.create({
      userId: user._id,
      patientId,
      firstName,
      lastName,
      email: normalizedEmail,
      contactNumber: normalizedContactNumber,
      dateOfBirth,
      registrationStatus: "unverified",
    });

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

    res.json({
      message: "Login successful.",
      token,
      user: sanitizeUser(user),
    });
  }),
);

module.exports = router;
