const dotenv = require("dotenv");

dotenv.config();

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 5000),
  clientOrigin: process.env.CLIENT_ORIGIN || "*",
  admin: {
    username: process.env.ADMIN_USERNAME || "aiem_admin_2026",
    password: process.env.ADMIN_PASSWORD || "2026AIEM123",
  },
  sessionSecret: process.env.SESSION_SECRET || "aitd-secure-session-secret-2026",
  db: {
    host: process.env.DB_HOST || (process.env.NODE_ENV === "production" ? undefined : "localhost"),
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "aitd",
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
    apiKey: process.env.CLOUDINARY_API_KEY || "",
    apiSecret: process.env.CLOUDINARY_API_SECRET || "",
    folder: process.env.CLOUDINARY_FOLDER || "aitd",
  },
};
