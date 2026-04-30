const { getPool } = require("./db");

const ALLOWED_SECTIONS = new Set([
  "events",
  "placements",
  "latest-news",
  "testimonials",
  "faculty",
]);

function ensureSection(section) {
  if (!ALLOWED_SECTIONS.has(section)) {
    const error = new Error("Invalid section.");
    error.status = 400;
    throw error;
  }
}

async function getSectionItems(section) {
  ensureSection(section);
  const pool = getPool();

  if (section === "events") {
    const [rows] = await pool.query(
      `SELECT id, title, description, detail_description AS detailDescription, gallery_images AS galleryImages, event_date AS eventDate, location, image_url AS imageUrl, image_public_id AS imagePublicId, sort_order AS sortOrder
       FROM events ORDER BY sort_order ASC, updated_at DESC`
    );
    return rows.map((row) => ({
      id: row.id,
      section,
      title: row.title || "",
      subtitle: "",
      description: row.description || "",
      meta: {
        date: row.eventDate || "",
        location: row.location || "",
        detailDescription: row.detailDescription || "",
        galleryImages: (() => {
          try {
            const parsed = JSON.parse(row.galleryImages || "[]");
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })(),
      },
      imageUrl: row.imageUrl || null,
      imagePublicId: row.imagePublicId || null,
      sortOrder: row.sortOrder || 0,
    }));
  }

  if (section === "placements") {
    const [rows] = await pool.query(
      `SELECT id, name, role, company, specialization, batch, image_url AS imageUrl, image_public_id AS imagePublicId, sort_order AS sortOrder
       FROM placements ORDER BY sort_order ASC, updated_at DESC`
    );
    return rows.map((row) => ({
      id: row.id,
      section,
      title: row.name || "",
      subtitle: row.role || "",
      description: "",
      meta: {
        company: row.company || "",
        specialization: row.specialization || "",
        batch: row.batch || "",
      },
      imageUrl: row.imageUrl || null,
      imagePublicId: row.imagePublicId || null,
      sortOrder: row.sortOrder || 0,
    }));
  }

  if (section === "latest-news") {
    const [rows] = await pool.query(
      `SELECT id, title, summary, link, image_url AS imageUrl, image_public_id AS imagePublicId, sort_order AS sortOrder
       FROM latest_news ORDER BY sort_order ASC, updated_at DESC`
    );
    return rows.map((row) => ({
      id: row.id,
      section,
      title: row.title || "",
      subtitle: "",
      description: row.summary || "",
      meta: { link: row.link || "" },
      imageUrl: row.imageUrl || null,
      imagePublicId: row.imagePublicId || null,
      sortOrder: row.sortOrder || 0,
    }));
  }

  if (section === "testimonials") {
    const [rows] = await pool.query(
      `SELECT id, name, testimonial_text AS testimonialText, image_url AS imageUrl, image_public_id AS imagePublicId, sort_order AS sortOrder
       FROM testimonials ORDER BY sort_order ASC, updated_at DESC`
    );
    return rows.map((row) => ({
      id: row.id,
      section,
      title: row.name || "",
      subtitle: "",
      description: row.testimonialText || "",
      meta: {},
      imageUrl: row.imageUrl || null,
      imagePublicId: row.imagePublicId || null,
      sortOrder: row.sortOrder || 0,
    }));
  }

  const [rows] = await pool.query(
    `SELECT id, name, designation, department, experience, image_url AS imageUrl, image_public_id AS imagePublicId, sort_order AS sortOrder
     FROM faculty ORDER BY sort_order ASC, updated_at DESC`
  );
  return rows.map((row) => ({
    id: row.id,
    section,
    title: row.name || "",
    subtitle: row.designation || "",
    description: "",
    meta: {
      department: row.department || "",
      experience: row.experience || "",
    },
    imageUrl: row.imageUrl || null,
    imagePublicId: row.imagePublicId || null,
    sortOrder: row.sortOrder || 0,
  }));
}

async function replaceSectionItems(section, items) {
  ensureSection(section);
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    if (section === "events") {
      await connection.query(`DELETE FROM events`);
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        await connection.query(
          `INSERT INTO events (id, title, description, detail_description, gallery_images, event_date, location, image_url, image_public_id, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.id,
            item.title || "",
            item.description || "",
            item.meta?.detailDescription || "",
            JSON.stringify(Array.isArray(item.meta?.galleryImages) ? item.meta.galleryImages : []),
            item.meta?.date || "",
            item.meta?.location || "",
            item.imageUrl || null,
            item.imagePublicId || null,
            Number.isFinite(item.sortOrder) ? item.sortOrder : index,
          ]
        );
      }
    } else if (section === "placements") {
      await connection.query(`DELETE FROM placements`);
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        await connection.query(
          `INSERT INTO placements (id, name, role, company, specialization, batch, image_url, image_public_id, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.id,
            item.title || "",
            item.subtitle || "",
            item.meta?.company || "",
            item.meta?.specialization || "",
            item.meta?.batch || "",
            item.imageUrl || null,
            item.imagePublicId || null,
            Number.isFinite(item.sortOrder) ? item.sortOrder : index,
          ]
        );
      }
    } else if (section === "latest-news") {
      await connection.query(`DELETE FROM latest_news`);
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        await connection.query(
          `INSERT INTO latest_news (id, title, summary, link, image_url, image_public_id, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            item.id,
            item.title || "",
            item.description || "",
            item.meta?.link || "",
            item.imageUrl || null,
            item.imagePublicId || null,
            Number.isFinite(item.sortOrder) ? item.sortOrder : index,
          ]
        );
      }
    } else if (section === "testimonials") {
      await connection.query(`DELETE FROM testimonials`);
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        await connection.query(
          `INSERT INTO testimonials (id, name, testimonial_text, image_url, image_public_id, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            item.id,
            item.title || "",
            item.description || "",
            item.imageUrl || null,
            item.imagePublicId || null,
            Number.isFinite(item.sortOrder) ? item.sortOrder : index,
          ]
        );
      }
    } else if (section === "faculty") {
      await connection.query(`DELETE FROM faculty`);
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        await connection.query(
          `INSERT INTO faculty (id, name, designation, department, experience, image_url, image_public_id, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.id,
            item.title || "",
            item.subtitle || "",
            item.meta?.department || "",
            item.meta?.experience || "",
            item.imageUrl || null,
            item.imagePublicId || null,
            Number.isFinite(item.sortOrder) ? item.sortOrder : index,
          ]
        );
      }
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return getSectionItems(section);
}

module.exports = {
  ALLOWED_SECTIONS,
  getSectionItems,
  replaceSectionItems,
};
