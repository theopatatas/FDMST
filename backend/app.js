const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const mongoose = require("mongoose");

const apiRoutes = require("./routes");

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(morgan("dev"));

app.get("/", (req, res) => {
  res.json({
    message: "FDMST API is running",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

app.use("/api", apiRoutes);

app.use((req, res) => {
  res.status(404).json({
    message: "Route not found",
  });
});

app.use((error, req, res, next) => {
  console.error(`${req.method} ${req.originalUrl}`, error);

  if (error.name === "ValidationError") {
    const errors = Object.fromEntries(
      Object.entries(error.errors).map(([field, validationError]) => [
        field,
        validationError.message,
      ]),
    );

    return res.status(400).json({
      message: "Please review the highlighted fields.",
      errors,
    });
  }

  if (error.name === "CastError") {
    return res.status(400).json({
      message: "Invalid value provided. Please review your entry.",
      errors: {
        [error.path]: "Invalid value provided.",
      },
    });
  }

  res.status(error.status || 500).json({
    message: error.status ? error.message : "Something went wrong. Please try again.",
  });
});

module.exports = app;
