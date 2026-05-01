const mysql = require("mysql2/promise");
const config = require("./config");

let pool;

function getPool() {
  if (!pool) {
    throw new Error("Database pool is not initialized.");
  }
  return pool;
}

async function ensureColumn(tableName, columnName, definition) {
  const [rows] = await pool.query(`SHOW COLUMNS FROM \`${tableName}\` LIKE ?`, [columnName]);
  if (!rows.length) {
    await pool.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${definition}`);
  }
}

async function initDb() {
  const bootstrap = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
  });

  await bootstrap.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await bootstrap.end();

  pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      detail_description LONGTEXT,
      gallery_images LONGTEXT,
      event_date VARCHAR(50),
      location VARCHAR(255),
      status VARCHAR(20) NOT NULL DEFAULT 'upcoming',
      image_url TEXT,
      image_public_id VARCHAR(255),
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await ensureColumn("events", "detail_description", "`detail_description` LONGTEXT");
  await ensureColumn("events", "gallery_images", "`gallery_images` LONGTEXT");
  await ensureColumn(
    "events",
    "status",
    "`status` VARCHAR(20) NOT NULL DEFAULT 'upcoming'"
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS placements (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(255) NOT NULL,
      company VARCHAR(255),
      specialization VARCHAR(255),
      batch VARCHAR(100),
      image_url TEXT,
      image_public_id VARCHAR(255),
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS latest_news (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      summary TEXT,
      link TEXT,
      image_url TEXT,
      image_public_id VARCHAR(255),
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await ensureColumn("latest_news", "image_url", "`image_url` TEXT");
  await ensureColumn("latest_news", "image_public_id", "`image_public_id` VARCHAR(255)");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS testimonials (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      testimonial_text TEXT NOT NULL,
      image_url TEXT,
      image_public_id VARCHAR(255),
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS faculty (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      designation VARCHAR(255),
      department VARCHAR(255),
      experience VARCHAR(100),
      image_url TEXT,
      image_public_id VARCHAR(255),
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

module.exports = {
  getPool,
  initDb,
};
