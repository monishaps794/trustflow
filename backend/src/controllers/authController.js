const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Admin = require('../models/Admin');
const OTP = require('../models/OTP');
const LoginAttempt = require('../models/LoginAttempt');
const Session = require('../models/Session');
const Transaction = require('../models/Transaction');
const AuditLog = require('../models/AuditLog');
const ApprovalRequest = require('../models/ApprovalRequest');
const Alert = require('../models/Alert');
const Settings = require('../models/Settings');
const SecurityActionToken = require('../models/SecurityActionToken');
const { generateOtp, hashValue, verifyHash } = require('../utils/generateOtp');
const { sendEmail, buildOtpHtml, buildSecurityActionHtml, createNotificationRecord } = require('../utils/emailService');
const { scoreLoginRisk } = require('../services/riskService');
const { getRequestContext } = require('../utils/requestContext');

const createToken = (user, role, sessionId) => jwt.sign({ id: user._id.toString(), email: user.email, role, sid: sessionId?.toString() }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '8h' });

const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const createSecurityAction = async ({ email, user, admin, action, targetType, targetId, eventTitle, eventDescription }) => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  const record = await SecurityActionToken.create({
    user: user?._id || null,
    admin: admin?._id || null,
    email: email.toLowerCase(),
    action,
    targetType,
    targetId,
    tokenHash,
    expiresAt,
  });

  const baseUrl = process.env.APP_BASE_URL || 'http://localhost:5000';
  const confirmUrl = `${baseUrl}/api/security/email-action/${rawToken}?action=approve`;
  const rejectUrl = `${baseUrl}/api/security/email-action/${rawToken}?action=reject`;

  const recipientName = user?.name || admin?.name || 'User';
  const html = buildSecurityActionHtml({
    firstName: recipientName.split(' ')[0],
    title: eventTitle,
    description: eventDescription,
    confirmUrl,
    rejectUrl,
  });

  await sendEmail({
    to: email,
    subject: eventTitle,
    html,
    text: `${eventDescription}\n\nYES, IT'S ME: ${confirmUrl}\nNO: ${rejectUrl}`,
  });

  return { record, confirmUrl, rejectUrl };
};

const recordFailedLogin = async ({ req, email = '', user = null, reason }) => {
  const context = await getRequestContext(req);
  const attempt = await LoginAttempt.create({
    user: user?._id || null,
    email: email.toLowerCase(),
    ...context,
    status: 'FAILED',
    riskScore: 35,
    riskLevel: 'MEDIUM',
    reason,
  });
  await Alert.create({
    type: 'FAILED_LOGIN_ATTEMPT',
    user: user?._id || null,
    relatedLogin: attempt._id,
    message: `${reason} for ${email || 'unknown email'}.`,
    severity: 'MEDIUM',
    riskScore: attempt.riskScore,
    status: 'OPEN',
  });
};

