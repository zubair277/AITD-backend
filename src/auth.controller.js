const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const config = require("./config");
const { getPool } = require("./db");

// Pre-calculate hash of the hardcoded password on startup to avoid timing attacks
const initialPasswordHash = bcrypt.hashSync(config.admin.password, 12);
// A dummy hash to compare against when the username is completely invalid to prevent username enumeration timing attacks
const dummyHash = bcrypt.hashSync("dummy_password", 12);

/**
 * Log security events to the console and the database.
 */
async function logSecurityEvent(eventType, username, ipAddress, details) {
  const timestamp = new Date().toISOString();
  console.log(`[SECURITY] [${timestamp}] ${eventType} - User: ${username}, IP: ${ipAddress}, Details: ${details}`);
  
  try {
    const pool = getPool();
    await pool.execute(
      "INSERT INTO security_logs (event_type, username, ip_address, details) VALUES (?, ?, ?, ?)",
      [eventType, username, ipAddress ? String(ipAddress).substring(0, 45) : null, details]
    );
  } catch (error) {
    console.error("Failed to insert security log:", error);
  }
}

/**
 * Check if the IP is currently locked out due to excessive failed attempts.
 */
async function checkBruteForceLockout(ipAddress) {
  try {
    const pool = getPool();
    // Count failed attempts from this IP in the last 15 minutes
    const [rows] = await pool.execute(
      `SELECT COUNT(*) as count FROM login_attempts 
       WHERE ip_address = ? AND is_successful = 0 AND attempted_at > NOW() - INTERVAL 15 MINUTE`,
      [ipAddress ? String(ipAddress).substring(0, 45) : "unknown"]
    );
    return rows[0].count >= 5;
  } catch (error) {
    console.error("Error in checkBruteForceLockout:", error);
    return false;
  }
}

/**
 * Record a login attempt in the database.
 */
async function recordLoginAttempt(ipAddress, isSuccessful) {
  try {
    const pool = getPool();
    await pool.execute(
      "INSERT INTO login_attempts (ip_address, is_successful) VALUES (?, ?)",
      [ipAddress ? String(ipAddress).substring(0, 45) : "unknown", isSuccessful ? 1 : 0]
    );
  } catch (error) {
    console.error("Error in recordLoginAttempt:", error);
  }
}

/**
 * Middleware to authenticate requests using cookie-based server sessions.
 */
async function authMiddleware(req, res, next) {
  const sessionId = req.cookies?.sessionId;
  if (!sessionId) {
    return res.status(401).json({ error: "Authentication credentials required." });
  }

  try {
    const pool = getPool();
    // Check if session exists and is not expired
    const [sessions] = await pool.execute(
      "SELECT * FROM admin_sessions WHERE session_id = ? AND expires_at > NOW()",
      [sessionId]
    );

    if (sessions.length === 0) {
      // Clear cookie if session is invalid or expired
      res.clearCookie("sessionId", {
        httpOnly: true,
        secure: config.nodeEnv === "production",
        sameSite: "strict",
      });
      return res.status(401).json({ error: "Session has expired or is invalid." });
    }

    req.user = sessions[0].username;
    req.session = sessions[0];
    next();
  } catch (error) {
    console.error("Error in authMiddleware:", error);
    res.status(500).json({ error: "Internal server error during authentication." });
  }
}

/**
 * Login admin user.
 */
async function login(req, res) {
  const ipAddress = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  
  // Validate and sanitize body structure
  if (!req.body || typeof req.body !== "object") {
    return res.status(400).json({ error: "Invalid request payload." });
  }

  const { username, password } = req.body;
  if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  try {
    const pool = getPool();
    let authenticated = false;
    let expectedHash = dummyHash; // Default to dummy hash for constant time check
    let userRecordExists = false;

    const isAdminUser = username === config.admin.username;

    // Check if this is a correct admin username
    if (isAdminUser) {
      // Check database for changed password hash
      const [authRecords] = await pool.execute(
        "SELECT password_hash FROM admin_auth WHERE username = ?",
        [username]
      );

      if (authRecords.length > 0) {
        expectedHash = authRecords[0].password_hash;
        userRecordExists = true;
      } else {
        expectedHash = initialPasswordHash;
      }
    }

    // Always run bcrypt comparison for constant time execution (brute force/timing mitigation)
    authenticated = await bcrypt.compare(password, expectedHash);

    // If username is wrong, authenticated will remain false because comparison is run against dummyHash
    if (!isAdminUser) {
      authenticated = false;
    }

    if (!authenticated) {
      await recordLoginAttempt(ipAddress, false);
      await logSecurityEvent("LOGIN_FAILURE", username, ipAddress, "Invalid credentials provided");
      // Use generic error message to prevent account harvesting
      return res.status(401).json({ error: "Invalid admin credentials." });
    }

    // Login successful
    await recordLoginAttempt(ipAddress, true);
    await logSecurityEvent("LOGIN_SUCCESS", username, ipAddress, "Login successful");

    // Clean up login attempts from this IP upon successful login to reset counter
    await pool.execute("DELETE FROM login_attempts WHERE ip_address = ?", [
      ipAddress ? String(ipAddress).substring(0, 45) : "unknown",
    ]);

    // Generate secure random Session ID and CSRF Token
    const sessionId = crypto.randomBytes(32).toString("hex");
    const csrfToken = crypto.randomBytes(32).toString("hex");

    // Regenerate Session ID: Remove any existing sessions for this user first
    await pool.execute("DELETE FROM admin_sessions WHERE username = ?", [username]);

    // Insert new session with 2 hours expiration
    await pool.execute(
      "INSERT INTO admin_sessions (session_id, username, csrf_token, expires_at) VALUES (?, ?, ?, NOW() + INTERVAL 2 HOUR)",
      [sessionId, username, csrfToken]
    );

    // Set cookie: HttpOnly, Secure (in production), SameSite=Strict
    res.cookie("sessionId", sessionId, {
      httpOnly: true,
      secure: config.nodeEnv === "production",
      sameSite: "strict",
      maxAge: 2 * 60 * 60 * 1000, // 2 hours
    });

    res.json({ ok: true, csrfToken });
  } catch (error) {
    console.error("Error in login handler:", error);
    res.status(500).json({ error: "Internal server error." });
  }
}

