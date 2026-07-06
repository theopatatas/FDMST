const mongoose = require("mongoose");

const clinicSettingsSchema = new mongoose.Schema(
  {
    clinicName: {
      type: String,
      trim: true,
      default: "Flores-Dizon Dental Clinic",
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    contactNumber: {
      type: String,
      trim: true,
      default: "",
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    operatingHours: {
      type: String,
      trim: true,
      default: "Monday to Saturday, 9:00 AM - 6:00 PM",
    },
    appointmentReminders: {
      type: Boolean,
      default: true,
    },
    inventoryAlerts: {
      type: Boolean,
      default: true,
    },
    requireAdminPasswordForStaff: {
      type: Boolean,
      default: true,
    },
  },
  {
    collection: "clinic_settings",
    timestamps: true,
  },
);

module.exports = mongoose.model("ClinicSettings", clinicSettingsSchema);
