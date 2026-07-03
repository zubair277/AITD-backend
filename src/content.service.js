const crypto = require("crypto");
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
      `SELECT id, title, description, detail_description AS detailDescription, gallery_images AS galleryImages, event_date AS eventDate, location, status, image_url AS imageUrl, image_public_id AS imagePublicId, sort_order AS sortOrder
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
        status: row.status === "completed" ? "completed" : "upcoming",
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
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        await connection.query(
          `INSERT INTO events (id, title, description, detail_description, gallery_images, event_date, location, status, image_url, image_public_id, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             title = VALUES(title),
             description = VALUES(description),
             detail_description = VALUES(detail_description),
             gallery_images = VALUES(gallery_images),
             event_date = VALUES(event_date),
             location = VALUES(location),
             status = VALUES(status),
             image_url = VALUES(image_url),
             image_public_id = VALUES(image_public_id),
             sort_order = VALUES(sort_order)`,
          [
            item.id,
            item.title || "",
            item.description || "",
            item.meta?.detailDescription || "",
            JSON.stringify(Array.isArray(item.meta?.galleryImages) ? item.meta.galleryImages : []),
            item.meta?.date || "",
            item.meta?.location || "",
            item.meta?.status === "completed" ? "completed" : "upcoming",
            item.imageUrl || null,
            item.imagePublicId || null,
            Number.isFinite(item.sortOrder) ? item.sortOrder : index,
          ]
        );
      }
      if (items.length > 0) {
        await connection.query(
          `DELETE FROM events WHERE id NOT IN (${items.map(() => "?").join(", ")})`,
          items.map((item) => item.id)
        );
      } else {
        await connection.query(`DELETE FROM events`);
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

async function getSectionItemById(section, id) {
  ensureSection(section);
  const pool = getPool();

  if (section === "events") {
    const [rows] = await pool.query(
      `SELECT id, title, description, detail_description AS detailDescription, gallery_images AS galleryImages, event_date AS eventDate, location, status, image_url AS imageUrl, image_public_id AS imagePublicId, sort_order AS sortOrder
       FROM events WHERE id = ?`,
      [id]
    );
    if (!rows.length) return null;
    const row = rows[0];
    return {
      id: row.id,
      section,
      title: row.title || "",
      subtitle: "",
      description: row.description || "",
      meta: {
        date: row.eventDate || "",
        location: row.location || "",
        status: row.status === "completed" ? "completed" : "upcoming",
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
    };
  }

  if (section === "placements") {
    const [rows] = await pool.query(
      `SELECT id, name, role, company, specialization, batch, image_url AS imageUrl, image_public_id AS imagePublicId, sort_order AS sortOrder
       FROM placements WHERE id = ?`,
      [id]
    );
    if (!rows.length) return null;
    const row = rows[0];
    return {
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
    };
  }

  if (section === "latest-news") {
    const [rows] = await pool.query(
      `SELECT id, title, summary, link, image_url AS imageUrl, image_public_id AS imagePublicId, sort_order AS sortOrder
       FROM latest_news WHERE id = ?`,
      [id]
    );
    if (!rows.length) return null;
    const row = rows[0];
    return {
      id: row.id,
      section,
      title: row.title || "",
      subtitle: "",
      description: row.summary || "",
      meta: { link: row.link || "" },
      imageUrl: row.imageUrl || null,
      imagePublicId: row.imagePublicId || null,
      sortOrder: row.sortOrder || 0,
    };
  }

  if (section === "testimonials") {
    const [rows] = await pool.query(
      `SELECT id, name, testimonial_text AS testimonialText, image_url AS imageUrl, image_public_id AS imagePublicId, sort_order AS sortOrder
       FROM testimonials WHERE id = ?`,
      [id]
    );
    if (!rows.length) return null;
    const row = rows[0];
    return {
      id: row.id,
      section,
      title: row.name || "",
      subtitle: "",
      description: row.testimonialText || "",
      meta: {},
      imageUrl: row.imageUrl || null,
      imagePublicId: row.imagePublicId || null,
      sortOrder: row.sortOrder || 0,
    };
  }

  if (section === "faculty") {
    const [rows] = await pool.query(
      `SELECT id, name, designation, department, experience, image_url AS imageUrl, image_public_id AS imagePublicId, sort_order AS sortOrder
       FROM faculty WHERE id = ?`,
      [id]
    );
    if (!rows.length) return null;
    const row = rows[0];
    return {
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
    };
  }

  return null;
}

async function createSectionItem(section, item) {
  ensureSection(section);
  const pool = getPool();
  const id = item.id || crypto.randomUUID();

  if (section === "events") {
    await pool.query(
      `INSERT INTO events (id, title, description, detail_description, gallery_images, event_date, location, status, image_url, image_public_id, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        item.title || "",
        item.description || "",
        item.meta?.detailDescription || "",
        JSON.stringify(Array.isArray(item.meta?.galleryImages) ? item.meta.galleryImages : []),
        item.meta?.date || "",
        item.meta?.location || "",
        item.meta?.status === "completed" ? "completed" : "upcoming",
        item.imageUrl || null,
        item.imagePublicId || null,
        item.sortOrder || 0
      ]
    );
  } else if (section === "placements") {
    await pool.query(
      `INSERT INTO placements (id, name, role, company, specialization, batch, image_url, image_public_id, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        item.title || "",
        item.subtitle || "",
        item.meta?.company || "",
        item.meta?.specialization || "",
        item.meta?.batch || "",
        item.imageUrl || null,
        item.imagePublicId || null,
        item.sortOrder || 0
      ]
    );
  } else if (section === "latest-news") {
    await pool.query(
      `INSERT INTO latest_news (id, title, summary, link, image_url, image_public_id, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        item.title || "",
        item.description || "",
        item.meta?.link || "",
        item.imageUrl || null,
        item.imagePublicId || null,
        item.sortOrder || 0
      ]
    );
  } else if (section === "testimonials") {
    await pool.query(
      `INSERT INTO testimonials (id, name, testimonial_text, image_url, image_public_id, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        item.title || "",
        item.description || "",
        item.imageUrl || null,
        item.imagePublicId || null,
        item.sortOrder || 0
      ]
    );
  } else if (section === "faculty") {
    await pool.query(
      `INSERT INTO faculty (id, name, designation, department, experience, image_url, image_public_id, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        item.title || "",
        item.subtitle || "",
        item.meta?.department || "",
        item.meta?.experience || "",
        item.imageUrl || null,
        item.imagePublicId || null,
        item.sortOrder || 0
      ]
    );
  }

  return getSectionItemById(section, id);
}

