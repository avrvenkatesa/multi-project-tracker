const nodemailer = require('nodemailer');

let transporter;

if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });

  transporter.verify((error, success) => {
    if (error) {
      console.error('📧 Email service error:', error.message);
    } else {
      console.log('📧 Email service ready (Gmail)');
    }
  });
} else {
  console.warn('⚠️  Email service not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD environment variables.');
  
  transporter = {
    sendMail: async () => {
      console.log('📧 Email not sent - service not configured');
      return { messageId: 'test-' + Date.now() };
    }
  };
}

async function sendEmail({ to, subject, html, text }) {
  try {
    const info = await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME || 'Multi-Project Tracker'}" <${process.env.EMAIL_FROM || process.env.GMAIL_USER || 'noreply@example.com'}>`,
      to,
      subject,
      html,
      text
    });
    console.log('📧 Email sent:', info.messageId, 'to:', to);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('📧 Email send error:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { sendEmail, transporter };
