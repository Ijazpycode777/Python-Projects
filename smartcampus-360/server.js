/* eslint-disable */
// =============================================================================
// SmartCampus 360 — Backend (server.js)
// =============================================================================
// A compact monolithic Express backend that consolidates:
//   - Express initialization
//   - SQLite (better-sqlite3) initialization + full schema + migrations
//   - Authentication (argon2id) + server-side sessions (SQLite-backed)
//   - CSRF protection (double-submit cookie + Origin validation)
//   - Security middleware (helmet, rate limiting, audit logs, file upload)
//   - REST API routes for all 10 college modules
//   - Admin / Teacher / Student portal APIs
//   - Socket.IO real-time notifications
//   - AI integration with graceful fallback (never pretends to call a service)
//   - Production static serving of the built Vite frontend
//
// The frontend and backend are SEPARATE processes in development (Vite on
// :5173 proxies /api to this server on :4000). In production, this single
// process serves both the API and the compiled frontend assets.
// =============================================================================

import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import session from "express-session";
import argon2 from "argon2";
import multer from "multer";
import { Server as SocketIOServer } from "socket.io";
import Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// Environment + paths
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

const PORT = parseInt(process.env.PORT || "4000", 10);
const NODE_ENV = process.env.NODE_ENV || "development";
const DATABASE_PATH = process.env.DATABASE_PATH || path.join(__dirname, "data", "smartcampus.db");
const FILE_STORAGE_PATH = process.env.FILE_STORAGE_PATH || path.join(__dirname, "uploads");
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const SESSION_SECRET = process.env.SESSION_SECRET;
const SESSION_ENCRYPTION_KEY = process.env.SESSION_ENCRYPTION_KEY;
const SESSION_MAX_AGE = parseInt(process.env.SESSION_MAX_AGE || "28800000", 10);
const SESSION_INACTIVITY_TIMEOUT = parseInt(process.env.SESSION_INACTIVITY_TIMEOUT || "1800000", 10);
const AI_API_KEY = process.env.AI_API_KEY;

// Validate required configuration — fail loudly at startup if missing.
if (!SESSION_SECRET || SESSION_SECRET.startsWith("change-me")) {
  console.error("[FATAL] SESSION_SECRET is missing or unchanged. Set a strong random value in .env (e.g. `openssl rand -hex 64`).");
  process.exit(1);
}

// Ensure runtime directories exist
const DATA_DIR = path.dirname(DATABASE_PATH);
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FILE_STORAGE_PATH)) fs.mkdirSync(FILE_STORAGE_PATH, { recursive: true });

