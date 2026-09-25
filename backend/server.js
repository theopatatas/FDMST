const path = require("path");
const dotenv = require("dotenv");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");

dotenv.config({ path: path.resolve(__dirname, ".env") });

const app = require("./app");
const connectDatabase = require("./config/database");
const { getAllowedOrigins, normalizeOrigin, validateEnvironment } = require("./config/environment");
const seedAdmin = require("./scripts/seedAdmin");
const { startAppointmentExpiryMonitor, stopAppointmentExpiryMonitor } = require("./utils/appointmentExpiry");
const { registerSocketServer } = require("./utils/messagingSocket");
const { startPromotionExpiryMonitor, stopPromotionExpiryMonitor } = require("./utils/promotionExpiry");

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";
let server;
let io;

const isSocketOriginAllowed = (origin) => {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (getAllowedOrigins().includes(normalized)) return true;
  return process.env.NODE_ENV !== "production"
    && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized);
};

const shutdown = (signal) => {
  console.log(`${signal} received. Shutting down gracefully.`);
  stopAppointmentExpiryMonitor();
  stopPromotionExpiryMonitor();
  io?.disconnectSockets(true);

  const forceExit = setTimeout(() => process.exit(1), 10000);
  forceExit.unref();

  const closeDatabase = async () => {
    await mongoose.disconnect().catch(() => {});
    clearTimeout(forceExit);
    process.exit(0);
  };

  if (server?.listening) server.close(closeDatabase);
  else closeDatabase();
};

const startServer = async () => {
  try {
    validateEnvironment();
    await connectDatabase();
    await seedAdmin();
    startAppointmentExpiryMonitor();
    startPromotionExpiryMonitor();

    server = http.createServer(app);
    io = new Server(server, {
      cors: {
        origin(origin, callback) {
          if (isSocketOriginAllowed(origin)) return callback(null, true);
          return callback(new Error("This origin is not allowed to connect."));
        },
        methods: ["GET", "POST"],
      },
    });
    registerSocketServer(io);

    server.listen(PORT, HOST, () => {
      console.log(`Server running on ${HOST}:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

startServer();
