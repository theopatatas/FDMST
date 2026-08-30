const express = require("express");

const asyncHandler = require("../utils/asyncHandler");
const { authenticate } = require("../middleware/auth");
const { uploadImageToSupabase } = require("../services/supabaseStorageService");

const router = express.Router();
const allowedFolders = new Set(["profiles", "clinic", "promotions", "patients", "inventory", "general"]);

router.post(
  "/image",
  authenticate,
  asyncHandler(async (req, res) => {
    const folder = allowedFolders.has(String(req.body.folder || "").trim())
      ? String(req.body.folder).trim()
      : "general";
    const maxSizeBytes = Math.min(Number(req.body.maxSizeBytes) || 1024 * 1024, 2 * 1024 * 1024);
    const result = await uploadImageToSupabase({
      imageData: req.body.imageData,
      folder,
      fileName: req.body.fileName,
      maxSizeBytes,
    });

    res.status(201).json({
      message: "Image uploaded successfully.",
      data: result,
    });
  }),
);

module.exports = router;