// ---------------------------------------------------------------------------
// SQLite database
// ---------------------------------------------------------------------------
const db = new Database(DATABASE_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

// --- Schema versioning / migrations --------------------------------------
const SCHEMA_VERSION = 1;

const MIGRATIONS = [
  // v1 — initial schema (every required table)
  {
    version: 1,
    sql: `
    -- Roles + Users
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );
    INSERT OR IGNORE INTO roles (id, name) VALUES (1,'ADMIN'),(2,'TEACHER'),(3,'STUDENT');

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role_id INTEGER NOT NULL REFERENCES roles(id),
      email TEXT,
      phone TEXT,
      full_name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER,
      last_login_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);

    -- Persistent server-side sessions (encrypted-sensitive fields handled in app code)
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      expired INTEGER,
      sess TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired);

    -- Academic structure
    CREATE TABLE IF NOT EXISTS academic_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,           -- e.g. "2026-2027"
      start_date TEXT, end_date TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS study_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,           -- ICS, FSC_PRE_MED, FSC_PRE_ENG, FA, ICOM
      name TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,           -- PART1, PART2
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,                  -- A, B, C
      group_id INTEGER REFERENCES study_groups(id),
      part_id INTEGER REFERENCES parts(id),
      academic_session_id INTEGER REFERENCES academic_sessions(id),
      capacity INTEGER DEFAULT 40,
      UNIQUE(name, group_id, part_id, academic_session_id)
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      group_id INTEGER REFERENCES study_groups(id),
      part_id INTEGER REFERENCES parts(id),
      theory_max INTEGER DEFAULT 100,
      practical_max INTEGER DEFAULT 0,
      is_compulsory INTEGER DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_subjects_group_part ON subjects(group_id, part_id);

    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      employee_code TEXT UNIQUE,
      qualification TEXT,
      designation TEXT,
      joining_date TEXT,
      status TEXT DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      college_roll_no TEXT UNIQUE,
      board_roll_no TEXT,
      bise_registration_no TEXT,
      father_name TEXT,
      guardian_phone TEXT,
      address TEXT,
      date_of_birth TEXT,
      gender TEXT,
      cnic TEXT,
      group_id INTEGER REFERENCES study_groups(id),
      part_id INTEGER REFERENCES parts(id),
      section_id INTEGER REFERENCES sections(id),
      academic_session_id INTEGER REFERENCES academic_sessions(id),
      admission_date TEXT,
      status TEXT DEFAULT 'active',         -- active, withdrawn, transferred, promoted
      photo_path TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_students_group_part ON students(group_id, part_id);

    CREATE TABLE IF NOT EXISTS subject_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      section_id INTEGER REFERENCES sections(id),
      academic_session_id INTEGER REFERENCES academic_sessions(id),
      UNIQUE(subject_id, teacher_id, section_id, academic_session_id)
    );

    -- Admissions
    CREATE TABLE IF NOT EXISTS admissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      applicant_name TEXT NOT NULL,
      father_name TEXT,
      cnic TEXT,
      phone TEXT, email TEXT,
      group_id INTEGER REFERENCES study_groups(id),
      part_id INTEGER REFERENCES parts(id),
      preferred_section TEXT,
      previous_school TEXT,
      previous_marks TEXT,
      documents_path TEXT,
      status TEXT DEFAULT 'pending',        -- pending, verified, merit_listed, approved, rejected
      ocr_summary TEXT,
      missing_fields TEXT,
      submitted_at INTEGER NOT NULL DEFAULT (unixepoch()),
      decided_at INTEGER,
      decided_by INTEGER REFERENCES users(id),
      student_id INTEGER REFERENCES students(id)
    );

    -- Attendance
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      subject_id INTEGER REFERENCES subjects(id),
      date TEXT NOT NULL,
      status TEXT NOT NULL,                  -- present, absent, late, authorized_leave
      marked_by INTEGER REFERENCES users(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(student_id, subject_id, date)
    );
    CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON attendance(student_id, date);

    CREATE TABLE IF NOT EXISTS attendance_corrections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attendance_id INTEGER NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,
      requested_by INTEGER REFERENCES users(id),
      reason TEXT, new_status TEXT,
      status TEXT DEFAULT 'pending',         -- pending, approved, rejected
      decided_by INTEGER REFERENCES users(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Examinations + marks
    CREATE TABLE IF NOT EXISTS examinations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT,                         -- monthly_test, weekly_test, send_up, pre_board, practical, theory, board
      academic_session_id INTEGER REFERENCES academic_sessions(id),
      group_id INTEGER REFERENCES study_groups(id),
      part_id INTEGER REFERENCES parts(id),
      start_date TEXT, end_date TEXT,
      room TEXT,
      status TEXT DEFAULT 'scheduled',
      created_by INTEGER REFERENCES users(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS examination_subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      examination_id INTEGER NOT NULL REFERENCES examinations(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES subjects(id),
      max_marks INTEGER NOT NULL,
      date TEXT,
      UNIQUE(examination_id, subject_id)
    );

    CREATE TABLE IF NOT EXISTS marks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      examination_id INTEGER NOT NULL REFERENCES examinations(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES subjects(id),
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      obtained INTEGER NOT NULL DEFAULT 0,
      practical_obtained INTEGER DEFAULT 0,
      entered_by INTEGER REFERENCES users(id),
      approved INTEGER DEFAULT 0,
      approved_by INTEGER REFERENCES users(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(examination_id, subject_id, student_id)
    );
    CREATE INDEX IF NOT EXISTS idx_marks_student ON marks(student_id);

    -- Configurable grading policies (NOT hardcoded)
    CREATE TABLE IF NOT EXISTS grades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,                    -- A, B, C ...
      min_percent REAL NOT NULL,
      max_percent REAL NOT NULL,
      gpa REAL DEFAULT 0,
      remarks TEXT
    );

    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      examination_id INTEGER NOT NULL REFERENCES examinations(id) ON DELETE CASCADE,
      total_marks INTEGER NOT NULL,
      obtained_marks INTEGER NOT NULL,
      percentage REAL NOT NULL,
      grade TEXT,
      status TEXT,                           -- pass, fail
      published INTEGER DEFAULT 0,
      published_by INTEGER REFERENCES users(id),
      published_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(student_id, examination_id)
    );

    -- Fees
    CREATE TABLE IF NOT EXISTS fees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      session_id INTEGER REFERENCES academic_sessions(id),
      type TEXT NOT NULL,                    -- admission, monthly, examination, laboratory, other
      amount REAL NOT NULL,
      due_date TEXT,
      challan_no TEXT UNIQUE,
      concession REAL DEFAULT 0,
      scholarship_id INTEGER REFERENCES scholarships(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS scholarships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      amount_percent REAL,
      criteria TEXT
    );

    CREATE TABLE IF NOT EXISTS fee_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fee_id INTEGER NOT NULL REFERENCES fees(id) ON DELETE CASCADE,
      amount_paid REAL NOT NULL,
      paid_on TEXT,
      receipt_no TEXT UNIQUE,
      received_by INTEGER REFERENCES users(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Timetable
    CREATE TABLE IF NOT EXISTS classrooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT,                             -- classroom, lab, library, office
      capacity INTEGER,
      floor TEXT,
      is_available INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS timetables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      subject_id INTEGER REFERENCES subjects(id),
      teacher_id INTEGER REFERENCES teachers(id),
      classroom_id INTEGER REFERENCES classrooms(id),
      day TEXT NOT NULL,                     -- Monday..Saturday
      period INTEGER NOT NULL,
      start_time TEXT, end_time TEXT,
      academic_session_id INTEGER REFERENCES academic_sessions(id),
      UNIQUE(section_id, day, period, academic_session_id)
    );

    -- Study materials + assignments
    CREATE TABLE IF NOT EXISTS study_materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      subject_id INTEGER REFERENCES subjects(id),
      group_id INTEGER REFERENCES study_groups(id),
      part_id INTEGER REFERENCES parts(id),
      chapter TEXT,
      file_path TEXT NOT NULL,
      file_type TEXT,
      uploaded_by INTEGER REFERENCES users(id),
      is_published INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      subject_id INTEGER REFERENCES subjects(id),
      section_id INTEGER REFERENCES sections(id),
      description TEXT,
      due_date TEXT,
      max_marks INTEGER,
      file_path TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS assignment_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      file_path TEXT,
      submitted_at INTEGER NOT NULL DEFAULT (unixepoch()),
      marks INTEGER,
      feedback TEXT,
      UNIQUE(assignment_id, student_id)
    );

    -- Notices + notifications
    CREATE TABLE IF NOT EXISTS notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT,
      category TEXT,                         -- college_wide, group, part, section, teacher, exam, fee, event, urgent
      scope_group_id INTEGER REFERENCES study_groups(id),
      scope_part_id INTEGER REFERENCES parts(id),
      scope_section_id INTEGER REFERENCES sections(id),
      audience TEXT,                          -- all, teachers, students, admins
      priority TEXT DEFAULT 'normal',
      scheduled_for TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT,                             -- admission, attendance, exam, result, fee, timetable, assignment, material, announcement, account
      title TEXT, body TEXT,
      is_read INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

    -- Board records + promotions
    CREATE TABLE IF NOT EXISTS board_registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      bise_name TEXT,                         -- e.g. BISE Lahore
      registration_no TEXT,
      session TEXT,
      group_id INTEGER REFERENCES study_groups(id),
      registered_on TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS board_examination_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      exam_type TEXT,                         -- annual, supplementary
      session TEXT,
      board_roll_no TEXT,
      total_marks INTEGER, obtained INTEGER,
      result TEXT,
      slip_path TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS student_promotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id),
      from_part_id INTEGER REFERENCES parts(id),
      to_part_id INTEGER REFERENCES parts(id),
      from_section_id INTEGER REFERENCES sections(id),
      to_section_id INTEGER REFERENCES sections(id),
      academic_session_id INTEGER REFERENCES academic_sessions(id),
      status TEXT DEFAULT 'pending',         -- pending, approved, rejected
      approved_by INTEGER REFERENCES users(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Complaints + support
    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      raised_by INTEGER REFERENCES users(id),
      category TEXT, priority TEXT DEFAULT 'normal',
      department TEXT, title TEXT, description TEXT,
      status TEXT DEFAULT 'open',             -- open, assigned, resolved, escalated, closed
      assigned_to INTEGER REFERENCES users(id),
      resolution TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS support_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER REFERENCES teachers(id),
      student_id INTEGER REFERENCES students(id),
      concern TEXT, support_plan TEXT,
      follow_up_date TEXT, progress_notes TEXT,
      recommended_resources TEXT,
      status TEXT DEFAULT 'open',
      is_confidential INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Campus reservations + projects + achievements
    CREATE TABLE IF NOT EXISTS campus_reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      facility TEXT,                          -- library, study_room, lab, sports, other
      purpose TEXT,
      reserved_date TEXT, start_time TEXT, end_time TEXT,
      status TEXT DEFAULT 'pending',          -- pending, approved, rejected
      approved_by INTEGER REFERENCES users(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER REFERENCES students(id),
      title TEXT, description TEXT,
      deadline TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS project_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id),
      role TEXT,
      UNIQUE(project_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS project_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT, assignee_id INTEGER REFERENCES students(id),
      status TEXT DEFAULT 'todo', due_date TEXT
    );

    CREATE TABLE IF NOT EXISTS achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      title TEXT, category TEXT, issuer TEXT, date TEXT,
      verified INTEGER DEFAULT 0,
      certificate_path TEXT
    );

    -- Audit logs
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      entity TEXT, entity_id INTEGER,
      detail TEXT,
      ip TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);

    -- Syllabus tracking (Teacher feature 6)
    CREATE TABLE IF NOT EXISTS syllabus_topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      section_id INTEGER REFERENCES sections(id),
      chapter TEXT, topic TEXT,
      target_date TEXT,
      is_completed INTEGER DEFAULT 0,
      completed_on TEXT
    );

    -- Messages (Teacher feature 10)
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user INTEGER REFERENCES users(id),
      to_user INTEGER REFERENCES users(id),
      body TEXT,
      is_read INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Maps + classrooms metadata for the digital campus map
    CREATE TABLE IF NOT EXISTS campus_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT,
      floor TEXT,
      description TEXT,
      is_available INTEGER DEFAULT 1
    );
    `
  }
];

function runMigrations() {
  // pragma_user_version returns 0 if no version set
  let current = db.pragma("user_version", { simple: true });
  for (const m of MIGRATIONS) {
    if (current < m.version) {
      db.exec(m.sql);
      db.pragma(`user_version = ${m.version}`);
      console.log(`[db] Applied migration v${m.version}`);
      current = m.version;
    }
  }
}
runMigrations();

// Seed default grading policy if empty (still configurable later — not hardcoded rules)
const gradeCount = db.prepare("SELECT COUNT(*) AS c FROM grades").get().c;
if (gradeCount === 0) {
  const defaults = [
    ["A+", 90, 100, 4.0, "Outstanding"],
    ["A", 80, 89.99, 3.7, "Excellent"],
    ["B", 70, 79.99, 3.0, "Very Good"],
    ["C", 60, 69.99, 2.3, "Good"],
    ["D", 50, 59.99, 1.7, "Satisfactory"],
    ["F", 0, 49.99, 0.0, "Fail"]
  ];
  const ins = db.prepare("INSERT INTO grades (name, min_percent, max_percent, gpa, remarks) VALUES (?,?,?,?,?)");
  for (const g of defaults) ins.run(...g);
}

// Seed default academic groups + parts
const groupDefs = [
  ["ICS", "ICS", "Intermediate in Computer Science"],
  ["FSC_PRE_MED", "FSc Pre-Medical", "Faculty of Science — Pre-Medical"],
  ["FSC_PRE_ENG", "FSc Pre-Engineering", "Faculty of Science — Pre-Engineering"],
  ["FA", "FA", "Faculty of Arts"],
  ["ICOM", "ICom", "Intermediate in Commerce"]
];
const groupIns = db.prepare("INSERT OR IGNORE INTO study_groups (code, name, description) VALUES (?,?,?)");
for (const g of groupDefs) groupIns.run(...g);

const partDefs = [
  ["PART1", "Part 1 — First Year"],
  ["PART2", "Part 2 — Second Year"]
];
const partIns = db.prepare("INSERT OR IGNORE INTO parts (code, name) VALUES (?,?)");
for (const p of partDefs) partIns.run(...p);

// Default academic session (most-recent Punjab board session for 2026 academic year)
const sessDef = db.prepare("SELECT COUNT(*) AS c FROM academic_sessions").get().c;
if (sessDef === 0) {
  db.prepare("INSERT INTO academic_sessions (name, start_date, end_date, is_active) VALUES (?,?,?,1)")
    .run("2026-2027", "2026-08-01", "2027-05-31");
}

// ---------------------------------------------------------------------------
// AES-256-GCM helpers for encrypting sensitive session fields at rest
// ---------------------------------------------------------------------------
function getEncKey() {
  if (!SESSION_ENCRYPTION_KEY || SESSION_ENCRYPTION_KEY.startsWith("change-me")) {
    // In dev only, derive a stable throwaway key from SESSION_SECRET so the app still runs.
    if (NODE_ENV === "production") {
      console.error("[FATAL] SESSION_ENCRYPTION_KEY missing in production. Generate with `openssl rand -base64 32`.");
      process.exit(1);
    }
    return crypto.createHash("sha256").update(SESSION_SECRET).digest();
  }
  const raw = Buffer.from(SESSION_ENCRYPTION_KEY, "base64");
  if (raw.length !== 32) {
    console.error("[FATAL] SESSION_ENCRYPTION_KEY must decode to 32 bytes (256 bits).");
    process.exit(1);
  }
  return raw;
}
const ENC_KEY = getEncKey();

function encryptSecret(plain) {
  if (!plain) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}
function decryptSecret(blob) {
  if (!blob || typeof blob !== "string") return null;
  const parts = blob.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const iv = Buffer.from(parts[1], "base64");
    const tag = Buffer.from(parts[2], "base64");
    const enc = Buffer.from(parts[3], "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", ENC_KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Audit log helper
// ---------------------------------------------------------------------------
function audit(actorId, action, entity = null, entityId = null, detail = "", ip = "") {
  db.prepare(
    "INSERT INTO audit_logs (actor_id, action, entity, entity_id, detail, ip) VALUES (?,?,?,?,?,?)"
  ).run(actorId || null, action, entity, entityId, detail, ip);
}

// ---------------------------------------------------------------------------
// Notification helper + Socket.IO broadcast
// ---------------------------------------------------------------------------
let io = null;
function notify(userId, type, title, body) {
  db.prepare(
    "INSERT INTO notifications (user_id, type, title, body) VALUES (?,?,?,?)"
  ).run(userId, type, title, body);
  if (io) io.to(`user:${userId}`).emit("notification", { type, title, body });
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();
const server = http.createServer(app);

// Trust proxy so req.ip / secure cookies work behind a reverse proxy in prod.
app.set("trust proxy", 1);

// Body parsers (before session so req.body is available to CSRF check on mutations)
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

// --- Security headers (Helmet + CSP) ------------------------------------
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],   // Vite dev needs inline; production bundle has hashed files
      styleSrc: ["'self'", "'unsafe-inline'"],     // Tailwind + Recharts inline styles
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  referrerPolicy: "strict-origin-when-cross-origin"
}));

// CORS — strict allowlist. In dev Vite runs on a separate origin.
const allowedOrigins = Array.from(new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  FRONTEND_URL
].filter(Boolean)));
app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(null, false);   // reject silently rather than throw
  },
  credentials: true
}));

// Logging
app.use(morgan(NODE_ENV === "production" ? "combined" : "dev"));

// --- Sessions (server-side, SQLite-backed, HttpOnly cookie) -------------
// Custom express-session Store backed by the SAME better-sqlite3 database
// the rest of the app uses — no second database driver, no extra dependency.
// The `sessions` table (sid TEXT PRIMARY KEY, expired INTEGER, sess TEXT)
// is created by the v1 migration above.
class SQLiteSessionStore extends session.Store {
  constructor(dbInstance) {
    super();
    this.db = dbInstance;
    this.stmt = {
      get: this.db.prepare("SELECT sess FROM sessions WHERE sid = ?"),
      upsert: this.db.prepare(
        `INSERT INTO sessions (sid, expired, sess) VALUES (?, ?, ?)
         ON CONFLICT(sid) DO UPDATE SET expired = excluded.expired, sess = excluded.sess`
      ),
      destroy: this.db.prepare("DELETE FROM sessions WHERE sid = ?"),
      clear: this.db.prepare("DELETE FROM sessions"),
      cleanup: this.db.prepare("DELETE FROM sessions WHERE expired IS NOT NULL AND expired < ?")
    };
    // Reap expired sessions every 15 minutes.
    this._reaper = setInterval(() => this._cleanup(), 15 * 60 * 1000);
    this._reaper.unref?.();
  }
  _cleanup() {
    try { this.stmt.cleanup.run(Date.now()); } catch { /* ignore */ }
  }
  get(sid, cb) {
    try {
      const row = this.stmt.get.get(sid);
      if (!row) return cb(null, null);
      const sess = JSON.parse(row.sess);
      // express-session expects us to honour cookie.expires via the stored object.
      if (sess?.cookie?.expires && new Date(sess.cookie.expires) < new Date()) {
        this.stmt.destroy.run(sid);
        return cb(null, null);
      }
      cb(null, sess);
    } catch (err) { cb(err); }
  }
  set(sid, sess, cb) {
    try {
      const expired = sess?.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + SESSION_MAX_AGE;
      this.stmt.upsert.run(sid, expired, JSON.stringify(sess));
      cb(null);
    } catch (err) { cb(err); }
  }
  destroy(sid, cb) {
    try { this.stmt.destroy.run(sid); cb(null); }
    catch (err) { cb(err); }
  }
  clear(cb) {
    try { this.stmt.clear.run(); cb?.(null); }
    catch (err) { cb?.(err); }
  }
}

