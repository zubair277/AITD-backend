const express = require("express");
const cors = require("cors");
const multer = require("multer");
const config = require("./config");
const { initDb } = require("./db");
const { cloudinary, isCloudinaryEnabled } = require("./cloudinary");
const {
  ALLOWED_SECTIONS,
  getSectionItems,
  replaceSectionItems,
} = require("./content.service");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(
  cors({
    origin: config.clientOrigin === "*" ? "*" : config.clientOrigin.split(",").map((o) => o.trim()),
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "aitd-backend",
    mysql: config.db.database,
    cloudinaryEnabled: isCloudinaryEnabled(),
  });
});

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

app.post("/api/content/:section", async (req, res, next) => {
  try {
    const incoming = Array.isArray(req.body?.items) ? req.body.items : [];
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
    res.json({ items: saved });
  } catch (error) {
    next(error);
  }
});

app.post("/api/uploads/image", upload.single("image"), async (req, res, next) => {
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