/**
 * Logout admin user.
 */
async function logout(req, res) {
  const sessionId = req.cookies?.sessionId;
  if (sessionId) {
    try {
      const pool = getPool();
      await pool.execute("DELETE FROM admin_sessions WHERE session_id = ?", [sessionId]);
    } catch (error) {
      console.error("Failed to delete session on logout:", error);
    }
  }

  res.clearCookie("sessionId", {
    httpOnly: true,
    secure: config.nodeEnv === "production",
    sameSite: "strict",
  });

  res.json({ ok: true });
}

/**
 * Verify active session and return session properties (like CSRF token).
 */
async function checkSession(req, res) {
  // authMiddleware ensures req.user and req.session are populated
  res.json({
    authenticated: true,
    username: req.user,
    csrfToken: req.session.csrf_token,
  });
}

/**
 * Securely change the admin password.
 */
async function changePassword(req, res) {
  const ipAddress = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  const username = req.user; // Set by authMiddleware

  // Validate CSRF token
  const csrfHeader = req.headers["x-csrf-token"];
  if (!csrfHeader || csrfHeader !== req.session.csrf_token) {
    await logSecurityEvent("CSRF_FAILURE", username, ipAddress, "CSRF token mismatch on password change attempt");
    return res.status(403).json({ error: "CSRF verification failed. Request blocked." });
  }

  // Validate request body
  if (!req.body || typeof req.body !== "object") {
    return res.status(400).json({ error: "Invalid request payload." });
  }

  const { currentPassword, newPassword, confirmPassword } = req.body;
  if (
    typeof currentPassword !== "string" ||
    typeof newPassword !== "string" ||
    typeof confirmPassword !== "string" ||
    !currentPassword ||
    !newPassword ||
    !confirmPassword
  ) {
    return res.status(400).json({ error: "All fields are required." });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: "New passwords do not match." });
  }

  // Password validation: minimum 12 characters, 1 uppercase, 1 lowercase, 1 number, 1 special character
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{12,}$/;
  if (!passwordRegex.test(newPassword)) {
    return res.status(400).json({
      error: "New password does not meet security requirements. It must be at least 12 characters long and contain uppercase, lowercase, numbers, and special characters.",
    });
  }

  try {
    const pool = getPool();
    
    // Retrieve the active password hash to verify current password
    const [authRecords] = await pool.execute(
      "SELECT password_hash FROM admin_auth WHERE username = ?",
      [username]
    );

    let activeHash = initialPasswordHash;
    if (authRecords.length > 0) {
      activeHash = authRecords[0].password_hash;
    }

    // Verify current password
    const isCurrentValid = await bcrypt.compare(currentPassword, activeHash);
    if (!isCurrentValid) {
      await logSecurityEvent("PASSWORD_CHANGE_FAILURE", username, ipAddress, "Invalid current password provided");
      return res.status(400).json({ error: "Invalid current password." });
    }

    // Generate new hash
    const newHash = await bcrypt.hash(newPassword, 12);

    // Save hash back to the database (insert or update)
    if (authRecords.length > 0) {
      await pool.execute(
        "UPDATE admin_auth SET password_hash = ? WHERE username = ?",
        [newHash, username]
      );
    } else {
      await pool.execute(
        "INSERT INTO admin_auth (username, password_hash) VALUES (?, ?)",
        [username, newHash]
      );
    }

    await logSecurityEvent("PASSWORD_CHANGE_SUCCESS", username, ipAddress, "Password changed successfully");

    // Destroy all sessions for this user (including current) to force re-login
    await pool.execute("DELETE FROM admin_sessions WHERE username = ?", [username]);

    // Clear session cookie
    res.clearCookie("sessionId", {
      httpOnly: true,
      secure: config.nodeEnv === "production",
      sameSite: "strict",
    });

    res.json({
      ok: true,
      message: "Password updated successfully. Please log in again with your new credentials.",
    });
  } catch (error) {
    console.error("Error in changePassword:", error);
    res.status(500).json({ error: "Internal server error during password change." });
  }
}

module.exports = {
  authMiddleware,
  login,
  logout,
  checkSession,
  changePassword,
};