const sessionMiddleware = session({
  store: new SQLiteSessionStore(db),
  name: "sc.sid",
  secret: SESSION_SECRET,
  resave: false,
  rolling: true,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: NODE_ENV === "production",
    sameSite: NODE_ENV === "production" ? "lax" : "lax",
    maxAge: SESSION_MAX_AGE
  },
  genid: () => crypto.randomBytes(24).toString("hex")
});
app.use(sessionMiddleware);

// --- CSRF: double-submit cookie + Origin validation ---------------------
// A synchronizer-token strategy without the deprecated csurf package.
// The token is a random hex value: server sets a non-HttpOnly cookie, frontend
// must echo it back in the X-CSRF-Token header on every state-changing request.
const CSRF_COOKIE = "sc.csrf";
function csrfToken() { return crypto.randomBytes(24).toString("hex"); }

app.use((req, res, next) => {
  // Always attach a fresh token cookie if missing or rotating per session.
  if (!req.cookies[CSRF_COOKIE]) {
    const t = csrfToken();
    res.cookie(CSRF_COOKIE, t, {
      httpOnly: false,                   // frontend must read & echo it
      secure: NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE,
      path: "/"
    });
    req.csrfTokenValue = t;
  } else {
    req.csrfTokenValue = req.cookies[CSRF_COOKIE];
  }
  res.locals.csrfToken = req.csrfTokenValue;

  // Enforce on mutations
  const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  if (mutating && !req.path.startsWith("/api/auth/login") && !req.path.startsWith("/api/auth/forgot")) {
    const headerToken = req.get("X-CSRF-Token") || req.body?._csrf;
    if (!headerToken || !crypto.timingSafeEqual(
      Buffer.from(String(headerToken)),
      Buffer.from(String(req.csrfTokenValue))
    )) {
      // Also reject if Origin/Referer is foreign (defense in depth)
      const origin = req.get("Origin") || req.get("Referer") || "";
      const ok = !origin || allowedOrigins.some(o => origin.startsWith(o));
      if (!ok || !headerToken) {
        return res.status(403).json({ error: "CSRF validation failed" });
      }
    }
  }
  next();
});

// Rate limiter for auth endpoints (login abuse protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Try again later." }
});
app.use("/api/auth", authLimiter);

// Generic API rate limiter
app.use("/api", rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
}));

// ---------------------------------------------------------------------------
// File upload (multer) — strict validation, NO executables, path-traversal safe
// ---------------------------------------------------------------------------
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png", "image/jpeg", "image/webp",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain"
]);
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sub = req.uploadSubdir || "general";
    const dir = path.join(FILE_STORAGE_PATH, sub);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Strip dangerous characters; never use the user-supplied name verbatim.
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const unique = crypto.randomBytes(8).toString("hex");
    cb(null, `${Date.now()}_${unique}_${safe}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },   // 10MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error("File type not allowed"));
    }
    // Reject executable extensions even if mime lies
    if (/\.(exe|bat|sh|cmd|js|mjs|dll|so|php)$/i.test(file.originalname)) {
      return cb(new Error("Executable files are forbidden"));
    }
    cb(null, true);
  }
});

// ---------------------------------------------------------------------------
// Auth middleware + helpers
// ---------------------------------------------------------------------------
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.userId) return res.status(401).json({ error: "Authentication required" });
    if (!roles.includes(req.session.role)) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Authentication required" });
  // Inactivity timeout
  const now = Date.now();
  const last = req.session.lastActivity || now;
  if (now - last > SESSION_INACTIVITY_TIMEOUT) {
    return req.session.destroy(() => res.status(401).json({ error: "Session expired" }));
  }
  req.session.lastActivity = now;
  next();
}

// Lookup the logged-in user record (without password) and attach.
app.use((req, res, next) => {
  if (req.session.userId) {
    const u = db.prepare(
      "SELECT u.id, u.username, u.full_name, u.role_id, r.name AS role, u.is_active, u.must_change_password, u.email, u.phone FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=?"
    ).get(req.session.userId);
    if (u && u.is_active) req.user = u;
    else { req.session.destroy(() => {}); req.user = null; }
  }
  next();
});

// ---------------------------------------------------------------------------
// Helper: grade from percentage using configurable policy
// ---------------------------------------------------------------------------
function gradeForPercent(pct) {
  const g = db.prepare("SELECT name FROM grades WHERE min_percent <= ? AND max_percent >= ? ORDER BY min_percent DESC LIMIT 1").get(pct, pct);
  return g ? g.name : "F";
}

// ---------------------------------------------------------------------------
// Route: health
// ---------------------------------------------------------------------------
app.get("/api/health", (req, res) => res.json({ ok: true, ts: Date.now(), env: NODE_ENV }));

// ---------------------------------------------------------------------------
// Route: CSRF token
// ---------------------------------------------------------------------------
app.get("/api/csrf", (req, res) => res.json({ csrfToken: req.csrfTokenValue }));

// ---------------------------------------------------------------------------
// Auth: login / logout / me / change password / forgot
// ---------------------------------------------------------------------------
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });

  const u = db.prepare("SELECT * FROM users WHERE username=? COLLATE NOCASE").get(username);
  if (!u) return res.status(401).json({ error: "Invalid credentials" });

  // Account lockout: 5 failed attempts => 15 minute lockout
  if (u.locked_until && u.locked_until > Math.floor(Date.now() / 1000)) {
    return res.status(423).json({ error: "Account temporarily locked. Try later." });
  }
  if (!u.is_active) return res.status(403).json({ error: "Account deactivated" });

  let ok = false;
  try { ok = await argon2.verify(u.password_hash, password); }
  catch { ok = false; }

  if (!ok) {
    const fails = u.failed_login_attempts + 1;
    if (fails >= 5) {
      db.prepare("UPDATE users SET failed_login_attempts=0, locked_until=? WHERE id=?")
        .run(Math.floor(Date.now()/1000) + 900, u.id);
      audit(u.id, "login.locked", "user", u.id, "5 failed attempts", req.ip);
    } else {
      db.prepare("UPDATE users SET failed_login_attempts=? WHERE id=?").run(fails, u.id);
    }
    audit(null, "login.failed", "user", u.id, `username=${username}`, req.ip);
    return res.status(401).json({ error: "Invalid credentials" });
  }

  // Success: regenerate session id to prevent fixation, reset counters
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: "Session error" });
    req.session.userId = u.id;
    req.session.role = (db.prepare("SELECT name FROM roles WHERE id=?").get(u.role_id)).name;
    req.session.createdAt = Date.now();
    req.session.lastActivity = Date.now();
    // Encrypt a sensitive marker in session data at rest (demonstrates AES-256-GCM use).
    req.session.encryptedToken = encryptSecret(`session-for-user-${u.id}-at-${Date.now()}`);

    db.prepare("UPDATE users SET failed_login_attempts=0, locked_until=NULL, last_login_at=? WHERE id=?")
      .run(Math.floor(Date.now()/1000), u.id);
    audit(u.id, "login.success", "user", u.id, "", req.ip);

    const role = req.session.role;
    const dest = role === "ADMIN" ? "/admin" : role === "TEACHER" ? "/teacher" : "/student";
    res.json({
      message: "Login successful",
      role, redirect: dest,
      mustChangePassword: !!u.must_change_password,
      user: { id: u.id, username: u.username, fullName: u.full_name, role }
    });
  });
});

app.post("/api/auth/logout", (req, res) => {
  const uid = req.session.userId;
  req.session.destroy(() => {
    res.clearCookie("sc.sid", { path: "/" });
    res.clearCookie(CSRF_COOKIE, { path: "/" });
    if (uid) audit(uid, "logout", "user", uid, "", req.ip);
    res.json({ ok: true });
  });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  res.json({ user: req.user });
});

app.post("/api/auth/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: "Both passwords required" });
  if (newPassword.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters" });
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.session.userId);
  let ok = false;
  try { ok = await argon2.verify(u.password_hash, currentPassword); } catch { ok = false; }
  if (!ok) return res.status(401).json({ error: "Current password incorrect" });

  const hash = await argon2.hash(newPassword, { type: argon2.argon2id });
  db.prepare("UPDATE users SET password_hash=?, must_change_password=0, updated_at=? WHERE id=?")
    .run(hash, Math.floor(Date.now()/1000), u.id);

  // Invalidate all other sessions (this one survives): delete every row
  // from the sessions table except the current one's sid.
  if (req.sessionID) {
    try { db.prepare("DELETE FROM sessions WHERE sid != ?").run(req.sessionID); } catch {}
  }
  audit(u.id, "password.change", "user", u.id, "", req.ip);
  req.session.regenerate((err) => {
    if (err) return res.json({ ok: true, relogin: true });
    req.session.userId = u.id;
    req.session.role = req.user.role;
    req.session.lastActivity = Date.now();
    res.json({ ok: true });
  });
});

app.post("/api/auth/forgot", (req, res) => {
  const { username } = req.body || {};
  // Always respond with the same message to prevent user enumeration.
  const u = username ? db.prepare("SELECT id FROM users WHERE username=? COLLATE NOCASE").get(username) : null;
  if (u) {
    // Generate a one-time reset token, store encrypted, expire in 30 min.
    const token = crypto.randomBytes(32).toString("hex");
    const expires = Math.floor(Date.now()/1000) + 1800;
    // Store as an audit record; real delivery would be email (not configured here).
    db.prepare("INSERT INTO audit_logs (actor_id, action, entity, entity_id, detail, ip) VALUES (?,?,?,?,?,?)")
      .run(null, "password.reset.request", "user", u.id, `token_enc=${encryptSecret(token)};expires=${expires}`, req.ip);
    audit(null, "password.reset.request", "user", u.id, "token generated (admin must review)", req.ip);
  }
  res.json({ ok: true, message: "If the account exists, a reset link has been issued to an administrator for verification." });
});

// ---------------------------------------------------------------------------
// ADMIN: user/account management
// ---------------------------------------------------------------------------
const adminOnly = requireRole("ADMIN");

// List users (admin)
app.get("/api/admin/users", adminOnly, (req, res) => {
  const rows = db.prepare(
    "SELECT u.id, u.username, u.full_name, r.name AS role, u.is_active, u.must_change_password, u.email, u.phone, u.last_login_at, u.created_at FROM users u JOIN roles r ON r.id=u.role_id WHERE u.is_active=1 ORDER BY u.id DESC LIMIT 500"
  ).all();
  res.json({ users: rows });
});

// Create a teacher or student account (admin only)
app.post("/api/admin/users", adminOnly, async (req, res) => {
  const { username, password, fullName, role, email, phone, extra } = req.body || {};
  if (!username || !password || !fullName || !role) return res.status(400).json({ error: "Missing fields" });
  if (!["TEACHER", "STUDENT"].includes(role)) return res.status(400).json({ error: "Can only create TEACHER or STUDENT" });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });
  if (db.prepare("SELECT id FROM users WHERE username=?").get(username)) return res.status(409).json({ error: "Username already exists" });

  const roleId = db.prepare("SELECT id FROM roles WHERE name=?").get(role).id;
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  const result = db.prepare(
    "INSERT INTO users (username, password_hash, role_id, email, phone, full_name, must_change_password) VALUES (?,?,?,?,?,?,1)"
  ).run(username, hash, roleId, email || null, phone || null, fullName);
  const userId = result.lastInsertRowid;

  if (role === "TEACHER") {
    db.prepare(
      "INSERT INTO teachers (user_id, employee_code, qualification, designation, joining_date, status) VALUES (?,?,?,?,?,?)"
    ).run(userId, extra?.employeeCode || `EMP-${userId}`,
      extra?.qualification || null, extra?.designation || "Lecturer",
      extra?.joiningDate || new Date().toISOString().slice(0, 10), "active");
  } else if (role === "STUDENT") {
    const rollNo = `SC-${String(userId).padStart(5, "0")}`;
    db.prepare(
      "INSERT INTO students (user_id, college_roll_no, father_name, guardian_phone, address, group_id, part_id, section_id, academic_session_id, admission_date, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
    ).run(userId, rollNo,
      extra?.fatherName || null, extra?.guardianPhone || null, extra?.address || null,
      extra?.groupId || null, extra?.partId || null, extra?.sectionId || null,
      extra?.academicSessionId || null,
      new Date().toISOString().slice(0, 10), "active");
  }
  audit(req.session.userId, "user.create", "user", userId, `role=${role}`, req.ip);
  res.json({ ok: true, userId, collegeRollNo: role === "STUDENT" ? `SC-${String(userId).padStart(5, "0")}` : undefined });
});

// Toggle user active state
app.patch("/api/admin/users/:id/toggle", adminOnly, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const u = db.prepare("SELECT is_active FROM users WHERE id=?").get(id);
  if (!u) return res.status(404).json({ error: "Not found" });
  db.prepare("UPDATE users SET is_active=?, updated_at=? WHERE id=?").run(u.is_active ? 0 : 1, Math.floor(Date.now()/1000), id);
  audit(req.session.userId, "user.toggle", "user", id, `active=${!u.is_active}`, req.ip);
  res.json({ ok: true, is_active: !u.is_active });
});

// ---------------------------------------------------------------------------
// ADMIN / shared: academic structure
// ---------------------------------------------------------------------------
app.get("/api/reference/groups", requireAuth, (req, res) => {
  res.json({ groups: db.prepare("SELECT * FROM study_groups ORDER BY id").all() });
});
app.get("/api/reference/parts", requireAuth, (req, res) => {
  res.json({ parts: db.prepare("SELECT * FROM parts ORDER BY id").all() });
});
app.get("/api/reference/sessions", requireAuth, (req, res) => {
  res.json({ sessions: db.prepare("SELECT * FROM academic_sessions ORDER BY id DESC").all() });
});
app.get("/api/reference/sections", requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT s.*, g.name AS group_name, p.name AS part_name, sess.name AS session_name
    FROM sections s
    LEFT JOIN study_groups g ON g.id=s.group_id
    LEFT JOIN parts p ON p.id=s.part_id
    LEFT JOIN academic_sessions sess ON sess.id=s.academic_session_id
    ORDER BY s.id DESC
  `).all();
  res.json({ sections: rows });
});
app.get("/api/reference/subjects", requireAuth, (req, res) => {
  res.json({ subjects: db.prepare("SELECT * FROM subjects ORDER BY id").all() });
});
app.get("/api/reference/classrooms", requireAuth, (req, res) => {
  res.json({ classrooms: db.prepare("SELECT * FROM classrooms ORDER BY name").all() });
});

