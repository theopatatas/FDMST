const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const connectDatabase = require("../config/database");
const User = require("../models/User");
const { hashPasswordBcrypt } = require("../utils/password");

const ADMIN_EMAIL = "floresdizondental@gmail.com";
const ADMIN_PASSWORD = "Qarqdj6789";

const seedAdmin = async () => {
  const existingAdmin = await User.findOne({ email: ADMIN_EMAIL });

  if (existingAdmin) {
    console.log(`Admin account already exists for ${ADMIN_EMAIL}.`);
    return existingAdmin;
  }

  const passwordHash = await hashPasswordBcrypt(ADMIN_PASSWORD);

  const admin = await User.create({
    firstName: "Flores-Dizon",
    lastName: "Admin",
    email: ADMIN_EMAIL,
    passwordHash,
    role: "admin",
    accountStatus: "active_admin",
    status: "active",
  });

  console.log(`Admin account created for ${ADMIN_EMAIL}.`);
  return admin;
};

const runSeed = async () => {
  await connectDatabase();
  await seedAdmin();
  process.exit(0);
};

if (require.main === module) {
  runSeed().catch((error) => {
    console.error("Failed to seed admin account:", error.message);
    process.exit(1);
  });
}

module.exports = seedAdmin;
