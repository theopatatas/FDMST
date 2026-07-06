const mongoose = require("mongoose");

const inventorySchema = new mongoose.Schema(
  {
    itemName: {
      type: String,
      trim: true,
      required: [true, "Item name is required."],
    },
    category: {
      type: String,
      trim: true,
      required: [true, "Category is required."],
    },
    quantity: {
      type: Number,
      min: [0, "Quantity cannot be negative."],
      default: 0,
    },
    unit: {
      type: String,
      trim: true,
      required: [true, "Unit is required."],
      default: "pcs",
    },
    reorderLevel: {
      type: Number,
      min: [0, "Reorder level cannot be negative."],
      default: 0,
    },
    supplier: {
      type: String,
      trim: true,
    },
    purchasePrice: {
      type: Number,
      min: [0, "Purchase price cannot be negative."],
    },
    status: {
      type: String,
      enum: ["available", "low_stock", "out_of_stock"],
      default: "available",
    },
    notes: {
      type: String,
      trim: true,
    },
    usageHistory: [
      {
        quantity: {
          type: Number,
          default: 0,
        },
        note: {
          type: String,
          trim: true,
        },
        recordedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    collection: "inventory",
    timestamps: true,
  },
);

module.exports = mongoose.model("Inventory", inventorySchema);