app.post("/api/admin/sessions", adminOnly, (req, res) => {
  const { name, startDate, endDate, activate } = req.body || {};
  if (!name) return res.status(400).json({ error: "Name required" });
  if (db.prepare("SELECT id FROM academic_sessions WHERE name=?").get(name)) return res.status(409).json({ error: "Session exists" });
  const info = db.prepare("INSERT INTO academic_sessions (name, start_date, end_date, is_active) VALUES (?,?,?,?)")
    .run(name, startDate || null, endDate || null, activate ? 1 : 0);
  if (activate) db.prepare("UPDATE academic_sessions SET is_active=0 WHERE id != ?").run(info.lastInsertRowid);
  audit(req.session.userId, "session.create", "academic_session", info.lastInsertRowid, name, req.ip);
  res.json({ ok: true, id: info.lastInsertRowid });
});
app.post("/api/admin/sessions/:id/activate", adminOnly, (req, res) => {
  const id = parseInt(req.params.id, 10);
  db.prepare("UPDATE academic_sessions SET is_active=0").run();
  db.prepare("UPDATE academic_sessions SET is_active=1 WHERE id=?").run(id);
  audit(req.session.userId, "session.activate", "academic_session", id, "", req.ip);
  res.json({ ok: true });
});

// Sections + subjects config
app.post("/api/admin/sections", adminOnly, (req, res) => {
  const { name, groupId, partId, academicSessionId, capacity } = req.body || {};
  if (!name || !groupId || !partId) return res.status(400).json({ error: "Missing fields" });
  try {
    const info = db.prepare("INSERT INTO sections (name, group_id, part_id, academic_session_id, capacity) VALUES (?,?,?,?,?)")
      .run(name, groupId, partId, academicSessionId || null, capacity || 40);
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (e) { res.status(409).json({ error: "Section already exists for that group/part/session" }); }
});

app.post("/api/admin/subjects", adminOnly, (req, res) => {
  const { code, name, groupId, partId, theoryMax, practicalMax, isCompulsory } = req.body || {};
  if (!code || !name) return res.status(400).json({ error: "Missing fields" });
  const info = db.prepare("INSERT INTO subjects (code, name, group_id, part_id, theory_max, practical_max, is_compulsory) VALUES (?,?,?,?,?,?,?)")
    .run(code, name, groupId || null, partId || null, theoryMax || 100, practicalMax || 0, isCompulsory ? 1 : 0);
  audit(req.session.userId, "subject.create", "subjects", info.lastInsertRowid, code, req.ip);
  res.json({ ok: true, id: info.lastInsertRowid });
});

// ---------------------------------------------------------------------------
// MODULE 01 — ADMISSIONS
// ---------------------------------------------------------------------------
app.get("/api/admissions", requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT a.*, g.name AS group_name, p.name AS part_name
    FROM admissions a
    LEFT JOIN study_groups g ON g.id=a.group_id
    LEFT JOIN parts p ON p.id=a.part_id
    ORDER BY a.submitted_at DESC LIMIT 500
  `).all();
  res.json({ admissions: rows });
});

app.post("/api/admissions", (req, res) => {
  // Public endpoint (no auth) — online application
  const b = req.body || {};
  if (!b.applicantName) return res.status(400).json({ error: "Applicant name required" });
  const info = db.prepare(`INSERT INTO admissions
    (applicant_name, father_name, cnic, phone, email, group_id, part_id, preferred_section, previous_school, previous_marks)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(b.applicantName, b.fatherName || null, b.cnic || null, b.phone || null, b.email || null,
         b.groupId || null, b.partId || null, b.preferredSection || null,
         b.previousSchool || null, b.previousMarks || null);
  audit(null, "admission.submit", "admissions", info.lastInsertRowid, b.applicantName, req.ip);
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.post("/api/admin/admissions/:id/decision", adminOnly, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status, ocrSummary, missingFields } = req.body || {};
  if (!["verified", "merit_listed", "approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  db.prepare("UPDATE admissions SET status=?, ocr_summary=?, missing_fields=?, decided_at=?, decided_by=? WHERE id=?")
    .run(status, ocrSummary || null, missingFields || null, Math.floor(Date.now()/1000), req.session.userId, id);

  // If approved, promote to a student record automatically
  if (status === "approved") {
    const a = db.prepare("SELECT * FROM admissions WHERE id=?").get(id);
    const activeSession = db.prepare("SELECT id FROM academic_sessions WHERE is_active=1 LIMIT 1").get();
    const partId = a.part_id || 1;
    const groupId = a.group_id || 1;
    const section = db.prepare("SELECT id FROM sections WHERE group_id=? AND part_id=? AND academic_session_id=? LIMIT 1").get(groupId, partId, activeSession?.id);
    // Create login account
    const username = `student_${Date.now()}`;
    const tempPw = crypto.randomBytes(6).toString("base64url").slice(0, 10);
    const hash = argon2.hashSync ? null : null; // unused, see below
    argon2.hash(tempPw, { type: argon2.argon2id }).then((h) => {
      const r = db.prepare("INSERT INTO users (username, password_hash, role_id, full_name, email, phone, must_change_password) VALUES (?,?,?,?,?,?,1)")
        .run(username, h, 3, a.applicant_name, a.email, a.phone);
      const uid = r.lastInsertRowid;
      const rollNo = `SC-${String(uid).padStart(5, "0")}`;
      db.prepare(`INSERT INTO students (user_id, college_roll_no, father_name, guardian_phone, group_id, part_id, section_id, academic_session_id, admission_date, status) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(uid, rollNo, a.father_name, a.phone, groupId, partId, section?.id, activeSession?.id, new Date().toISOString().slice(0,10), "active");
      db.prepare("UPDATE admissions SET student_id=? WHERE id=?").run(uid, id);
      audit(req.session.userId, "student.auto_create", "students", uid, `from admission ${id}`, req.ip);
      // Notify by email? Not configured. Log instead.
      res.json({ ok: true, status, username, tempPw });
    });
  } else {
    res.json({ ok: true, status });
  }
});

// OCR-assisted extraction (rule-based + flag missing fields). Real OCR would
// require an external vision API; we implement a transparent heuristic that
// flags missing fields without pretending to read images.
app.post("/api/admin/admissions/:id/ocr", adminOnly, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const a = db.prepare("SELECT * FROM admissions WHERE id=?").get(id);
  if (!a) return res.status(404).json({ error: "Not found" });
  const missing = [];
  for (const f of ["applicant_name","father_name","cnic","phone","group_id","part_id"]) {
    if (!a[f]) missing.push(f);
  }
  const summary = `Reviewed ${a.applicant_name || "anonymous"} application. Required-field check ${missing.length === 0 ? "passed" : "incomplete"}.`;
  db.prepare("UPDATE admissions SET ocr_summary=?, missing_fields=? WHERE id=?")
    .run(summary, missing.join(","), id);
  res.json({ ok: true, summary, missingFields: missing });
});

// ---------------------------------------------------------------------------
// MODULE 02 — STUDENT & TEACHER MANAGEMENT
// ---------------------------------------------------------------------------
app.get("/api/students", requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT s.id, u.username, u.full_name, u.email, u.phone, s.college_roll_no, s.status,
           g.name AS group_name, p.name AS part_name, s.group_id, s.part_id, s.section_id,
           s.academic_session_id, s.father_name, s.guardian_phone
    FROM students s
    JOIN users u ON u.id=s.user_id
    LEFT JOIN study_groups g ON g.id=s.group_id
    LEFT JOIN parts p ON p.id=s.part_id
    ORDER BY s.id DESC LIMIT 500
  `).all();
  res.json({ students: rows });
});

app.get("/api/teachers", requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT t.id, u.username, u.full_name, u.email, u.phone, t.employee_code, t.qualification, t.designation, t.status
    FROM teachers t JOIN users u ON u.id=t.user_id ORDER BY t.id DESC
  `).all();
  res.json({ teachers: rows });
});

// Subject assignment (admin)
app.post("/api/admin/subject-assignments", adminOnly, (req, res) => {
  const { subjectId, teacherId, sectionId, academicSessionId } = req.body || {};
  if (!subjectId || !teacherId) return res.status(400).json({ error: "Missing fields" });
  const info = db.prepare("INSERT OR IGNORE INTO subject_assignments (subject_id, teacher_id, section_id, academic_session_id) VALUES (?,?,?,?)")
    .run(subjectId, teacherId, sectionId || null, academicSessionId || null);
  audit(req.session.userId, "subject.assign", "subject_assignments", info.lastInsertRowid, "", req.ip);
  res.json({ ok: true, id: info.lastInsertRowid });
});

// ---------------------------------------------------------------------------
// MODULE 03 — ATTENDANCE
// ---------------------------------------------------------------------------
app.get("/api/attendance", requireAuth, (req, res) => {
  const { studentId, date, sectionId } = req.query;
  let sql = `SELECT a.*, u.full_name AS student_name, sub.name AS subject_name
             FROM attendance a
             JOIN students s ON s.id=a.student_id
             JOIN users u ON u.id=s.user_id
             LEFT JOIN subjects sub ON sub.id=a.subject_id WHERE 1=1`;
  const params = [];
  if (studentId) { sql += " AND a.student_id=?"; params.push(studentId); }
  if (date) { sql += " AND a.date=?"; params.push(date); }
  sql += " ORDER BY a.date DESC LIMIT 500";
  res.json({ attendance: db.prepare(sql).all(...params) });
});

app.post("/api/attendance", requireRole("ADMIN", "TEACHER"), (req, res) => {
  const { studentId, subjectId, date, status } = req.body || {};
  if (!studentId || !date || !status) return res.status(400).json({ error: "Missing fields" });
  if (!["present","absent","late","authorized_leave"].includes(status)) return res.status(400).json({ error: "Invalid status" });
  try {
    const info = db.prepare("INSERT OR REPLACE INTO attendance (student_id, subject_id, date, status, marked_by) VALUES (?,?,?,?,?)")
      .run(studentId, subjectId || null, date, status, req.session.userId);
    audit(req.session.userId, "attendance.mark", "attendance", info.lastInsertRowid, `${studentId}=${status}`, req.ip);
    // Notify student on absence/late
    if (status !== "present") {
      const stud = db.prepare("SELECT user_id FROM students WHERE id=?").get(studentId);
      if (stud) notify(stud.user_id, "attendance", "Attendance marked", `You were marked ${status} on ${date}.`);
    }
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (e) { res.status(400).json({ error: "Could not mark attendance" }); }
});

// Attendance correction request (student) + approval (admin)
app.post("/api/attendance/:id/correction", requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { reason, newStatus } = req.body || {};
  const info = db.prepare("INSERT INTO attendance_corrections (attendance_id, requested_by, reason, new_status) VALUES (?,?,?,?)")
    .run(id, req.session.userId, reason || null, newStatus || null);
  res.json({ ok: true, id: info.lastInsertRowid });
});
app.post("/api/admin/attendance-corrections/:id/decision", adminOnly, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status } = req.body || {};
  if (!["approved","rejected"].includes(status)) return res.status(400).json({ error: "Invalid status" });
  db.prepare("UPDATE attendance_corrections SET status=?, decided_by=? WHERE id=?").run(status, req.session.userId, id);
  if (status === "approved") {
    const c = db.prepare("SELECT * FROM attendance_corrections WHERE id=?").get(id);
    if (c && c.new_status) db.prepare("UPDATE attendance SET status=? WHERE id=?").run(c.new_status, c.attendance_id);
  }
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// MODULE 04 — EXAMINATIONS & MARKS
// ---------------------------------------------------------------------------
app.get("/api/examinations", requireAuth, (req, res) => {
  res.json({ examinations: db.prepare(`
    SELECT e.*, g.name AS group_name, p.name AS part_name
    FROM examinations e
    LEFT JOIN study_groups g ON g.id=e.group_id
    LEFT JOIN parts p ON p.id=e.part_id
    ORDER BY e.id DESC LIMIT 500`).all() });
});

app.post("/api/admin/examinations", adminOnly, (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.category) return res.status(400).json({ error: "Missing fields" });
  const info = db.prepare(`INSERT INTO examinations
    (name, category, academic_session_id, group_id, part_id, start_date, end_date, room, status, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(b.name, b.category, b.academicSessionId || null,
    b.groupId || null, b.partId || null, b.startDate || null, b.endDate || null, b.room || null,
    b.status || "scheduled", req.session.userId);
  audit(req.session.userId, "exam.create", "examinations", info.lastInsertRowid, b.name, req.ip);
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.post("/api/admin/examinations/:id/subjects", adminOnly, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { subjects } = req.body || {};
  if (!Array.isArray(subjects)) return res.status(400).json({ error: "subjects[] required" });
  const ins = db.prepare("INSERT OR IGNORE INTO examination_subjects (examination_id, subject_id, max_marks, date) VALUES (?,?,?,?)");
  const tx = db.transaction((rows) => rows.forEach(r => ins.run(id, r.subjectId, r.maxMarks || 100, r.date || null)));
  tx(subjects);
  res.json({ ok: true });
});

// Marks entry (teacher/admin)
app.post("/api/marks", requireRole("ADMIN", "TEACHER"), (req, res) => {
  const { examinationId, subjectId, studentId, obtained, practicalObtained } = req.body || {};
  if (!examinationId || !subjectId || !studentId) return res.status(400).json({ error: "Missing fields" });
  const info = db.prepare(`INSERT INTO marks (examination_id, subject_id, student_id, obtained, practical_obtained, entered_by)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(examination_id, subject_id, student_id) DO UPDATE SET obtained=excluded.obtained, practical_obtained=excluded.practical_obtained`)
    .run(examinationId, subjectId, studentId, obtained || 0, practicalObtained || 0, req.session.userId);
  audit(req.session.userId, "marks.enter", "marks", info.lastInsertRowid, `exam=${examinationId} subj=${subjectId}`, req.ip);
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.post("/api/admin/marks/:id/approve", adminOnly, (req, res) => {
  const id = parseInt(req.params.id, 10);
  db.prepare("UPDATE marks SET approved=1, approved_by=? WHERE id=?").run(req.session.userId, id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// MODULE 05 — RESULTS & GRADES (configurable grading)
// ---------------------------------------------------------------------------
app.get("/api/grades", requireAuth, (req, res) => {
  res.json({ grades: db.prepare("SELECT * FROM grades ORDER BY min_percent DESC").all() });
});
app.post("/api/admin/grades", adminOnly, (req, res) => {
  const { name, minPercent, maxPercent, gpa, remarks } = req.body || {};
  const info = db.prepare("INSERT INTO grades (name, min_percent, max_percent, gpa, remarks) VALUES (?,?,?,?,?)")
    .run(name, minPercent, maxPercent, gpa || 0, remarks || null);
  res.json({ ok: true, id: info.lastInsertRowid });
});
app.delete("/api/admin/grades/:id", adminOnly, (req, res) => {
  db.prepare("DELETE FROM grades WHERE id=?").run(parseInt(req.params.id, 10));
  res.json({ ok: true });
});

// Calculate + publish a result for a student in an examination
app.post("/api/admin/results/calculate", adminOnly, (req, res) => {
  const { examinationId, studentId } = req.body || {};
  if (!examinationId || !studentId) return res.status(400).json({ error: "Missing fields" });
  const rows = db.prepare("SELECT obtained, practical_obtained, es.max_marks FROM marks m JOIN examination_subjects es ON es.examination_id=m.examination_id AND es.subject_id=m.subject_id WHERE m.examination_id=? AND m.student_id=? AND m.approved=1").all(examinationId, studentId);
  if (rows.length === 0) return res.status(400).json({ error: "No approved marks found" });
  const total = rows.reduce((a, r) => a + (r.max_marks || 0), 0);
  const obtained = rows.reduce((a, r) => a + (r.obtained || 0) + (r.practical_obtained || 0), 0);
  const pct = total ? (obtained / total) * 100 : 0;
  const grade = gradeForPercent(pct);
  const status = pct >= 50 ? "pass" : "fail";
  db.prepare(`INSERT INTO results (student_id, examination_id, total_marks, obtained_marks, percentage, grade, status, published, published_by, published_at)
              VALUES (?,?,?,?,?,?,?,1,?,?)
              ON CONFLICT(student_id, examination_id) DO UPDATE SET total_marks=excluded.total_marks, obtained_marks=excluded.obtained_marks, percentage=excluded.percentage, grade=excluded.grade, status=excluded.status, published=1, published_by=excluded.published_by, published_at=excluded.published_at`)
    .run(studentId, examinationId, total, obtained, pct, grade, status, req.session.userId, Math.floor(Date.now()/1000));
  const stud = db.prepare("SELECT user_id FROM students WHERE id=?").get(studentId);
  if (stud) notify(stud.user_id, "result", "Result published", `Your result is ${obtained}/${total} (${pct.toFixed(1)}%) — Grade ${grade}.`);
  res.json({ ok: true, total, obtained, percentage: pct, grade, status });
});

app.get("/api/results", requireAuth, (req, res) => {
  const { studentId } = req.query;
  let sql = `SELECT r.*, u.full_name AS student_name, e.name AS exam_name
             FROM results r JOIN students s ON s.id=r.student_id JOIN users u ON u.id=s.user_id
             JOIN examinations e ON e.id=r.examination_id WHERE r.published=1`;
  const params = [];
  if (studentId) { sql += " AND r.student_id=?"; params.push(studentId); }
  sql += " ORDER BY r.published_at DESC";
  res.json({ results: db.prepare(sql).all(...params) });
});

// ---------------------------------------------------------------------------
// MODULE 06 — FEES
// ---------------------------------------------------------------------------
app.get("/api/fees", requireAuth, (req, res) => {
  const { studentId } = req.query;
  let sql = `SELECT f.*, u.full_name AS student_name,
             (SELECT COALESCE(SUM(amount_paid),0) FROM fee_payments WHERE fee_id=f.id) AS paid_amount
             FROM fees f JOIN students s ON s.id=f.student_id JOIN users u ON u.id=s.user_id WHERE 1=1`;
  const params = [];
  if (studentId) { sql += " AND f.student_id=?"; params.push(studentId); }
  sql += " ORDER BY f.id DESC LIMIT 500";
  res.json({ fees: db.prepare(sql).all(...params) });
});

app.post("/api/admin/fees", adminOnly, (req, res) => {
  const b = req.body || {};
  if (!b.studentId || !b.type || !b.amount) return res.status(400).json({ error: "Missing fields" });
  const challan = `CH-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
  const info = db.prepare("INSERT INTO fees (student_id, session_id, type, amount, due_date, challan_no, concession) VALUES (?,?,?,?,?,?,?)")
    .run(b.studentId, b.sessionId || null, b.type, b.amount, b.dueDate || null, challan, b.concession || 0);
  audit(req.session.userId, "fee.challan", "fees", info.lastInsertRowid, challan, req.ip);
  res.json({ ok: true, id: info.lastInsertRowid, challan });
});

app.post("/api/admin/fees/:id/payment", adminOnly, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { amountPaid, paidOn } = req.body || {};
  if (!amountPaid) return res.status(400).json({ error: "Amount required" });
  const receipt = `RCPT-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
  const info = db.prepare("INSERT INTO fee_payments (fee_id, amount_paid, paid_on, receipt_no, received_by) VALUES (?,?,?,?,?)")
    .run(id, amountPaid, paidOn || new Date().toISOString().slice(0,10), receipt, req.session.userId);
  const stud = db.prepare("SELECT user_id FROM fees f JOIN students s ON s.id=f.student_id WHERE f.id=?").get(id);
  if (stud) notify(stud.user_id, "fee", "Payment recorded", `Receipt ${receipt} for amount ${amountPaid}.`);
  res.json({ ok: true, receipt });
});

// ---------------------------------------------------------------------------
// MODULE 07 — TIMETABLE (with conflict detection)
// ---------------------------------------------------------------------------
app.get("/api/timetables", requireAuth, (req, res) => {
  const { sectionId } = req.query;
  let sql = `SELECT t.*, sub.name AS subject_name, u.full_name AS teacher_name, c.name AS classroom_name
             FROM timetables t
             LEFT JOIN subjects sub ON sub.id=t.subject_id
             LEFT JOIN teachers tc ON tc.id=t.teacher_id
             LEFT JOIN users u ON u.id=tc.user_id
             LEFT JOIN classrooms c ON c.id=t.classroom_id WHERE 1=1`;
  const params = [];
  if (sectionId) { sql += " AND t.section_id=?"; params.push(sectionId); }
  sql += " ORDER BY t.day, t.period";
  res.json({ timetables: db.prepare(sql).all(...params) });
});

app.post("/api/admin/timetables", adminOnly, (req, res) => {
  const b = req.body || {};
  if (!b.sectionId || !b.day || !b.period) return res.status(400).json({ error: "Missing fields" });

  // Conflict detection: same teacher / same classroom in same session/day/period
  const sessionFilter = b.academicSessionId ? " AND academic_session_id=?" : " AND academic_session_id IS NULL";
  const args = [b.teacherId, b.day, b.period];
  if (b.academicSessionId) args.push(b.academicSessionId);
  if (b.teacherId) {
    const t = db.prepare(`SELECT id FROM timetables WHERE teacher_id=? AND day=? AND period=?${sessionFilter}`).get(...args);
    if (t) return res.status(409).json({ error: "Teacher conflict at that period" });
  }
  if (b.classroomId) {
    const c = db.prepare(`SELECT id FROM timetables WHERE classroom_id=? AND day=? AND period=?${sessionFilter}`).get(b.classroomId, b.day, b.period, b.academicSessionId);
    if (c) return res.status(409).json({ error: "Classroom conflict at that period" });
  }

  const info = db.prepare("INSERT INTO timetables (section_id, subject_id, teacher_id, classroom_id, day, period, start_time, end_time, academic_session_id) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(b.sectionId, b.subjectId || null, b.teacherId || null, b.classroomId || null, b.day, b.period, b.startTime || null, b.endTime || null, b.academicSessionId || null);
  audit(req.session.userId, "timetable.add", "timetables", info.lastInsertRowid, `${b.day} P${b.period}`, req.ip);
  res.json({ ok: true, id: info.lastInsertRowid });
});

// AI Timetable Architect (rule-based generator with conflict avoidance + approval)
app.post("/api/admin/timetables/generate", adminOnly, (req, res) => {
  const { sectionId, academicSessionId } = req.body || {};
  if (!sectionId) return res.status(400).json({ error: "sectionId required" });
  const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const assignments = db.prepare(`SELECT sa.subject_id, sa.teacher_id, sub.name AS subject_name
    FROM subject_assignments sa JOIN subjects sub ON sub.id=sa.subject_id
    WHERE (sa.section_id=? OR sa.section_id IS NULL) AND (sa.academic_session_id=? OR sa.academic_session_id IS NULL)`).all(sectionId, academicSessionId);
  const used = new Set();
  const suggestions = [];
  let p = 1;
  for (const a of assignments) {
    for (let d = 0; d < days.length && suggestions.length < 30; d++) {
      const day = days[d];
      const key = `${a.teacher_id}-${day}-${p}`;
      if (used.has(key)) { continue; }
      used.add(key);
      suggestions.push({ day, period: p, subjectId: a.subject_id, teacherId: a.teacher_id, subjectName: a.subject_name });
      if (++p > 6) p = 1;
      break;
    }
  }
  res.json({ ok: true, suggestions, note: "Review and approve before saving." });
});

// ---------------------------------------------------------------------------
// MODULE 08 — STUDY MATERIALS
// ---------------------------------------------------------------------------
app.get("/api/study-materials", requireAuth, (req, res) => {
  const { groupId, partId, subjectId } = req.query;
  let sql = `SELECT m.*, sub.name AS subject_name, u.full_name AS uploaded_by_name
             FROM study_materials m LEFT JOIN subjects sub ON sub.id=m.subject_id
             LEFT JOIN users u ON u.id=m.uploaded_by WHERE m.is_published=1`;
  const params = [];
  if (groupId) { sql += " AND (m.group_id=? OR m.group_id IS NULL)"; params.push(groupId); }
  if (partId) { sql += " AND (m.part_id=? OR m.part_id IS NULL)"; params.push(partId); }
  if (subjectId) { sql += " AND m.subject_id=?"; params.push(subjectId); }
  sql += " ORDER BY m.created_at DESC LIMIT 200";
  res.json({ materials: db.prepare(sql).all(...params) });
});

app.post("/api/study-materials", requireRole("ADMIN", "TEACHER"), (req, res, next) => {
  req.uploadSubdir = "materials";
  next();
}, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "File required" });
  const b = req.body || {};
  const info = db.prepare(`INSERT INTO study_materials (title, description, subject_id, group_id, part_id, chapter, file_path, file_type, uploaded_by, is_published)
    VALUES (?,?,?,?,?,?,?,?,?,1)`)
    .run(b.title || req.file.originalname, b.description || null, b.subjectId || null,
         b.groupId || null, b.partId || null, b.chapter || null,
         `/uploads/materials/${req.file.filename}`, req.file.mimetype, req.session.userId);
  res.json({ ok: true, id: info.lastInsertRowid, path: `/uploads/materials/${req.file.filename}` });
});

// ---------------------------------------------------------------------------
// MODULE 09 — NOTICES & NOTIFICATIONS
// ---------------------------------------------------------------------------
app.get("/api/notices", requireAuth, (req, res) => {
  res.json({ notices: db.prepare(`
    SELECT n.*, u.full_name AS created_by_name FROM notices n
    LEFT JOIN users u ON u.id=n.created_by ORDER BY n.created_at DESC LIMIT 200`).all() });
});

app.post("/api/notices", requireRole("ADMIN", "TEACHER"), (req, res) => {
  const b = req.body || {};
  if (!b.title) return res.status(400).json({ error: "Title required" });
  const info = db.prepare(`INSERT INTO notices (title, body, category, scope_group_id, scope_part_id, scope_section_id, audience, priority, scheduled_for, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(b.title, b.body || null, b.category || "college_wide",
      b.scopeGroupId || null, b.scopePartId || null, b.scopeSectionId || null,
      b.audience || "all", b.priority || "normal", b.scheduledFor || null, req.session.userId);

  // Real-time broadcast to appropriate rooms
  if (io) {
    if (b.audience === "all" || b.audience === "students") io.to("role:STUDENT").emit("notice", { title: b.title, body: b.body });
    if (b.audience === "all" || b.audience === "teachers") io.to("role:TEACHER").emit("notice", { title: b.title, body: b.body });
  }
  // Persist notifications for matching users
  const users = db.prepare("SELECT u.id, r.name AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.is_active=1").all();
  for (const u of users) {
    if (b.audience === "all" || (b.audience && u.role === (b.audience === "students" ? "STUDENT" : b.audience === "teachers" ? "TEACHER" : "ADMIN"))) {
      notify(u.id, "announcement", b.title, b.body || "");
    }
  }
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.get("/api/notifications", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100").all(req.session.userId);
  res.json({ notifications: rows });
});
app.post("/api/notifications/:id/read", requireAuth, (req, res) => {
  db.prepare("UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?").run(parseInt(req.params.id,10), req.session.userId);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// MODULE 10 — ADMIN ANALYTICS DASHBOARD
// ---------------------------------------------------------------------------
app.get("/api/admin/dashboard", adminOnly, (req, res) => {
  const totalStudents = db.prepare("SELECT COUNT(*) c FROM students WHERE status='active'").get().c;
  const part1 = db.prepare("SELECT COUNT(*) c FROM students WHERE part_id=1 AND status='active'").get().c;
  const part2 = db.prepare("SELECT COUNT(*) c FROM students WHERE part_id=2 AND status='active'").get().c;
  const totalTeachers = db.prepare("SELECT COUNT(*) c FROM teachers WHERE status='active'").get().c;
  const byGroup = db.prepare("SELECT g.name AS group_name, COUNT(s.id) AS count FROM study_groups g LEFT JOIN students s ON s.group_id=g.id AND s.status='active' GROUP BY g.id").all();
  const today = new Date().toISOString().slice(0, 10);
  const todayAttendance = db.prepare("SELECT COUNT(DISTINCT student_id) c FROM attendance WHERE date=?").get(today).c;
  const pendingAdmissions = db.prepare("SELECT COUNT(*) c FROM admissions WHERE status='pending'").get().c;
  const pendingApprovals = db.prepare(`SELECT
    (SELECT COUNT(*) FROM admissions WHERE status='pending') +
    (SELECT COUNT(*) FROM attendance_corrections WHERE status='pending') +
    (SELECT COUNT(*) FROM student_promotions WHERE status='pending') +
    (SELECT COUNT(*) FROM campus_reservations WHERE status='pending') AS c`).get().c;
  const feeCollected = db.prepare("SELECT COALESCE(SUM(amount_paid),0) s FROM fee_payments").get().s;
  const feePending = db.prepare(`SELECT COALESCE(SUM(f.amount - (SELECT COALESCE(SUM(amount_paid),0) FROM fee_payments WHERE fee_id=f.id)),0) s
    FROM fees f`).get().s;
  const upcomingExams = db.prepare("SELECT COUNT(*) c FROM examinations WHERE start_date >= date('now') AND status='scheduled'").get().c;
  const recentActivity = db.prepare("SELECT action, entity, detail, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 8").all();

  // AI-generated administrative summary — deterministic, transparent, no fake AI.
  const attendanceRate = totalStudents ? Math.round((todayAttendance / totalStudents) * 100) : 0;
  const summary = [
    `Campus has ${totalStudents} active students (${part1} in Part 1, ${part2} in Part 2) across ${totalTeachers} teachers.`,
    `Today's attendance headcount is ${todayAttendance} (~${attendanceRate}% of enrolled students).`,
    `${pendingAdmissions} admission applications are awaiting review and ${pendingApprovals} total approvals are pending.`,
    `Fee collection stands at PKR ${feeCollected.toLocaleString()} with PKR ${feePending.toLocaleString()} outstanding.`
  ].join(" ");

  res.json({
    totalStudents, part1, part2, totalTeachers, byGroup,
    todayAttendance, pendingAdmissions, pendingApprovals,
    feeCollected, feePending, upcomingExams, recentActivity,
    aiSummary: summary
  });
});

// ---------------------------------------------------------------------------
// BISE / Board records
// ---------------------------------------------------------------------------
app.post("/api/admin/board-registrations", adminOnly, (req, res) => {
  const b = req.body || {};
  const info = db.prepare("INSERT INTO board_registrations (student_id, bise_name, registration_no, session, group_id, registered_on) VALUES (?,?,?,?,?,?)")
    .run(b.studentId, b.biseName || "BISE Lahore", b.registrationNo || null, b.session || "2026-2027", b.groupId || null, b.registeredOn || new Date().toISOString().slice(0,10));
  res.json({ ok: true, id: info.lastInsertRowid });
});

// ---------------------------------------------------------------------------
// PART 1 -> PART 2 PROMOTION (with approval workflow)
// ---------------------------------------------------------------------------
app.get("/api/admin/promotions", adminOnly, (req, res) => {
  res.json({ promotions: db.prepare(`
    SELECT sp.*, u.full_name AS student_name FROM student_promotions sp
    JOIN students s ON s.id=sp.student_id JOIN users u ON u.id=s.user_id
    ORDER BY sp.created_at DESC LIMIT 200`).all() });
});

app.post("/api/admin/promotions", adminOnly, (req, res) => {
  const { studentId, fromPartId, toPartId, fromSectionId, toSectionId, academicSessionId } = req.body || {};
  if (!studentId || !toPartId) return res.status(400).json({ error: "Missing fields" });
  const info = db.prepare("INSERT INTO student_promotions (student_id, from_part_id, to_part_id, from_section_id, to_section_id, academic_session_id, status) VALUES (?,?,?,?,?,?,?)")
    .run(studentId, fromPartId, toPartId, fromSectionId, toSectionId, academicSessionId, "pending");
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.post("/api/admin/promotions/:id/approve", adminOnly, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const p = db.prepare("SELECT * FROM student_promotions WHERE id=?").get(id);
  if (!p) return res.status(404).json({ error: "Not found" });
  const tx = db.transaction(() => {
    db.prepare("UPDATE student_promotions SET status='approved', approved_by=? WHERE id=?").run(req.session.userId, id);
    db.prepare("UPDATE students SET part_id=?, section_id=?, academic_session_id=? WHERE id=?")
      .run(p.to_part_id, p.to_section_id, p.academic_session_id, p.student_id);
  });
  tx();
  audit(req.session.userId, "promotion.approve", "student_promotions", id, `student=${p.student_id}`, req.ip);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// COMPLAINTS (admin feature 8) + SUPPORT CASES (teacher feature 7)
// ---------------------------------------------------------------------------
app.get("/api/complaints", requireAuth, (req, res) => {
  res.json({ complaints: db.prepare(`
    SELECT c.*, u.full_name AS raised_by_name, a.full_name AS assigned_name
    FROM complaints c LEFT JOIN users u ON u.id=c.raised_by LEFT JOIN users a ON a.id=c.assigned_to
    ORDER BY c.created_at DESC LIMIT 200`).all() });
});

app.post("/api/complaints", requireAuth, (req, res) => {
  const b = req.body || {};
  if (!b.title) return res.status(400).json({ error: "Title required" });
  const info = db.prepare("INSERT INTO complaints (raised_by, category, priority, department, title, description, status) VALUES (?,?,?,?,?,?,?)")
    .run(req.session.userId, b.category || "general", b.priority || "normal", b.department || null, b.title, b.description || null, "open");
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.post("/api/admin/complaints/:id", adminOnly, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status, assignedTo, resolution } = req.body || {};
  db.prepare("UPDATE complaints SET status=?, assigned_to=?, resolution=?, updated_at=? WHERE id=?")
    .run(status || "open", assignedTo || null, resolution || null, Math.floor(Date.now()/1000), id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// CAMPUS RESERVATIONS (student feature 9) + MAP (admin feature 5)
// ---------------------------------------------------------------------------
app.get("/api/campus-reservations", requireAuth, (req, res) => {
  res.json({ reservations: db.prepare(`
    SELECT r.*, u.full_name AS user_name FROM campus_reservations r
    JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC LIMIT 200`).all() });
});
app.post("/api/campus-reservations", requireAuth, (req, res) => {
  const b = req.body || {};
  if (!b.facility || !b.reservedDate) return res.status(400).json({ error: "Missing fields" });
  const info = db.prepare("INSERT INTO campus_reservations (user_id, facility, purpose, reserved_date, start_time, end_time, status) VALUES (?,?,?,?,?,?,?)")
    .run(req.session.userId, b.facility, b.purpose || null, b.reservedDate, b.startTime || null, b.endTime || null, "pending");
  res.json({ ok: true, id: info.lastInsertRowid });
});
app.post("/api/admin/campus-reservations/:id/decision", adminOnly, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status } = req.body || {};
  db.prepare("UPDATE campus_reservations SET status=?, approved_by=? WHERE id=?").run(status, req.session.userId, id);
  res.json({ ok: true });
});

app.get("/api/campus-map", requireAuth, (req, res) => {
  res.json({ locations: db.prepare("SELECT * FROM campus_locations ORDER BY floor, name").all() });
});
app.post("/api/admin/campus-map", adminOnly, (req, res) => {
  const b = req.body || {};
  const info = db.prepare("INSERT INTO campus_locations (name, type, floor, description, is_available) VALUES (?,?,?,?,1)")
    .run(b.name, b.type || "classroom", b.floor || null, b.description || null);
  res.json({ ok: true, id: info.lastInsertRowid });
});

// ---------------------------------------------------------------------------
// PROJECTS (student feature 7) + ACHIEVEMENTS (student feature 4)
// ---------------------------------------------------------------------------
app.get("/api/projects", requireAuth, (req, res) => {
  res.json({ projects: db.prepare(`
    SELECT p.*, u.full_name AS owner_name, (SELECT COUNT(*) FROM project_members WHERE project_id=p.id) AS member_count
    FROM projects p LEFT JOIN students s ON s.id=p.owner_id LEFT JOIN users u ON u.id=s.user_id
    ORDER BY p.created_at DESC LIMIT 100`).all() });
});
app.post("/api/projects", requireAuth, (req, res) => {
  const b = req.body || {};
  if (!b.title) return res.status(400).json({ error: "Title required" });
  const stud = db.prepare("SELECT id FROM students WHERE user_id=?").get(req.session.userId);
  if (!stud) return res.status(403).json({ error: "Only students can create projects" });
  const info = db.prepare("INSERT INTO projects (owner_id, title, description, deadline) VALUES (?,?,?,?)")
    .run(stud.id, b.title, b.description || null, b.deadline || null);
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.get("/api/achievements", requireAuth, (req, res) => {
  const { studentId } = req.query;
  let sql = `SELECT a.*, u.full_name AS student_name FROM achievements a JOIN students s ON s.id=a.student_id JOIN users u ON u.id=s.user_id WHERE 1=1`;
  const params = [];
  if (studentId) { sql += " AND a.student_id=?"; params.push(studentId); }
  sql += " ORDER BY a.date DESC";
  res.json({ achievements: db.prepare(sql).all(...params) });
});
app.post("/api/achievements", requireAuth, (req, res) => {
  const b = req.body || {};
  const stud = db.prepare("SELECT id FROM students WHERE user_id=?").get(req.session.userId);
  const targetStudent = stud ? stud.id : b.studentId;
  if (!targetStudent) return res.status(400).json({ error: "studentId required" });
  const info = db.prepare("INSERT INTO achievements (student_id, title, category, issuer, date, verified) VALUES (?,?,?,?,?,0)")
    .run(targetStudent, b.title, b.category || null, b.issuer || null, b.date || new Date().toISOString().slice(0,10));
  res.json({ ok: true, id: info.lastInsertRowid });
});

// ---------------------------------------------------------------------------
// SYLLABUS TRACKER (teacher feature 6) + MESSAGES (teacher feature 10)
// ---------------------------------------------------------------------------
app.get("/api/syllabus", requireAuth, (req, res) => {
  res.json({ topics: db.prepare(`
    SELECT st.*, sub.name AS subject_name FROM syllabus_topics st
    JOIN subjects sub ON sub.id=st.subject_id ORDER BY st.id DESC LIMIT 500`).all() });
});
app.post("/api/syllabus", requireRole("ADMIN", "TEACHER"), (req, res) => {
  const b = req.body || {};
  if (!b.subjectId || !b.topic) return res.status(400).json({ error: "Missing fields" });
  const info = db.prepare("INSERT INTO syllabus_topics (subject_id, section_id, chapter, topic, target_date, is_completed) VALUES (?,?,?,?,?,?)")
    .run(b.subjectId, b.sectionId || null, b.chapter || null, b.topic, b.targetDate || null, b.isCompleted ? 1 : 0);
  res.json({ ok: true, id: info.lastInsertRowid });
});
app.patch("/api/syllabus/:id", requireRole("ADMIN", "TEACHER"), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const b = req.body || {};
  db.prepare("UPDATE syllabus_topics SET is_completed=?, completed_on=? WHERE id=?")
    .run(b.isCompleted ? 1 : 0, b.isCompleted ? new Date().toISOString().slice(0,10) : null, id);
  res.json({ ok: true });
});

app.get("/api/messages", requireAuth, (req, res) => {
  res.json({ messages: db.prepare(`
    SELECT m.*, fu.full_name AS from_name, tu.full_name AS to_name FROM messages m
    LEFT JOIN users fu ON fu.id=m.from_user LEFT JOIN users tu ON tu.id=m.to_user
    WHERE m.from_user=? OR m.to_user=? ORDER BY m.created_at DESC LIMIT 200`).all(req.session.userId, req.session.userId) });
});
app.post("/api/messages", requireAuth, (req, res) => {
  const b = req.body || {};
  if (!b.toUser || !b.body) return res.status(400).json({ error: "Missing fields" });
  const info = db.prepare("INSERT INTO messages (from_user, to_user, body) VALUES (?,?,?)")
    .run(req.session.userId, b.toUser, b.body);
  notify(b.toUser, "account", "New message", b.body.slice(0, 120));
  res.json({ ok: true, id: info.lastInsertRowid });
});

// ---------------------------------------------------------------------------
// TEACHER-specific endpoints (current classes, workload, heatmap)
// ---------------------------------------------------------------------------
app.get("/api/teacher/me", requireRole("TEACHER"), (req, res) => {
  const t = db.prepare(`SELECT t.*, u.full_name, u.email, u.phone FROM teachers t JOIN users u ON u.id=t.user_id WHERE u.id=?`).get(req.session.userId);
  if (!t) return res.status(404).json({ error: "Teacher profile missing" });
  const classes = db.prepare(`SELECT sa.subject_id, sub.name AS subject_name, s.name AS section_name, g.name AS group_name, p.name AS part_name
    FROM subject_assignments sa JOIN subjects sub ON sub.id=sa.subject_id
    LEFT JOIN sections s ON s.id=sa.section_id
    LEFT JOIN study_groups g ON g.id=s.group_id
    LEFT JOIN parts p ON p.id=s.part_id
    WHERE sa.teacher_id=?`).all(t.id);
  const workload = db.prepare(`SELECT COUNT(*) AS periods FROM timetables WHERE teacher_id=?`).get(t.id).periods;
  res.json({ teacher: t, classes, workload });
});

// Classroom heatmap (teacher feature 3): aggregate marks by subject
app.get("/api/teacher/heatmap", requireRole("TEACHER", "ADMIN"), (req, res) => {
  const rows = db.prepare(`SELECT sub.name AS subject_name, AVG(m.obtained) AS avg_obtained, MAX(m.obtained) AS max_obtained, MIN(m.obtained) AS min_obtained, COUNT(*) AS count
    FROM marks m JOIN subjects sub ON sub.id=m.subject_id GROUP BY sub.id ORDER BY avg_obtained DESC`).all();
  res.json({ heatmap: rows });
});

// ---------------------------------------------------------------------------
// STUDENT-specific endpoints
// ---------------------------------------------------------------------------
app.get("/api/student/me", requireRole("STUDENT"), (req, res) => {
  const s = db.prepare(`SELECT s.*, u.full_name, u.email, u.phone, g.name AS group_name, p.name AS part_name, sess.name AS session_name
    FROM students s JOIN users u ON u.id=s.user_id
    LEFT JOIN study_groups g ON g.id=s.group_id
    LEFT JOIN parts p ON p.id=s.part_id
    LEFT JOIN academic_sessions sess ON sess.id=s.academic_session_id
    WHERE u.id=?`).get(req.session.userId);
  if (!s) return res.status(404).json({ error: "Student profile missing" });
  const attendance = db.prepare(`SELECT COUNT(*) AS total,
    SUM(CASE WHEN status='present' THEN 1 ELSE 0 END) AS present FROM attendance WHERE student_id=?`).get(s.id);
  const attendanceRate = attendance.total ? Math.round((attendance.present / attendance.total) * 100) : 100;
  const pendingFees = db.prepare(`SELECT COALESCE(SUM(f.amount - (SELECT COALESCE(SUM(amount_paid),0) FROM fee_payments WHERE fee_id=f.id)),0) AS s
    FROM fees f WHERE f.student_id=?`).get(s.id).s;
  const upcoming = db.prepare(`SELECT e.name, e.start_date FROM examinations e WHERE e.group_id=? AND e.start_date >= date('now') ORDER BY e.start_date LIMIT 5`).all(s.group_id);
  res.json({ student: s, attendanceRate, pendingFees, upcoming });
});

// ---------------------------------------------------------------------------
// AI endpoints (graceful fallback — never pretend a service is configured)
// ---------------------------------------------------------------------------
function aiFallback(label, prompt) {
  return `[Local rule-based assistant — no external AI service configured.
Set AI_API_KEY in .env to enable a live provider.]
${label}: ${prompt}`;
}

app.post("/api/ai/study-companion", requireAuth, (req, res) => {
  const { question, subjectId } = req.body || {};
  if (!question) return res.status(400).json({ error: "question required" });
  let answer;
  if (AI_API_KEY) {
    // Real integration point: a fetch() to the configured provider would go here.
    // Left unimplemented intentionally — see README "AI integration" section.
    answer = aiFallback("Study companion", question);
  } else {
    // RAG-style local retrieval over uploaded study materials (titles + chapters)
    const subj = subjectId ? db.prepare("SELECT name FROM subjects WHERE id=?").get(subjectId) : null;
    const mats = db.prepare(`SELECT title, chapter, description FROM study_materials WHERE is_published=1 ${subjectId ? "AND (subject_id=? OR subject_id IS NULL)" : ""} LIMIT 5`).all(...(subjectId ? [subjectId] : []));
    answer = {
      provider: "local-rag",
      subject: subj?.name || "general",
      answer: `I can help with "${question}". Based on the materials available: ${(mats.map(m => m.title).join("; ") || "no materials yet — ask your teacher to upload notes.")}.`,
      sources: mats.map(m => ({ title: m.title, chapter: m.chapter }))
    };
  }
  res.json({ ok: true, ...answer });
});

app.post("/api/ai/teacher-copilot", requireRole("TEACHER", "ADMIN"), (req, res) => {
  const { topic, kind } = req.body || {};
  res.json({ ok: true, provider: "local",
    plan: aiFallback(`${kind || "lesson plan"} for ${topic || "your topic"}`, "Generated locally — review and approve before use.") });
});

app.post("/api/ai/assessment-studio", requireRole("TEACHER", "ADMIN"), (req, res) => {
  const { topic, count, type } = req.body || {};
  const n = Math.min(parseInt(count || 5, 10), 10);
  // Generate skeleton MCQs deterministically from the topic — editable/approveable before publishing.
  const questions = Array.from({ length: n }, (_, i) => ({
    q: `${i + 1}. Which best describes a key concept of "${topic || "this topic"}"? (Practice question — auto-generated)`,
    options: ["A. Concept A", "B. Concept B", "C. Concept C", "D. Concept D"],
    answer: "A"
  }));
  res.json({ ok: true, provider: "local", type: type || "mcq", questions });
});

app.post("/api/ai/timetable-architect", adminOnly, (req, res) => {
  // Reuse the conflict-free generator from /api/admin/timetables/generate
  const { sectionId, academicSessionId } = req.body || {};
  if (!sectionId) return res.status(400).json({ error: "sectionId required" });
  const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const assignments = db.prepare(`SELECT sa.subject_id, sa.teacher_id, sub.name AS subject_name
    FROM subject_assignments sa JOIN subjects sub ON sub.id=sa.subject_id
    WHERE (sa.section_id=? OR sa.section_id IS NULL) AND (sa.academic_session_id=? OR sa.academic_session_id IS NULL)`).all(sectionId, academicSessionId);
  const suggestions = [];
  let p = 1, d = 0;
  for (const a of assignments) {
    suggestions.push({ day: days[d % days.length], period: p, subjectId: a.subject_id, teacherId: a.teacher_id, subjectName: a.subject_name });
    if (++p > 6) { p = 1; d++; }
    if (suggestions.length >= 36) break;
  }
  res.json({ ok: true, suggestions, note: "Suggestions are conflict-free within this section. Verify cross-section teacher clashes before approval." });
});

app.post("/api/ai/campus-agent", requireAuth, (req, res) => {
  const { query } = req.body || {};
  if (!query) return res.status(400).json({ error: "query required" });
  // Role-scoped answer using only authorized data; never performs sensitive actions.
  let answer = "";
  const role = req.session.role;
  if (role === "ADMIN") {
    const s = db.prepare("SELECT COUNT(*) c FROM students WHERE status='active'").get().c;
    answer = `As an admin, you can ask about campus-wide statistics. Currently ${s} students are active. Use the dashboard for the full breakdown.`;
  } else if (role === "TEACHER") {
    answer = `As a teacher, I can summarise your classes and student marks. Try the Classroom Learning Heatmap for performance trends.`;
  } else {
    answer = `As a student, I can explain topics from your uploaded notes and answer subject questions. Type a question and pick a subject.`;
  }
  res.json({ ok: true, answer, query });
});

// ---------------------------------------------------------------------------
// File serving for uploads (authenticated, path-traversal safe)
// ---------------------------------------------------------------------------
app.get("/uploads/*", requireAuth, (req, res) => {
  const rel = req.params[0];
  if (!rel || rel.includes("..")) return res.status(400).end();
  const file = path.join(FILE_STORAGE_PATH, rel);
  if (!file.startsWith(FILE_STORAGE_PATH)) return res.status(400).end();
  if (!fs.existsSync(file)) return res.status(404).end();
  res.sendFile(file);
});

// ---------------------------------------------------------------------------
// 404 + error handler (no stack traces in production)
// ---------------------------------------------------------------------------
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File too large (max 10MB)" });
  }
  if (err && err.message === "File type not allowed") {
    return res.status(415).json({ error: err.message });
  }
  if (err && err.message === "Executable files are forbidden") {
    return res.status(400).json({ error: err.message });
  }
  console.error("[error]", err);
  res.status(500).json({ error: NODE_ENV === "production" ? "Internal server error" : (err.message || "Error") });
});

// ---------------------------------------------------------------------------
// Production: serve the built Vite frontend
// ---------------------------------------------------------------------------
if (NODE_ENV === "production") {
  const distDir = path.join(__dirname, "dist");
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api") || req.path.startsWith("/uploads") || req.path.startsWith("/socket.io")) return next();
      res.sendFile(path.join(distDir, "index.html"));
    });
  } else {
    console.warn("[warn] dist/ not found — run `npm run build` before starting in production.");
  }
}

// ---------------------------------------------------------------------------
// Socket.IO (auth + role rooms)
// ---------------------------------------------------------------------------
io = new SocketIOServer(server, {
  cors: { origin: allowedOrigins, credentials: true }
});
io.use((socket, next) => {
  // Reuse the session middleware to authenticate the socket
  sessionMiddleware(socket.request, {}, () => {
    const uid = socket.request.session?.userId;
    const role = socket.request.session?.role;
    if (!uid) return next(new Error("unauthorized"));
    socket.data.userId = uid;
    socket.data.role = role;
    next();
  });
});
io.on("connection", (socket) => {
  socket.join(`user:${socket.data.userId}`);
  socket.join(`role:${socket.data.role}`);
  socket.on("ping", () => socket.emit("pong", { ts: Date.now() }));
});

// ---------------------------------------------------------------------------
// Optional: seed a default admin (idempotent) on first run
// ---------------------------------------------------------------------------
function seedAdmin() {
  const exists = db.prepare("SELECT id FROM users WHERE username='admin'").get();
  if (!exists) {
    argon2.hash("Admin@12345", { type: argon2.argon2id }).then((hash) => {
      db.prepare("INSERT INTO users (username, password_hash, role_id, full_name, is_active, must_change_password) VALUES (?, ?, 1, ?, 1, 0)")
        .run("admin", hash, "System Administrator");
      console.log("[seed] Created default admin — username: admin / password: Admin@12345 (change immediately in production)");
    });
  }
}
seedAdmin();

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`SmartCampus 360 backend running on :${PORT} (NODE_ENV=${NODE_ENV})`);
  console.log(`Database: ${DATABASE_PATH}`);
  console.log(`File storage: ${FILE_STORAGE_PATH}`);
});

export { app, io, db };
