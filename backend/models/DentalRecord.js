const mongoose = require("mongoose");

const dentalRecordSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
    },
    appointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment",
    },
    patientName: {
      type: String,
      trim: true,
      required: true,
    },
    noteType: {
      type: String,
      trim: true,
      default: "Clinical Note",
    },
    visitDate: {
      type: Date,
      default: Date.now,
    },
    diagnosis: {
      type: String,
      trim: true,
    },
    chiefComplaint: {
      type: String,
      trim: true,
    },
    treatment: {
      type: String,
      trim: true,
    },
    servicePerformed: {
      type: String,
      trim: true,
    },
    treatmentPerformed: {
      type: String,
      trim: true,
    },
    treatmentStatus: {
      type: String,
      enum: ["completed", "in_progress", "cancelled", "follow_up_required"],
      default: "completed",
    },
    materialsUsed: {
      type: String,
      trim: true,
    },
    recommendations: {
      type: String,
      trim: true,
    },
    nextVisitRecommendation: {
      type: String,
      trim: true,
    },
    clinicalNotes: {
      observation: {
        type: String,
        trim: true,
      },
      assessment: {
        type: String,
        trim: true,
      },
      recommendations: {
        type: String,
        trim: true,
      },
      additionalNotes: {
        type: String,
        trim: true,
      },
    },
    procedure: {
      type: String,
      trim: true,
    },
    toothNumber: {
      type: String,
      trim: true,
    },
    medications: [String],
    dentistName: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    createdByName: {
      type: String,
      trim: true,
    },
    createdByEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    collection: "dentalrecords",
    timestamps: true,
  },
);

dentalRecordSchema.index({ createdBy: 1, visitDate: -1 });
dentalRecordSchema.index({ dentistName: 1, visitDate: -1 });
dentalRecordSchema.index({ patientName: 1, visitDate: -1 });

module.exports = mongoose.model("DentalRecord", dentalRecordSchema);
