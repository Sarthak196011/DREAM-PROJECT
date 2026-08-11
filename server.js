require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'changeme';
const BASE_COUNT = parseInt(process.env.BASE_COUNT || '214', 10); // vanity offset shown on the landing page
const DB_PATH = path.join(__dirname, 'data', 'waitlist.json');

// ---------- tiny JSON file "database" ----------
// Fine for a waitlist at launch scale. Swap for Postgres/Supabase/etc.
// if you need concurrent-write safety at high volume or multiple server instances.

function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({ entries: [] }, null, 2));
}

function readDb() {
  ensureDb();
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { entries: [] };
  }
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// ---------- optional email notification on new signup ----------
// Configure SMTP_* env vars to enable. Silently no-ops if not configured.
let mailer = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  const nodemailer = require('nodemailer');
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_PORT === '465',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function notifyNewSignup(email, number) {
  if (!mailer || !process.env.NOTIFY_TO) return;
  try {
    await mailer.sendMail({
      from: process.env.SMTP_USER,
      to: process.env.NOTIFY_TO,
      subject: `New Foreman waitlist signup — job #${number}`,
      text: `${email} just filed job #${number} on the Foreman waitlist.`,
    });
  } catch (err) {
    console.error('Notification email failed:', err.message);
  }
}

// ---------- app setup ----------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const waitlistLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 8, // 8 signup attempts per IP per minute is plenty for a real user, stops basic abuse
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a moment and try again.' },
});

// ---------- API routes ----------

// Join the waitlist
app.post('/api/waitlist', waitlistLimiter, async (req, res) => {
  const emailRaw = (req.body && req.body.email ? String(req.body.email) : '').trim().toLowerCase();

  if (!emailRe.test(emailRaw)) {
    return res.status(400).json({ error: 'That email address looks invalid.' });
  }

  const db = readDb();
  const existing = db.entries.find((e) => e.email === emailRaw);

  if (existing) {
    return res.status(200).json({
      alreadyOnList: true,
      number: existing.number,
    });
  }

  const number = String(db.entries.length + 1).padStart(4, '0');
  const entry = {
    email: emailRaw,
    number,
    ts: new Date().toISOString(),
    ip: req.ip,
  };

  db.entries.push(entry);
  writeDb(db);

  notifyNewSignup(emailRaw, number); // fire and forget

  return res.status(201).json({
    alreadyOnList: false,
    number,
  });
});

// Live count for the landing page counter
app.get('/api/waitlist/count', (req, res) => {
  const db = readDb();
  res.json({ count: db.entries.length, displayCount: BASE_COUNT + db.entries.length });
});

// Admin: export all signups as CSV. Protect with ?key=ADMIN_KEY
app.get('/api/waitlist/export', (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const db = readDb();
  const rows = ['email,number,timestamp'];
  db.entries.forEach((e) => rows.push(`${e.email},${e.number},${e.ts}`));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="foreman-waitlist.csv"');
  res.send(rows.join('\n'));
});

// Admin: raw JSON view. Protect with ?key=ADMIN_KEY
app.get('/api/waitlist', (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const db = readDb();
  res.json({ total: db.entries.length, entries: db.entries });
});

// Health check (useful for Render/Railway/Fly)
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Fallback to the landing page for any other route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Foreman server running on http://localhost:${PORT}`);
  console.log(`Admin export: http://localhost:${PORT}/api/waitlist/export?key=${ADMIN_KEY}`);
});
