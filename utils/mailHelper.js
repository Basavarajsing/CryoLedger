const fs = require('fs');
const path = require('path');

// Try calling nodemailer if installed, fallback to file logger log
let nodemailer;
try {
    nodemailer = require('nodemailer');
} catch (e) {
    // Nodemailer not installed or failed to load
}

async function sendAssignEmail({ to, subject, html, text }) {
    const timestamp = new Date().toISOString();
    const emailRecord = `
========================================================================
[EMAIL NOTIFICATION DISPATCHED] - ${timestamp}
To: ${to}
Subject: ${subject}
------------------------------------------------------------------------
${text || html}
========================================================================
\n`;

    // Append to local log file in workspace
    const logPath = path.join(__dirname, '..', 'sent_emails.txt');
    try {
        fs.appendFileSync(logPath, emailRecord, 'utf8');
        console.log(`[MAIL DISPATCH] Successfully logged notification email to ${logPath}`);
    } catch (err) {
        console.error("[MAIL ERROR] Failed writing to sent_emails.txt:", err.message);
    }

    // Attempt real nodemailer send if configured in environment
    if (nodemailer && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        try {
            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || '587', 10),
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            });

            await transporter.sendMail({
                from: `"CryoLedger Security" <${process.env.SMTP_USER}>`,
                to,
                subject,
                text: text || "Product assignment update notification.",
                html
            });
            console.log(`[SMTP SUCCESS] Real email sent to: ${to}`);
        } catch (smtpErr) {
            console.error(`[SMTP ERROR] Real email dispatch failed:`, smtpErr.message);
        }
    } else {
        console.log(`[MAIL DISPATCH INFO] Real SMTP is not configured. Email logged to sent_emails.txt`);
    }

    return true;
}

module.exports = {
    sendAssignEmail
};
