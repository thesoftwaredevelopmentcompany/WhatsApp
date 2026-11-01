# Broadcast Desk — Node.js + Personal WhatsApp

A local web dashboard that links to a personal WhatsApp account using `whatsapp-web.js` (an unofficial WhatsApp Web automation library).

## Important limitations
- This is **not** Meta's official WhatsApp Business Platform API. It relies on WhatsApp Web and may break, trigger limits, or lead to account restrictions. Use at your own risk.
- Send only to people who explicitly expect your messages and have consented. Respect opt-outs. Do not use this for spam.
- The send report distinguishes `Submitted` from `Failed`; a submitted message is **not proof of delivery**.
- The app is bound to `127.0.0.1` by default. Do not expose it to the internet: there is no login/authentication in this starter.
- Session credentials persist in `.wwebjs_auth/`. Treat this directory as a password. Do not share it, commit it to Git, or upload it.
- The starter accepts CSV uploads. Export Excel workbooks as CSV first.

## Requirements
- Node.js 20+
- Chrome/Chromium-compatible environment for Puppeteer (the library installs Puppeteer as a dependency; Linux systems may need extra system packages).

## Run on Windows
1. Extract the ZIP.
2. Open Command Prompt in the extracted folder.
3. Run:
   ```bat
   npm install
   npm start
   ```
4. Open http://127.0.0.1:3000
5. Scan the QR with WhatsApp on your phone: **Settings / ⋮ → Linked devices → Link a device**.
6. Import a CSV with headers such as:
   ```csv
   name,phone,opted_in
   Example Contact,919876543210,yes
   ```
   Use international country code digits, no `+` required.
7. Select contacts, write the message (`{{name}}` is replaced), review, tick the consent confirmation, then send.

## Notes
- The first connection may take a little time. Keep the terminal open while using the dashboard.
- If the session stops working, remove the linked device from WhatsApp and restart/relink. Avoid deleting `.wwebjs_auth` unless you want to re-authenticate.
- For production or business-critical messaging, use Meta's official WhatsApp Business Platform Cloud API with approved templates and webhook status updates instead.