async function updateSectionItem(section, id, item) {
  ensureSection(section);
  const pool = getPool();

  const existing = await getSectionItemById(section, id);
  if (!existing) {
    const error = new Error("Item not found.");
    error.status = 404;
    throw error;
  }

  if (section === "events") {
    await pool.query(
      `UPDATE events SET
        title = ?,
        description = ?,
        detail_description = ?,
        gallery_images = ?,
        event_date = ?,
        location = ?,
        status = ?,
        image_url = ?,
        image_public_id = ?,
        sort_order = ?
       WHERE id = ?`,
      [
        item.title !== undefined ? item.title : existing.title,
        item.description !== undefined ? item.description : existing.description,
        item.meta?.detailDescription !== undefined ? item.meta.detailDescription : existing.meta.detailDescription,
        item.meta?.galleryImages !== undefined ? JSON.stringify(item.meta.galleryImages) : JSON.stringify(existing.meta.galleryImages),
        item.meta?.date !== undefined ? item.meta.date : existing.meta.date,
        item.meta?.location !== undefined ? item.meta.location : existing.meta.location,
        item.meta?.status !== undefined ? item.meta.status : existing.meta.status,
        item.imageUrl !== undefined ? item.imageUrl : existing.imageUrl,
        item.imagePublicId !== undefined ? item.imagePublicId : existing.imagePublicId,
        item.sortOrder !== undefined ? item.sortOrder : existing.sortOrder,
        id
      ]
    );
  } else if (section === "placements") {
    await pool.query(
      `UPDATE placements SET
        name = ?,
        role = ?,
        company = ?,
        specialization = ?,
        batch = ?,
        image_url = ?,
        image_public_id = ?,
        sort_order = ?
       WHERE id = ?`,
      [
        item.title !== undefined ? item.title : existing.title,
        item.subtitle !== undefined ? item.subtitle : existing.subtitle,
        item.meta?.company !== undefined ? item.meta.company : existing.meta.company,
        item.meta?.specialization !== undefined ? item.meta.specialization : existing.meta.specialization,
        item.meta?.batch !== undefined ? item.meta.batch : existing.meta.batch,
        item.imageUrl !== undefined ? item.imageUrl : existing.imageUrl,
        item.imagePublicId !== undefined ? item.imagePublicId : existing.imagePublicId,
        item.sortOrder !== undefined ? item.sortOrder : existing.sortOrder,
        id
      ]
    );
  } else if (section === "latest-news") {
    await pool.query(
      `UPDATE latest_news SET
        title = ?,
        summary = ?,
        link = ?,
        image_url = ?,
        image_public_id = ?,
        sort_order = ?
       WHERE id = ?`,
      [
        item.title !== undefined ? item.title : existing.title,
        item.description !== undefined ? item.description : existing.description,
        item.meta?.link !== undefined ? item.meta.link : existing.meta.link,
        item.imageUrl !== undefined ? item.imageUrl : existing.imageUrl,
        item.imagePublicId !== undefined ? item.imagePublicId : existing.imagePublicId,
        item.sortOrder !== undefined ? item.sortOrder : existing.sortOrder,
        id
      ]
    );
  } else if (section === "testimonials") {
    await pool.query(
      `UPDATE testimonials SET
        name = ?,
        testimonial_text = ?,
        image_url = ?,
        image_public_id = ?,
        sort_order = ?
       WHERE id = ?`,
      [
        item.title !== undefined ? item.title : existing.title,
        item.description !== undefined ? item.description : existing.description,
        item.imageUrl !== undefined ? item.imageUrl : existing.imageUrl,
        item.imagePublicId !== undefined ? item.imagePublicId : existing.imagePublicId,
        item.sortOrder !== undefined ? item.sortOrder : existing.sortOrder,
        id
      ]
    );
  } else if (section === "faculty") {
    await pool.query(
      `UPDATE faculty SET
        name = ?,
        designation = ?,
        department = ?,
        experience = ?,
        image_url = ?,
        image_public_id = ?,
        sort_order = ?
       WHERE id = ?`,
      [
        item.title !== undefined ? item.title : existing.title,
        item.subtitle !== undefined ? item.subtitle : existing.subtitle,
        item.meta?.department !== undefined ? item.meta.department : existing.meta.department,
        item.meta?.experience !== undefined ? item.meta.experience : existing.meta.experience,
        item.imageUrl !== undefined ? item.imageUrl : existing.imageUrl,
        item.imagePublicId !== undefined ? item.imagePublicId : existing.imagePublicId,
        item.sortOrder !== undefined ? item.sortOrder : existing.sortOrder,
        id
      ]
    );
  }

  return getSectionItemById(section, id);
}

async function deleteSectionItem(section, id) {
  ensureSection(section);
  const pool = getPool();

  const existing = await getSectionItemById(section, id);
  if (!existing) {
    const error = new Error("Item not found.");
    error.status = 404;
    throw error;
  }

  const tableName = section.replace("-", "_");
  await pool.query(`DELETE FROM \`${tableName}\` WHERE id = ?`, [id]);
  return { success: true };
}

module.exports = {
  ALLOWED_SECTIONS,
  getSectionItems,
  replaceSectionItems,
  getSectionItemById,
  createSectionItem,
  updateSectionItem,
  deleteSectionItem,
};