const requestUserOtp = async (req, res) => {
  const { email } = req.body;
  if (!email || !validateEmail(email)) {
    await recordFailedLogin({ req, email: email || '', reason: 'Invalid email' });
    return res.status(400).json({ message: 'Invalid / unregistered email' });
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    await recordFailedLogin({ req, email, reason: 'Invalid / unregistered email' });
    return res.status(404).json({ message: 'Invalid / unregistered email' });
  }

  const otp = generateOtp();
  const hashedOtp = await hashValue(otp);
  const expiresAt = new Date(Date.now() + Number(process.env.OTP_EXPIRY_MINUTES || 5) * 60 * 1000);

  await OTP.deleteMany({ email: user.email, purpose: 'USER_LOGIN' });
  const otpRecord = await OTP.create({ email: user.email, purpose: 'USER_LOGIN', otpHash: hashedOtp, expiresAt, attempts: 0, verified: false });

  const emailResult = await sendEmail({
    to: user.email,
    subject: 'TRUSTFLOW — Secure Login Verification',
    text: `Your TRUSTFLOW secure login verification code is ${otp}. It expires in ${process.env.OTP_EXPIRY_MINUTES || 5} minutes.`,
    html: buildOtpHtml({ firstName: user.name?.split(' ')[0] || 'User', otp, purpose: 'user' }),
  });

  if (!emailResult.success) {
    if (process.env.NODE_ENV === 'development' || process.env.EMAIL_FALLBACK === 'true') {
      console.warn(`DEV OTP FALLBACK ENABLED for ${user.email}: ${otp}`);
      await AuditLog.create({
        actor: user.email,
        actorRole: 'USER',
        action: 'OTP_GENERATED_FALLBACK',
        resource: 'OTP',
        resourceId: otpRecord._id.toString(),
        ipAddress: req.ip,
        metadata: { purpose: 'USER_LOGIN', fallback: true },
      });
      return res.status(200).json({ success: true, message: 'OTP generated in development fallback mode. Use the OTP shown in the server console.', devOtp: otp });
    }
    return res.status(500).json({ success: false, message: 'Unable to send OTP to the registered email. Please try again.' });
  }

  await AuditLog.create({
    actor: user.email,
    actorRole: 'USER',
    action: 'OTP_GENERATED',
    resource: 'OTP',
    resourceId: otpRecord._id.toString(),
    ipAddress: req.ip,
    metadata: { purpose: 'USER_LOGIN' },
  });

  res.status(200).json({ success: true, message: 'OTP sent to your registered email address.' });
};

const verifyUserOtp = async (req, res) => {
  const { email, otp } = req.body;
  const user = email && validateEmail(email) ? await User.findOne({ email: email.toLowerCase() }) : null;
  if (!email || !validateEmail(email) || !otp) {
    await recordFailedLogin({ req, email: email || '', user, reason: 'Invalid email or OTP' });
    return res.status(400).json({ message: 'Invalid email or OTP.' });
  }

  const record = await OTP.findOne({ email: email.toLowerCase(), purpose: 'USER_LOGIN' }).sort({ createdAt: -1 });
  if (!record) {
    await recordFailedLogin({ req, email, user, reason: 'Invalid OTP' });
    return res.status(400).json({ message: 'Please enter a valid OTP.' });
  }

  if (record.expiresAt < new Date()) {
    await recordFailedLogin({ req, email, user, reason: 'Expired OTP' });
    return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
  }

  const isValid = await verifyHash(otp.toString(), record.otpHash);
  if (!isValid) {
    record.attempts += 1;
    await record.save();
    await recordFailedLogin({ req, email, user, reason: 'Invalid OTP' });
    if (record.attempts >= Number(process.env.MAX_OTP_ATTEMPTS || 5)) {
      return res.status(429).json({ message: 'Too many OTP attempts. Please request a new OTP.' });
    }
    return res.status(400).json({ message: 'Please enter a valid OTP.' });
  }

  record.verified = true;
  await record.save();

  await AuditLog.create({
    actor: user.email,
    actorRole: 'USER',
    action: 'OTP_VERIFIED',
    resource: 'OTP',
    resourceId: record._id.toString(),
    ipAddress: req.ip,
    status: 'SUCCESS',
  });

  res.status(200).json({ message: 'OTP verified successfully.', user: { id: user._id, email: user.email, name: user.name } });
};

