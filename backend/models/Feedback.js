const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema(
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
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },
    category: {
      type: String,
      enum: ["scheduling", "service_quality", "overall_experience"],
      default: "overall_experience",
    },
    comments: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["new", "reviewed", "resolved"],
      default: "new",
    },
  },
  {
    collection: "feedback",
    timestamps: true,
  },
);

module.exports = mongoose.model("Feedback", feedbackSchema);
