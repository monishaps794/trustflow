const nodemailer = require('nodemailer');

const normalizeEmailValue = (value = '') => String(value)
  .trim()
  .replace(/^['"]+|['"]+$/g, '')
  .replace(/\s+/g, '');

const getSmtpUser = () => normalizeEmailValue(process.env.SMTP_USER || process.env.EMAIL_USER || '');
const getSmtpPass = () => normalizeEmailValue(process.env.SMTP_PASS || process.env.EMAIL_APP_PASSWORD || '');
const getSmtpFrom = () => (process.env.SMTP_FROM || process.env.EMAIL_FROM || getSmtpUser()).trim();

const hasPlaceholderSmtpConfig = () => {
  const host = (process.env.SMTP_HOST || '').trim().toLowerCase();
  const user = getSmtpUser();
  const pass = getSmtpPass();

  return (
    (host === 'smtp.gmail.com' || host === '' || host.includes('gmail.com')) &&
    (user === '' || user.includes('your_') || user.includes('example')) &&
    (pass === '' || pass.includes('your_') || pass.includes('example'))
  );
};

const createTransporter = () => {
  const configuredUser = getSmtpUser();
  const configuredPass = getSmtpPass();
  const configuredHost = (process.env.SMTP_HOST || 'smtp.gmail.com').trim().replace(/^['"]+|['"]+$/g, '');

  if (!configuredUser || !configuredPass || hasPlaceholderSmtpConfig()) {
    return null;
  }

  return nodemailer.createTransport({
    host: configuredHost,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    tls: {
      rejectUnauthorized: false,
    },
    auth: {
      user: configuredUser,
      pass: configuredPass.replace(/\s+/g, ''),
    },
  });
};

const sendEmail = async ({ to, subject, text, html }) => {
  const configuredUser = getSmtpUser();
  const configuredHost = (process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const transporter = createTransporter();

  if (!transporter) {
    console.warn('SMTP email delivery is not configured. Update backend/.env with a valid Gmail App Password or a transactional SMTP provider before sending live email.');
    return { success: false, fallback: false, error: 'SMTP_NOT_CONFIGURED' };
  }

  try {
    await transporter.verify();

    const info = await transporter.sendMail({
      from: getSmtpFrom() || configuredUser,
      to,
      subject,
      text,
      html,
    });

    if (info && info.rejected && info.rejected.length) {
      return { success: false, fallback: false, error: 'RECIPIENT_REJECTED' };
    }

    return { success: true, fallback: false, messageId: info?.messageId || null };
  } catch (error) {
    const safeError = /auth/i.test(error?.message || '') ? 'SMTP authentication failed' : 'SMTP connection failed';
    console.error('SMTP verification/send failed:', {
      code: error?.code,
      command: error?.command,
      response: error?.response,
      responseCode: error?.responseCode,
      message: error?.message,
    });
    return { success: false, fallback: false, error: safeError };
  }
};

const buildOtpHtml = ({ firstName, otp, purpose = 'login' }) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1f2937;">
    <h2 style="color: #0f172a;">TRUSTFLOW</h2>
    <h3 style="margin-bottom: 12px;">${purpose === 'admin' ? 'Admin Login Verification' : 'Secure Login Verification'}</h3>
    <p>Hello ${firstName || 'User'},</p>
    <p>Your TRUSTFLOW verification code is:</p>
    <div style="font-size: 32px; letter-spacing: 8px; font-weight: 700; margin: 20px 0; color: #111827;">${otp}</div>
    <p>This OTP is valid for a limited time and must not be shared.</p>
    <p>If you did not request this code, please secure your account immediately.</p>
    <p>Regards,<br/>TRUSTFLOW Security Team</p>
  </div>
`;

const buildSecurityActionHtml = ({ firstName, title, description, confirmUrl, rejectUrl }) => `
  <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; color: #1f2937;">
    <h2 style="color: #0f172a;">TRUSTFLOW</h2>
    <h3 style="margin-bottom: 12px;">${title}</h3>
    <p>Hello ${firstName || 'User'},</p>
    <p>${description}</p>
    <div style="margin: 24px 0; display: flex; gap: 12px; flex-wrap: wrap;">
      <a href="${confirmUrl}" style="background: #0f766e; color: white; text-decoration: none; padding: 12px 18px; border-radius: 8px; display: inline-block;">YES, IT'S ME</a>
      <a href="${rejectUrl}" style="background: #b91c1c; color: white; text-decoration: none; padding: 12px 18px; border-radius: 8px; display: inline-block;">NO</a>
    </div>
    <p>If you did not request this action, please contact TrustFlow support immediately.</p>
  </div>
`;

const buildNotificationHtml = ({ firstName, title, message, footer = 'TRUSTFLOW Security Team' }) => `
  <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; color: #1f2937; background: #f9fafb; border-radius: 16px;">
    <h2 style="color: #0f172a; margin-bottom: 8px;">TRUSTFLOW</h2>
    <h3 style="margin: 0 0 18px;">${title}</h3>
    <p>Hello ${firstName || 'User'},</p>
    <p>${message}</p>
    <p style="margin-top: 20px;">Regards,<br/>${footer}</p>
  </div>
`;

const createNotificationRecord = async ({ recipient, recipientRole = 'USER', type, title, message, severity = 'INFO', relatedEntityType = '', relatedEntityId = '', status = 'OPEN', sendEmailFlag = true }) => {
  const Alert = require('../models/Alert');
  const User = require('../models/User');
  const Admin = require('../models/Admin');

  const normalizedRole = String(recipientRole).toUpperCase();
  const recipientModel = normalizedRole === 'ADMIN' ? 'Admin' : 'User';
  const recipientId = recipient?._id || recipient?.id || null;

  let emailAddress = null;
  if (recipient && typeof recipient === 'object') {
    emailAddress = recipient.email || null;
  }

  if (!emailAddress && recipientId) {
    const model = recipientModel === 'Admin' ? Admin : User;
    const existing = await model.findById(recipientId).select('email').lean();
    emailAddress = existing?.email || null;
  }

  const notification = await Alert.create({
    type,
    title: title || type,
    user: normalizedRole === 'USER' ? recipientId : null,
    recipientId,
    recipientModel,
    recipientRole: normalizedRole,
    relatedEntityType,
    relatedEntityId: String(relatedEntityId || ''),
    message,
    severity,
    status,
    emailStatus: 'PENDING',
  });

  if (!sendEmailFlag || !emailAddress) {
    notification.emailStatus = 'SKIPPED';
    await notification.save();
    return notification;
  }

  const emailResult = await sendEmail({
    to: emailAddress,
    subject: `TRUSTFLOW — ${title || type}`,
    text: `${title || type}\n\n${message}`,
    html: buildNotificationHtml({ firstName: (recipient?.name || '').split(' ')[0] || 'User', title: title || type, message }),
  });

  notification.emailStatus = emailResult.success ? 'SENT' : 'FAILED';
  await notification.save();
  return notification;
};

module.exports = { sendEmail, buildOtpHtml, buildSecurityActionHtml, buildNotificationHtml, createNotificationRecord };