const registerUser = async (req, res) => {
  const { name, accountNumber, accountHolderType, email, phone, address, accountType } = req.body;

  if (!name || !accountNumber || !accountHolderType || !email || !phone || !address || !accountType) {
    return res.status(400).json({ message: 'All user fields are required.' });
  }

  const normalizedEmail = email.toLowerCase();
  const normalizedPhone = phone.trim();
  const normalizedAccount = accountNumber.trim();

  const existing = await User.findOne({
    $or: [{ email: normalizedEmail }, { phone: normalizedPhone }, { accountNumber: normalizedAccount }],
  });

  if (existing) {
    await AuditLog.create({
      actor: normalizedEmail,
      actorRole: 'USER',
      action: 'DUPLICATE_REGISTRATION_DETECTED',
      resource: 'USER',
      resourceId: existing._id.toString(),
      ipAddress: req.ip,
      status: 'BLOCKED',
      metadata: { reason: 'Duplicate details detected' },
    });
    return res.status(409).json({ message: 'Duplicate details detected. This information is already registered.' });
  }

  const user = await User.create({
    name,
    accountNumber: normalizedAccount,
    accountHolderType,
    accountType,
    email: normalizedEmail,
    phone: normalizedPhone,
    address,
    accountStatus: 'ACTIVE',
    securityStatus: 'SECURE',
    riskLevel: 'LOW',
    securityScore: 5,
    notificationPreferences: {
      securityNotifications: true,
      transactionNotifications: true,
      loginNotifications: true,
    },
    securityPreferences: {
      otpVerification: true,
      loginAlerts: true,
      transactionAlerts: true,
    },
  });

  await Settings.create({
    owner: user._id,
    ownerModel: 'User',
    userNotifications: user.notificationPreferences,
    securityPreferences: user.securityPreferences,
  });

  await AuditLog.create({
    actor: normalizedEmail,
    actorRole: 'USER',
    action: 'USER_REGISTERED',
    resource: 'USER',
    resourceId: user._id.toString(),
    ipAddress: req.ip,
    status: 'SUCCESS',
  });

  await sendEmail({
    to: normalizedEmail,
    subject: 'Welcome to TrustFlow',
    text: `Welcome ${name}! Your TrustFlow account has been created successfully.`,
  });

  res.status(201).json({ message: 'Registration successful. You can now login with your email and OTP.', user: { id: user._id, email: user.email, name: user.name } });
};

const adminRegister = async (req, res) => {
  const { name, email, role } = req.body;
  if (!name || !email) return res.status(400).json({ message: 'Name and email are required.' });

  const normalizedEmail = email.toLowerCase();
  const existing = await Admin.findOne({ email: normalizedEmail });
  if (existing) return res.status(409).json({ message: 'Admin already exists.' });

  const admin = await Admin.create({ name, email: normalizedEmail, role: role || 'ADMIN' });
  await Settings.create({
    owner: admin._id,
    ownerModel: 'Admin',
    userNotifications: { securityNotifications: true, transactionNotifications: true, loginNotifications: true },
    securityPreferences: { otpVerification: true, loginAlerts: true, transactionAlerts: true },
  });

  await AuditLog.create({
    actor: normalizedEmail,
    actorRole: 'ADMIN',
    action: 'ADMIN_REGISTERED',
    resource: 'ADMIN',
    resourceId: admin._id.toString(),
    ipAddress: req.ip,
    status: 'SUCCESS',
  });

  res.status(201).json({ message: 'Admin registered successfully.', admin: { id: admin._id, email: admin.email, role: admin.role } });
};

