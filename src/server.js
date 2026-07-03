const express = require("express");
const crypto = require("crypto");
const cors = require("cors");
const multer = require("multer");
const cookieParser = require("cookie-parser");
const config = require("./config");
const { initDb } = require("./db");
const { cloudinary, isCloudinaryEnabled } = require("./cloudinary");
const {
  ALLOWED_SECTIONS,
  getSectionItems,
  replaceSectionItems,
  getSectionItemById,
  createSectionItem,
  updateSectionItem,
  deleteSectionItem,
} = require("./content.service");
const {
  authMiddleware,
  login,
  logout,
  checkSession,
  changePassword,
} = require("./auth.controller");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(
  cors({
    origin: config.clientOrigin === "*" ? "*" : config.clientOrigin.split(",").map((o) => o.trim()),
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
    credentials: true,
  })
);
app.use(cookieParser(config.sessionSecret));
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "aitd-backend",
    mysql: config.db.database,
    cloudinaryEnabled: isCloudinaryEnabled(),
  });
});

// Auth endpoints
app.post("/api/auth/login", login);
app.post("/api/auth/logout", logout);
app.get("/api/auth/me", authMiddleware, checkSession);
app.post("/api/auth/change-password", authMiddleware, changePassword);

app.get("/api/sections", (_req, res) => {
  res.json({ sections: Array.from(ALLOWED_SECTIONS) });
});

app.get("/api/content/:section", async (req, res, next) => {
  try {
    const items = await getSectionItems(req.params.section);
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

app.post("/api/content/:section", authMiddleware, async (req, res, next) => {
  try {
    // If incoming payload is the old bulk structure, fall back for compatibility
    if (req.body && Array.isArray(req.body.items)) {
      const incoming = req.body.items;
      const items = incoming.map((item, index) => ({
        id: String(item.id || crypto.randomUUID()),
        title: String(item.title || ""),
        subtitle: String(item.subtitle || ""),
        description: String(item.description || ""),
        meta: item.meta && typeof item.meta === "object" ? item.meta : {},
        imageUrl: item.imageUrl ? String(item.imageUrl) : null,
        imagePublicId: item.imagePublicId ? String(item.imagePublicId) : null,
        sortOrder: Number.isFinite(item.sortOrder) ? Number(item.sortOrder) : index,
      }));
      const saved = await replaceSectionItems(req.params.section, items);
      return res.json({ items: saved });
    }

    // Otherwise, treat as individual item creation (RESTful)
    const item = {
      id: req.body.id ? String(req.body.id) : crypto.randomUUID(),
      title: req.body.title ? String(req.body.title) : "",
      subtitle: req.body.subtitle ? String(req.body.subtitle) : "",
      description: req.body.description ? String(req.body.description) : "",
      meta: req.body.meta && typeof req.body.meta === "object" ? req.body.meta : {},
      imageUrl: req.body.imageUrl ? String(req.body.imageUrl) : null,
      imagePublicId: req.body.imagePublicId ? String(req.body.imagePublicId) : null,
      sortOrder: Number.isFinite(req.body.sortOrder) ? Number(req.body.sortOrder) : 0,
    };

    const created = await createSectionItem(req.params.section, item);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

app.put("/api/content/:section/:id", authMiddleware, async (req, res, next) => {
  try {
    const item = {
      title: req.body.title !== undefined ? String(req.body.title) : undefined,
      subtitle: req.body.subtitle !== undefined ? String(req.body.subtitle) : undefined,
      description: req.body.description !== undefined ? String(req.body.description) : undefined,
      meta: req.body.meta && typeof req.body.meta === "object" ? req.body.meta : undefined,
      imageUrl: req.body.imageUrl !== undefined ? (req.body.imageUrl ? String(req.body.imageUrl) : null) : undefined,
      imagePublicId: req.body.imagePublicId !== undefined ? (req.body.imagePublicId ? String(req.body.imagePublicId) : null) : undefined,
      sortOrder: Number.isFinite(req.body.sortOrder) ? Number(req.body.sortOrder) : undefined,
    };

    const updated = await updateSectionItem(req.params.section, req.params.id, item);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/content/:section/:id", authMiddleware, async (req, res, next) => {
  try {
    const result = await deleteSectionItem(req.params.section, req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/uploads/image", authMiddleware, upload.single("image"), async (req, res, next) => {
  try {
    if (!isCloudinaryEnabled()) {
      return res.status(400).json({
        error: "Cloudinary is not configured. Set CLOUDINARY_* environment values.",
      });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Image file is required." });
    }

    const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString(
      "base64"
    )}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: config.cloudinary.folder,
      resource_type: "image",
    });

    return res.json({
      url: result.secure_url,
      publicId: result.public_id,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/placements", async (_req, res, next) => {
  try {
    const items = await getSectionItems("placements");
    res.json({
      items: items.map((item) => ({
        id: item.id,
        name: item.title,
        role: item.subtitle,
        company: item.meta?.company || "",
        specialization: item.meta?.specialization || "",
        batch: item.meta?.batch || "",
        preview: item.imageUrl,
        imagePublicId: item.imagePublicId,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  res.status(status).json({
    error: error.message || "Internal server error",
  });
});

async function start() {
  await initDb();
  app.listen(config.port, () => {
    console.log(`AITD backend running on port ${config.port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
