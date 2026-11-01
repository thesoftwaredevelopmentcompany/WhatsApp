const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');
const fs = require('fs');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

let client;
let waState = { status: 'starting', qrDataUrl: null, message: 'Starting WhatsApp Web session…' };
let sendBusy = false;
const report = [];
const MAX_REPORT = 2000;

function addReport(entry) {
  report.push({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, at: new Date().toISOString(), ...entry });
  if (report.length > MAX_REPORT) report.splice(0, report.length - MAX_REPORT);
}
function safeText(v, max = 4000) {
  return String(v ?? '').slice(0, max);
}
function cleanPhone(v) {
  return String(v ?? '').replace(/\D/g, '');
}
function normalizeContact(row, index) {
  const keys = {};
  for (const [k, v] of Object.entries(row || {})) keys[String(k).trim().toLowerCase().replace(/[\s_-]+/g, '')] = v;
  const name = keys.name || keys.fullname || keys.contactname || keys.customer || `Contact ${index + 1}`;
  const phone = cleanPhone(keys.phone || keys.phonenumber || keys.mobile || keys.whatsapp || keys.number || '');
  const consent = String(keys.optedin ?? keys.consent ?? keys.whatsappconsent ?? keys.permission ?? '').trim().toLowerCase();
  const optedIn = ['yes', 'y', 'true', '1', 'opted-in', 'optedin', 'consented'].includes(consent);
  return { id: `${Date.now()}-${index}-${phone}`, name: safeText(name, 150).trim(), phone, optedIn };
}
function parseCsv(text) {
  // Small CSV parser supporting quoted commas and escaped quotes.
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else {
      if (c === '"') quoted = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
  }
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  if (rows.length < 2) return [];
  const headers = rows.shift().map(h => h.trim());
  return rows.filter(r => r.some(v => String(v).trim())).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
}

function startWhatsApp() {
  client = new Client({
    authStrategy: new LocalAuth({ clientId: 'broadcast-desk' }),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
    takeoverOnConflict: true,
    takeoverTimeoutMs: 0
  });
  client.on('qr', async qr => {
    try {
      waState = { status: 'qr', qrDataUrl: await QRCode.toDataURL(qr), message: 'Scan this QR code with WhatsApp on your phone.' };
    } catch {
      waState = { status: 'error', qrDataUrl: null, message: 'Could not generate QR code.' };
    }
  });
  client.on('authenticated', () => {
    waState = { status: 'connecting', qrDataUrl: null, message: 'Authenticated. Connecting…' };
  });
  client.on('ready', () => {
    waState = { status: 'connected', qrDataUrl: null, message: 'WhatsApp Web session connected.' };
    console.log('WhatsApp client is ready.');
  });
  client.on('auth_failure', msg => {
    waState = { status: 'error', qrDataUrl: null, message: `Authentication failed: ${safeText(msg, 200)}` };
  });
  client.on('disconnected', reason => {
    waState = { status: 'disconnected', qrDataUrl: null, message: `WhatsApp disconnected: ${safeText(reason, 200)}` };
  });
  client.initialize().catch(err => {
    waState = { status: 'error', qrDataUrl: null, message: `Could not initialize WhatsApp Web: ${safeText(err.message, 250)}` };
    console.error(err);
  });
}
startWhatsApp();

app.get('/api/status', (_req, res) => res.json({
  status: waState.status,
  qrDataUrl: waState.qrDataUrl,
  message: waState.message,
  connected: waState.status === 'connected',
  mode: 'unofficial-whatsapp-web'
}));

app.post('/api/contacts/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a CSV file.' });
  if (!/\.csv$/i.test(req.file.originalname)) return res.status(400).json({ error: 'This Node starter accepts CSV files. Export your Excel sheet as CSV first.' });
  const rows = parseCsv(req.file.buffer.toString('utf8').replace(/^\uFEFF/, ''));
  const seen = new Set();
  const contacts = rows.map(normalizeContact).filter(c => {
    if (!c.phone || seen.has(c.phone)) return false;
    seen.add(c.phone); return true;
  });
  res.json({ contacts, count: contacts.length, unverified: contacts.filter(c => !c.optedIn).length });
});

app.post('/api/send', async (req, res) => {
  if (sendBusy) return res.status(409).json({ error: 'A send batch is already running.' });
  if (waState.status !== 'connected' || !client) return res.status(409).json({ error: 'WhatsApp is not connected. Scan the QR code first.' });
  const { contacts, message, confirmed } = req.body || {};
  if (!confirmed) return res.status(400).json({ error: 'Explicit confirmation is required.' });
  if (!Array.isArray(contacts) || contacts.length < 1 || contacts.length > 200) return res.status(400).json({ error: 'Select between 1 and 200 contacts per batch.' });
  if (typeof message !== 'string' || !message.trim() || message.length > 4000) return res.status(400).json({ error: 'Message must be 1–4000 characters.' });
  const unique = new Set();
  for (const c of contacts) {
    const phone = cleanPhone(c.phone);
    if (phone.length < 8 || phone.length > 15 || unique.has(phone)) return res.status(400).json({ error: 'One or more phone numbers are invalid or duplicated.' });
    unique.add(phone);
  }
  sendBusy = true;
  res.json({ accepted: true, count: contacts.length, note: 'Batch accepted. Poll /api/report for per-recipient results.' });
  try {
    for (const contact of contacts) {
      const phone = cleanPhone(contact.phone);
      const name = safeText(contact.name || 'there', 150);
      const personalized = message.replace(/\{\{\s*name\s*\}\}/gi, name);
      try {
        const numberId = await client.getNumberId(phone);
        if (!numberId) {
          addReport({ name, phone, status: 'Failed', detail: 'Number is not registered on WhatsApp.' });
          continue;
        }
        const sent = await client.sendMessage(numberId._serialized, personalized);
        addReport({ name, phone, status: 'Submitted', detail: `WhatsApp Web accepted message (${sent.id?.id || 'message id unavailable'}). Delivery is not confirmed.` });
        // Conservative delay between messages; this is not a guarantee against account restrictions.
        await new Promise(resolve => setTimeout(resolve, 1800));
      } catch (err) {
        addReport({ name, phone, status: 'Failed', detail: safeText(err.message || 'Send failed', 250) });
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }
  } finally {
    sendBusy = false;
  }
});

app.get('/api/report', (_req, res) => res.json({ sending: sendBusy, report: report.slice(-500).reverse() }));
app.delete('/api/report', (_req, res) => { report.length = 0; res.json({ ok: true }); });

app.listen(PORT, HOST, () => {
  console.log(`Broadcast Desk available at http://${HOST}:${PORT}`);
  console.log('For local use only. Do not expose this unauthenticated app to the public internet.');
});

process.on('SIGINT', async () => {
  console.log('\nClosing WhatsApp session…');
  try { if (client) await client.destroy(); } catch {}
  process.exit(0);
});