const requestAdminOtp = async (req, res) => {
  const { email } = req.body;
  if (!email || !validateEmail(email)) return res.status(400).json({ message: 'Invalid admin email.' });

  let admin = await Admin.findOne({ email: email.toLowerCase() });
  if (!admin) {
    admin = await Admin.create({
      name: 'System Admin',
      email: email.toLowerCase(),
      role: 'ADMIN',
      mfaEnabled: true,
    });

    await Settings.create({
      owner: admin._id,
      ownerModel: 'Admin',
      userNotifications: { securityNotifications: true, transactionNotifications: true, loginNotifications: true },
      securityPreferences: { otpVerification: true, loginAlerts: true, transactionAlerts: true },
    });

    await AuditLog.create({
      actor: admin.email,
      actorRole: 'ADMIN',
      action: 'ADMIN_AUTO_CREATED',
      resource: 'ADMIN',
      resourceId: admin._id.toString(),
      ipAddress: req.ip,
      status: 'SUCCESS',
      metadata: { reason: 'Auto-created for admin login flow fallback' },
    });
  }

  const otp = generateOtp();
  const hashedOtp = await hashValue(otp);
  const expiresAt = new Date(Date.now() + Number(process.env.OTP_EXPIRY_MINUTES || 5) * 60 * 1000);

  await OTP.deleteMany({ email: admin.email, purpose: 'ADMIN_LOGIN' });
  const otpRecord = await OTP.create({ email: admin.email, purpose: 'ADMIN_LOGIN', otpHash: hashedOtp, expiresAt, attempts: 0, verified: false });

  const emailResult = await sendEmail({
    to: admin.email,
    subject: 'TRUSTFLOW — Admin Login Verification',
    text: `Your TRUSTFLOW administrator verification code is ${otp}. It expires in ${process.env.OTP_EXPIRY_MINUTES || 5} minutes.`,
    html: buildOtpHtml({ firstName: admin.name?.split(' ')[0] || 'Admin', otp, purpose: 'admin' }),
  });

  if (!emailResult.success) {
    if (process.env.NODE_ENV === 'development' || process.env.EMAIL_FALLBACK === 'true') {
      console.warn(`DEV OTP FALLBACK ENABLED for ${admin.email}: ${otp}`);
      await AuditLog.create({
        actor: admin.email,
        actorRole: 'ADMIN',
        action: 'OTP_GENERATED_FALLBACK',
        resource: 'OTP',
        resourceId: otpRecord._id.toString(),
        ipAddress: req.ip,
        metadata: { purpose: 'ADMIN_LOGIN', fallback: true },
      });
      return res.status(200).json({ success: true, message: 'OTP generated in development fallback mode. Use the OTP shown in the server console.', devOtp: otp });
    }
    return res.status(500).json({ success: false, message: 'Unable to send OTP to the registered email. Please try again.' });
  }

  await AuditLog.create({
    actor: admin.email,
    actorRole: 'ADMIN',
    action: 'OTP_GENERATED',
    resource: 'OTP',
    resourceId: otpRecord._id.toString(),
    ipAddress: req.ip,
    metadata: { purpose: 'ADMIN_LOGIN' },
  });

  res.status(200).json({ success: true, message: 'OTP sent to your registered admin email address.' });
};

const verifyAdminOtp = async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !validateEmail(email) || !otp) return res.status(400).json({ message: 'Invalid admin email or OTP.' });

  const record = await OTP.findOne({ email: email.toLowerCase(), purpose: 'ADMIN_LOGIN' }).sort({ createdAt: -1 });
  if (!record) return res.status(400).json({ message: 'Please enter a valid OTP.' });

  if (record.expiresAt < new Date()) return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });

  const isValid = await verifyHash(otp.toString(), record.otpHash);
  if (!isValid) {
    record.attempts += 1;
    await record.save();
    if (record.attempts >= Number(process.env.MAX_OTP_ATTEMPTS || 5)) {
      return res.status(429).json({ message: 'Too many OTP attempts. Please request a new OTP.' });
    }
    return res.status(400).json({ message: 'Please enter a valid OTP.' });
  }

  const admin = await Admin.findOne({ email: email.toLowerCase() });
  admin.lastLogin = new Date();
  await admin.save();

  const session = await Session.create({ admin: admin._id, ipAddress: req.ip, device: req.headers['user-agent'] || 'unknown', browser: 'unknown', location: 'unknown', status: 'ACTIVE' });
  const token = createToken(admin, 'ADMIN', session._id);

  await AuditLog.create({
    actor: admin.email,
    actorRole: 'ADMIN',
    action: 'ADMIN_LOGIN',
    resource: 'SESSION',
    resourceId: session._id.toString(),
    ipAddress: req.ip,
    status: 'SUCCESS',
  });

  res.status(200).json({
    message: 'Admin login successful.',
    token,
    admin: { id: admin._id, name: admin.name, email: admin.email, role: admin.role },
  });
};

