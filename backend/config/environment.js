const normalizeOrigin = (value) => String(value || "").trim().replace(/\/$/, "");

const isProduction = () => process.env.NODE_ENV === "production";

const getAllowedOrigins = () => {
  const configured = [process.env.APP_URL, process.env.CLIENT_URL, process.env.CORS_ORIGINS]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map(normalizeOrigin)
    .filter(Boolean);

  return [...new Set(configured)];
};

const validateEnvironment = () => {
  const required = ["MONGO_URI", "JWT_SECRET"];

  if (isProduction()) {
    required.push(
      "MAIL_API_URL",
      "MAIL_API_KEY",
      "SUPABASE_URL",
      "SUPABASE_SECRET_KEY",
      "SUPABASE_STORAGE_BUCKET",
    );
  }

  const missing = required.filter((name) => !String(process.env[name] || "").trim());
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  if (String(process.env.JWT_SECRET).length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters.");
  }

  const seedEmail = String(process.env.ADMIN_SEED_EMAIL || "").trim();
  const seedPassword = String(process.env.ADMIN_SEED_PASSWORD || "");
  if (Boolean(seedEmail) !== Boolean(seedPassword)) {
    throw new Error("ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD must be configured together.");
  }
  if (seedPassword && seedPassword.length < 12) {
    throw new Error("ADMIN_SEED_PASSWORD must contain at least 12 characters.");
  }

  if (isProduction() && !getAllowedOrigins().length) {
    throw new Error("Configure APP_URL, CLIENT_URL, or CORS_ORIGINS for production.");
  }
};

module.exports = {
  getAllowedOrigins,
  isProduction,
  normalizeOrigin,
  validateEnvironment,
};
