const mongoose = require("mongoose");

const patientSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    patientId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    firstName: {
      type: String,
      trim: true,
      required: true,
    },
    middleName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
      required: true,
    },
    dateOfBirth: Date,
    registrationStatus: {
      type: String,
      enum: ["unverified", "verified"],
      default: "unverified",
    },
    gender: {
      type: String,
      enum: ["male", "female", "other", "prefer_not_to_say"],
    },
    contactNumber: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    address: {
      type: String,
      trim: true,
    },
    emergencyContactName: {
      type: String,
      trim: true,
    },
    emergencyContactNumber: {
      type: String,
      trim: true,
    },
    allergies: [String],
    medicalHistory: {
      type: String,
      trim: true,
    },
    dentalHistory: {
      type: String,
      trim: true,
    },
    billingNotes: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  {
    collection: "patients",
    timestamps: true,
  },
);

module.exports = mongoose.model("Patient", patientSchema);