const loginRiskCheck = async (req, res) => {
  const { email } = req.body;
  const context = await getRequestContext(req);
  const { ipAddress, device, browser, location } = context;

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) return res.status(404).json({ message: 'User not found.' });

  const previousLogin = await LoginAttempt.findOne({ user: user._id, status: { $in: ['SUCCESS', 'PENDING_APPROVAL'] } }).sort({ timestamp: -1 });
  const previousAttempts = await LoginAttempt.find({ user: user._id, status: 'FAILED' }).sort({ timestamp: -1 }).limit(5);

  const risk = await scoreLoginRisk({ user, ipAddress, device, browser, location, loginTime: new Date(), previousAttempts, previousLogin });

  const loginAttempt = await LoginAttempt.create({
    user: user._id,
    ipAddress: ipAddress || 'unknown',
    device: device || 'unknown',
    browser: browser || 'unknown',
    location: location || 'unknown',
    status: risk.level === 'LOW' ? 'SUCCESS' : 'SUSPICIOUS',
    riskScore: risk.score,
    riskLevel: risk.level,
    reason: risk.reasons.join(', ') || 'Login analysis completed',
  });

  if (risk.level === 'LOW') {
    user.lastLogin = new Date();
    user.securityScore = risk.score;
    user.riskLevel = risk.level;
    user.securityStatus = 'SECURE';
    user.failedLoginAttempts = previousAttempts.length;
    await user.save();

    const session = await Session.create({ user: user._id, device: device || 'unknown', ipAddress: ipAddress || 'unknown', browser: browser || 'unknown', location: location || 'unknown', status: 'ACTIVE' });
    user.sessionInfo = { currentSession: session._id.toString(), lastActiveSession: session._id.toString() };
    await user.save();

    await createNotificationRecord({
      recipient: user,
      recipientRole: 'USER',
      type: 'SUCCESSFUL_LOGIN',
      title: 'Successful Login',
      message: `You successfully logged into TRUSTFLOW on ${device || 'an unknown device'} from ${location || 'Location unavailable'}.`,
      severity: 'SUCCESS',
      relatedEntityType: 'LOGIN',
      relatedEntityId: loginAttempt._id.toString(),
      status: 'OPEN',
    });

    const token = createToken(user, 'USER', session._id);
    await AuditLog.create({ actor: user.email, actorRole: 'USER', action: 'USER_LOGIN', resource: 'SESSION', resourceId: session._id.toString(), ipAddress: ipAddress || 'unknown', status: 'SUCCESS' });

    return res.status(200).json({
      message: 'Login risk check passed.',
      token,
      user: { id: user._id, name: user.name, email: user.email },
      loginAttempt: { id: loginAttempt._id, riskScore: risk.score, riskLevel: risk.level },
      status: 'NORMAL',
    });
  }

  await Alert.create({
    type: 'SUSPICIOUS_LOGIN',
    user: user._id,
    relatedLogin: loginAttempt._id,
    message: 'Suspicious activity detected. Login behavior is unusual.',
    severity: 'HIGH',
    riskScore: risk.score,
    status: 'OPEN',
  });

  await createNotificationRecord({
    recipient: user,
    recipientRole: 'USER',
    type: 'SUSPICIOUS_LOGIN',
    title: 'Suspicious Login Detected',
    message: `We detected a suspicious login attempt from ${ipAddress || 'an unknown IP'} using ${device || 'an unknown device'} in ${location || 'Location unavailable'}. Please confirm if this was you.`,
    severity: 'CRITICAL',
    relatedEntityType: 'LOGIN',
    relatedEntityId: loginAttempt._id.toString(),
    status: 'OPEN',
  });

  await createSecurityAction({
    email: user.email,
    user,
    action: 'SUSPICIOUS_LOGIN_APPROVE',
    targetType: 'LOGIN_ATTEMPT',
    targetId: loginAttempt._id,
    eventTitle: 'TRUSTFLOW — Suspicious Login Detected',
    eventDescription: `A suspicious login attempt was detected for ${user.name}. Please confirm if this was you.`,
  });

  await AuditLog.create({ actor: user.email, actorRole: 'USER', action: 'SUSPICIOUS_LOGIN_DETECTED', resource: 'LOGIN_ATTEMPT', resourceId: loginAttempt._id.toString(), ipAddress: ipAddress || 'unknown', status: 'SUSPICIOUS', metadata: { riskScore: risk.score, reasons: risk.reasons } });

  return res.status(200).json({
    message: 'Suspicious login detected. A verification email has been sent to your registered email address.',
    status: 'SUSPICIOUS',
    riskScore: risk.score,
    riskLevel: risk.level,
    loginAttemptId: loginAttempt._id,
    requiresApproval: true,
  });
};

