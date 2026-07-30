const path = require("path");
const dotenv = require("dotenv");
const http = require("http");
const { Server } = require("socket.io");

dotenv.config({ path: path.resolve(__dirname, ".env") });

const app = require("./app");
const connectDatabase = require("./config/database");
const seedAdmin = require("./scripts/seedAdmin");
const { startAppointmentExpiryMonitor } = require("./utils/appointmentExpiry");
const { registerSocketServer } = require("./utils/messagingSocket");
const { startPromotionExpiryMonitor } = require("./utils/promotionExpiry");

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDatabase();
    await seedAdmin();
    startAppointmentExpiryMonitor();
    startPromotionExpiryMonitor();

    const server = http.createServer(app);
    const io = new Server(server, {
      cors: {
        origin: process.env.CLIENT_URL || "*",
        methods: ["GET", "POST"],
      },
    });
    registerSocketServer(io);

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();