const continueSuspiciousLogin = async (req, res) => {
  const { loginAttemptId } = req.body;
  if (!loginAttemptId) return res.status(400).json({ message: 'Missing login attempt id.' });

  const loginAttempt = await LoginAttempt.findById(loginAttemptId);
  if (!loginAttempt) return res.status(404).json({ message: 'Login attempt not found.' });

  const user = await User.findById(loginAttempt.user);
  const approval = await ApprovalRequest.create({
    type: 'SUSPICIOUS_LOGIN',
    resourceType: 'LOGIN_ATTEMPT',
    resourceId: loginAttempt._id,
    user: user._id,
    details: `Admin approval required for suspicious login from ${loginAttempt.ipAddress}`,
    status: 'PENDING',
  });

  await Alert.create({
    type: 'APPROVAL_REQUEST',
    user: user._id,
    relatedLogin: loginAttempt._id,
    message: 'Admin approval required for suspicious login request.',
    severity: 'HIGH',
    riskScore: loginAttempt.riskScore,
    status: 'PENDING',
  });

  await AuditLog.create({ actor: user.email, actorRole: 'USER', action: 'SUSPICIOUS_LOGIN_CONTINUE_REQUESTED', resource: 'APPROVAL_REQUEST', resourceId: approval._id.toString(), ipAddress: loginAttempt.ipAddress, status: 'PENDING' });

  return res.status(200).json({ message: 'Suspicious login approval request created. Waiting for admin review.', status: 'PENDING_APPROVAL' });
};

const cancelSuspiciousLogin = async (req, res) => {
  const { loginAttemptId } = req.body;
  const loginAttempt = await LoginAttempt.findById(loginAttemptId);
  if (!loginAttempt) return res.status(404).json({ message: 'Login attempt not found.' });

  loginAttempt.status = 'REJECTED';
  await loginAttempt.save();

  const user = await User.findById(loginAttempt.user);
  await Alert.create({
    type: 'SUSPICIOUS_LOGIN_BLOCKED',
    user: user._id,
    relatedLogin: loginAttempt._id,
    message: 'Suspicious login was rejected by the user and recorded in security logs.',
    severity: 'MEDIUM',
    riskScore: loginAttempt.riskScore,
    status: 'RESOLVED',
  });

  await AuditLog.create({ actor: user.email, actorRole: 'USER', action: 'SUSPICIOUS_LOGIN_CANCELLED', resource: 'LOGIN_ATTEMPT', resourceId: loginAttempt._id.toString(), ipAddress: loginAttempt.ipAddress, status: 'REJECTED' });

  res.status(200).json({ message: 'Login attempt canceled. Access denied.', status: 'REJECTED' });
};

const handleSecurityEmailAction = async (req, res) => {
  const { token } = req.params;
  const { action } = req.query;

  if (!token || !action) {
    return res.status(400).send('<h2>TRUSTFLOW</h2><p>Invalid security action link.</p>');
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const securityToken = await SecurityActionToken.findOne({ tokenHash, usedAt: null, expiresAt: { $gt: new Date() } }).populate('user').populate('admin');

  if (!securityToken) {
    return res.status(400).send('<h2>TRUSTFLOW</h2><p>This verification link is invalid or has expired.</p>');
  }

  const isApprove = String(action).toLowerCase() === 'approve';
  const isReject = String(action).toLowerCase() === 'reject';

  if (!isApprove && !isReject) {
    return res.status(400).send('<h2>TRUSTFLOW</h2><p>Invalid security action.</p>');
  }

  if (securityToken.targetType === 'LOGIN_ATTEMPT') {
    const loginAttempt = await LoginAttempt.findById(securityToken.targetId);
    if (!loginAttempt) { return res.status(404).send('<h2>TRUSTFLOW</h2><p>Login record not found.</p>'); }

    if (isApprove) {
      loginAttempt.status = 'SUCCESS';
      await loginAttempt.save();
      if (loginAttempt.user) {
        const user = await User.findById(loginAttempt.user);
        await createNotificationRecord({
          recipient: user,
          recipientRole: 'USER',
          type: 'SUSPICIOUS_LOGIN_VERIFIED',
          title: 'Suspicious Login Verified',
          message: 'You successfully verified the recent login attempt and the activity has been marked as safe.',
          severity: 'SUCCESS',
          relatedEntityType: 'LOGIN',
          relatedEntityId: loginAttempt._id.toString(),
          status: 'RESOLVED',
        });
      }
      securityToken.usedAt = new Date();
      await securityToken.save();
      return res.status(200).send('<h2>TRUSTFLOW</h2><p>Verification successful. Your login has been approved.</p>');
    }

    loginAttempt.status = 'REJECTED';
    await loginAttempt.save();
    if (loginAttempt.user) {
      const user = await User.findById(loginAttempt.user);
      await createNotificationRecord({
        recipient: user,
        recipientRole: 'USER',
        type: 'SUSPICIOUS_LOGIN_REJECTED',
        title: 'Suspicious Login Rejected',
        message: 'The suspicious login was rejected and the account remains protected.',
        severity: 'WARNING',
        relatedEntityType: 'LOGIN',
        relatedEntityId: loginAttempt._id.toString(),
        status: 'RESOLVED',
      });
    }
    securityToken.usedAt = new Date();
    await securityToken.save();
    return res.status(200).send('<h2>TRUSTFLOW</h2><p>Security action confirmed. The suspicious login has been blocked.</p>');
  }

  const transaction = await Transaction.findById(securityToken.targetId);
  if (!transaction) {
    return res.status(404).send('<h2>TRUSTFLOW</h2><p>Transaction record not found.</p>');
  }

  if (isApprove) {
    transaction.emailVerified = true;
    transaction.emailVerificationStatus = 'APPROVED';
    transaction.userVerificationAt = new Date();
    if (transaction.riskLevel === 'LOW') {
      transaction.status = 'AWAITING_PAYMENT';
      transaction.approvalStatus = 'NOT_REQUIRED';
      transaction.adminApprovalStatus = 'NOT_REQUIRED';
    }
    if (transaction.riskLevel === 'MEDIUM') {
      transaction.status = 'AWAITING_PAYMENT';
      transaction.approvalStatus = 'NOT_REQUIRED';
      transaction.adminApprovalStatus = 'NOT_REQUIRED';
    }
    if (transaction.riskLevel === 'HIGH') {
      transaction.status = 'AWAITING_ADMIN_APPROVAL';
      transaction.approvalStatus = 'PENDING';
      transaction.adminApprovalStatus = 'PENDING';
      await ApprovalRequest.findOneAndUpdate(
        { resourceType: 'TRANSACTION', resourceId: transaction._id, status: 'PENDING' },
        { $set: { status: 'PENDING', details: `High-risk payment requires administrator review for ${transaction.recipientName}.` } },
        { upsert: true }
      );
    }
    await transaction.save();
    const user = securityToken.user || await User.findById(transaction.sender);
    const message = transaction.riskLevel === 'HIGH'
      ? `Your transaction to ${transaction.recipientName} has been verified successfully. It is now awaiting administrator approval.`
      : `Your transaction to ${transaction.recipientName} has been verified successfully. You can now proceed with payment.`;

    await createNotificationRecord({
      recipient: user,
      recipientRole: 'USER',
      type: transaction.riskLevel === 'HIGH' ? 'TRANSACTION_VERIFICATION_APPROVED' : 'TRANSACTION_VERIFIED',
      title: transaction.riskLevel === 'HIGH' ? 'Approval Pending' : 'Transaction Verified',
      message,
      severity: transaction.riskLevel === 'HIGH' ? 'WARNING' : 'SUCCESS',
      relatedEntityType: 'TRANSACTION',
      relatedEntityId: transaction._id.toString(),
      status: transaction.riskLevel === 'HIGH' ? 'PENDING' : 'OPEN',
    });

    if (transaction.riskLevel === 'HIGH') {
      const admin = await Admin.findOne({}).lean();
      if (admin) {
        await createNotificationRecord({
          recipient: admin,
          recipientRole: 'ADMIN',
          type: 'PENDING_APPROVAL',
          title: 'Pending Approval Required',
          message: `A high-risk transaction from ${user?.name || 'a user'} for ${Number(transaction.amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })} is awaiting approval.`,
          severity: 'CRITICAL',
          relatedEntityType: 'TRANSACTION',
          relatedEntityId: transaction._id.toString(),
          status: 'PENDING',
        });
      }
    }

    securityToken.usedAt = new Date();
    await securityToken.save();

    const frontendBase = process.env.CLIENT_URL || 'http://localhost:5173';
    return res.status(200).send(`
      <html><head><title>TRUSTFLOW Verification</title>
      <meta http-equiv="refresh" content="2;url=${frontendBase}/user" />
      <style>body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#f3f7ff;color:#111827;margin:0} .card{background:#fff;border-radius:12px;padding:32px;box-shadow:0 12px 40px rgba(0,0,0,.08);text-align:center;max-width:480px} h2{margin-bottom:12px} p{margin:0;color:#374151} </style></head>
      <body><div class="card"><h2>TRUSTFLOW Verification Successful.</h2><p>Your transaction has been confirmed. Redirecting to your dashboard...</p></div></body></html>
    `);
  }

  transaction.emailVerified = false;
  transaction.emailVerificationStatus = 'REJECTED';
  transaction.paymentStatus = 'REJECTED';
  transaction.status = 'REJECTED';
  transaction.rejectedAt = new Date();
  await transaction.save();

  const user = securityToken.user || await User.findById(transaction.sender);
  await createNotificationRecord({
    recipient: user,
    recipientRole: 'USER',
    type: 'TRANSACTION_VERIFICATION_DECLINED',
    title: 'Payment Declined',
    message: `You rejected the verification for your transaction to ${transaction.recipientName}. The payment was not processed.`,
    severity: 'WARNING',
    relatedEntityType: 'TRANSACTION',
    relatedEntityId: transaction._id.toString(),
    status: 'REJECTED',
  });
  securityToken.usedAt = new Date();
  await securityToken.save();

  const frontendBase = process.env.CLIENT_URL || 'http://localhost:5173';
  return res.status(200).send(`
    <html><head><title>TRUSTFLOW Verification</title>
    <meta http-equiv="refresh" content="2;url=${frontendBase}/user" />
    <style>body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#f3f7ff;color:#111827;margin:0} .card{background:#fff;border-radius:12px;padding:32px;box-shadow:0 12px 40px rgba(0,0,0,.08);text-align:center;max-width:480px} h2{margin-bottom:12px} p{margin:0;color:#374151} </style></head>
    <body><div class="card"><h2>TRUSTFLOW Verification Declined.</h2><p>Your transaction has been cancelled. Redirecting to your dashboard...</p></div></body></html>
  `);
};

module.exports = {
  createSecurityAction,
  requestUserOtp,
  verifyUserOtp,
  registerUser,
  adminRegister,
  requestAdminOtp,
  verifyAdminOtp,
  loginRiskCheck,
  continueSuspiciousLogin,
  cancelSuspiciousLogin,
  handleSecurityEmailAction,
};
