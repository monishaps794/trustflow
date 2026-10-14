const User = require('../models/User');
const Admin = require('../models/Admin');
const LoginAttempt = require('../models/LoginAttempt');
const Transaction = require('../models/Transaction');
const Alert = require('../models/Alert');
const SecurityIncident = require('../models/SecurityIncident');
const ApprovalRequest = require('../models/ApprovalRequest');
const AuditLog = require('../models/AuditLog');
const Settings = require('../models/Settings');
const Session = require('../models/Session');
const { aggregateDashboardStats, computeWeeklyActivity } = require('../services/riskService');
const { createNotificationRecord } = require('../utils/emailService');

const getAdminDashboard = async (req, res) => {
  const stats = await aggregateDashboardStats();
  const weeklyActivity = await computeWeeklyActivity();

  res.status(200).json({
    welcome: 'Welcome Admin!',
    stats,
    weeklyActivity,
  });
};

const getAdminUsers = async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 }).lean();
  res.status(200).json({ users });
};

const getAdminUserById = async (req, res) => {
  const user = await User.findById(req.params.id).lean();
  if (!user) return res.status(404).json({ message: 'User not found.' });

  const loginHistory = await LoginAttempt.find({ user: user._id }).sort({ timestamp: -1 }).lean();
  const transactions = await Transaction.find({ sender: user._id }).sort({ createdAt: -1 }).lean();
  const alerts = await Alert.find({ user: user._id }).sort({ createdAt: -1 }).lean();

  res.status(200).json({ user, loginHistory, transactions, alerts });
};

const getAdminLoginMonitoring = async (req, res) => {
  const { status } = req.query;
  const query = {};

  if (status && status !== 'ALL') {
    const normalized = String(status).toUpperCase();
    const mapped = normalized === 'SUCCESSFUL' ? 'SUCCESS' : normalized;
    if (['SUCCESS', 'FAILED'].includes(mapped)) {
      query.status = mapped;
    }
  }

  const attempts = await LoginAttempt.find(query).populate('user', 'name email').sort({ timestamp: -1 }).lean();
  res.status(200).json({ attempts });
};

const getAdminTransactions = async (req, res) => {
  const transactions = await Transaction.find().populate('sender', 'name email accountNumber').sort({ createdAt: -1 }).lean();
  res.status(200).json({ transactions });
};

const getAdminUserTransactions = async (req, res) => {
  const user = await User.findById(req.params.id).select('name email accountType accountStatus securityStatus').lean();
  if (!user) return res.status(404).json({ message: 'User not found.' });
  const transactions = await Transaction.find({ sender: user._id }).sort({ createdAt: -1 }).lean();
  res.status(200).json({ user, transactions });
};

const getAdminAlerts = async (req, res) => {
  const { status } = req.query;
  const query = {};

  if (status && status !== 'ALL') {
    const normalized = String(status).toUpperCase();
    if (['APPROVED', 'REJECTED', 'PENDING'].includes(normalized)) {
      query.status = normalized;
    }
  }

  const alerts = await ApprovalRequest.find(query).populate('user', 'name email').sort({ requestedAt: -1 }).lean();
  res.status(200).json({ alerts });
};

const getAdminSecurityAlerts = async (req, res) => {
  const alerts = await Alert.find().populate('user', 'name email').populate('relatedLogin', 'email ipAddress device browser location reason status timestamp').sort({ createdAt: -1 }).lean();
  res.status(200).json({ alerts });
};

const getAdminNotifications = async (req, res) => {
  const notifications = await Alert.find({ recipientRole: 'ADMIN' }).sort({ createdAt: -1 }).limit(25).lean();
  res.status(200).json({ notifications });
};

const getAdminIncidents = async (req, res) => {
  const incidents = await SecurityIncident.find().populate('user', 'name email').sort({ createdAt: -1 }).lean();
  res.status(200).json({ incidents });
};

const getAdminAuditLogs = async (req, res) => {
  const logs = await AuditLog.find().sort({ timestamp: -1 }).lean();
  res.status(200).json({ logs });
};

const getAdminReports = async (req, res) => {
  const stats = await aggregateDashboardStats();
  const activity = await computeWeeklyActivity();
  const values = {
    totalUsers: stats.totalUsers,
    activeUsers: stats.activeUsers,
    loginActivity: stats.loginAttempts,
    failedLogins: stats.failedLoginAttempts,
    securityAlerts: stats.securityAlerts,
    suspiciousLogins: await LoginAttempt.countDocuments({ status: 'SUSPICIOUS' }),
    transactions: await Transaction.countDocuments(),
    completedTransactions: await Transaction.countDocuments({ status: 'COMPLETED' }),
    failedTransactions: await Transaction.countDocuments({ status: 'FAILED' }),
    rejectedTransactions: await Transaction.countDocuments({ status: 'REJECTED' }),
    highRiskTransactions: stats.highRiskTransactions,
    blockedTransactions: stats.blockedActivities,
    pendingApprovals: stats.pendingApprovals,
    securityIncidents: await SecurityIncident.countDocuments(),
    auditActivity: await AuditLog.countDocuments(),
    weeklyActivity: activity,
  };

  res.status(200).json(values);
};

const exportCsv = async (req, res) => {
  const transactions = await Transaction.find().lean();
  const header = ['Transaction ID', 'Sender', 'Recipient', 'Amount', 'Status', 'Risk Score', 'Risk Level', 'Date'];
  const rows = transactions.map((tx) => [tx._id.toString(), tx.senderAccountNumber, tx.recipientName, tx.amount, tx.status, tx.riskScore, tx.riskLevel, tx.createdAt.toISOString()]);
  const csv = [header, ...rows].map((row) => row.join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="trustflow-report.csv"');
  res.status(200).send(csv);
};

const getAdminProfile = async (req, res) => {
  const admin = await Admin.findById(req.user.id).lean();
  if (!admin) return res.status(404).json({ message: 'Admin not found.' });
  res.status(200).json({ admin });
};

const updateAdminSettings = async (req, res) => {
  const admin = await Admin.findById(req.user.id);
  const settings = await Settings.findOne({ owner: admin._id, ownerModel: 'Admin' });
  if (!settings) {
    const created = await Settings.create({ owner: admin._id, ownerModel: 'Admin', userNotifications: admin.notificationPreferences || { securityNotifications: true, transactionNotifications: true, loginNotifications: true }, securityPreferences: { otpVerification: true, loginAlerts: true, transactionAlerts: true } });
    return res.status(200).json({ message: 'Admin settings saved.', settings: created });
  }
  const updateData = req.body;
  settings.userNotifications = { ...settings.userNotifications, ...updateData.userNotifications };
  settings.securityPreferences = { ...settings.securityPreferences, ...updateData.securityPreferences };
  await settings.save();
  await AuditLog.create({ actor: admin.email, actorRole: 'ADMIN', action: 'ADMIN_SETTINGS_UPDATED', resource: 'SETTINGS', resourceId: settings._id.toString(), ipAddress: req.ip, status: 'SUCCESS' });
  res.status(200).json({ message: 'Admin settings updated.', settings });
};

const approveRequest = async (req, res) => {
  const request = await ApprovalRequest.findById(req.params.id);
  if (!request) return res.status(404).json({ message: 'Approval request not found.' });
  if (request.status !== 'PENDING') return res.status(409).json({ message: `Approval request is already ${request.status.toLowerCase()}.` });

  request.status = 'APPROVED';
  request.reviewedAt = new Date();
  request.reviewedBy = req.user.id;
  await request.save();

  if (request.type === 'SUSPICIOUS_LOGIN') {
    const loginAttempt = await LoginAttempt.findById(request.resourceId);
    loginAttempt.status = 'SUCCESS';
    loginAttempt.riskLevel = 'LOW';
    await loginAttempt.save();

    const user = await User.findById(request.user);
    user.securityStatus = 'SECURE';
    user.securityScore = Math.max(user.securityScore || 0, 35);
    await user.save();

    await AuditLog.create({ actor: req.user.email, actorRole: 'ADMIN', action: 'APPROVAL_APPROVED', resource: 'APPROVAL_REQUEST', resourceId: request._id.toString(), ipAddress: req.ip, status: 'SUCCESS' });
  }

  if (request.type === 'SUSPICIOUS_TRANSACTION') {
    const transaction = await Transaction.findById(request.resourceId);
    transaction.status = 'AWAITING_PAYMENT';
    transaction.approvalStatus = 'APPROVED';
    transaction.adminApprovalStatus = 'APPROVED';
    transaction.paymentStatus = 'PENDING';
    transaction.approvedAt = new Date();
    transaction.adminApprovedBy = req.user.id;
    transaction.adminApprovedAt = new Date();
    await transaction.save();

    const user = await User.findById(transaction.sender);
    await createNotificationRecord({
      recipient: user,
      recipientRole: 'USER',
      type: 'TRANSACTION_APPROVED',
      title: 'Transaction Approved',
      message: `Your transaction to ${transaction.recipientName} has been approved by the administrator. You can now proceed with payment.`,
      severity: 'SUCCESS',
      relatedEntityType: 'TRANSACTION',
      relatedEntityId: transaction._id.toString(),
      status: 'OPEN',
    });

    await AuditLog.create({ actor: req.user.email, actorRole: 'ADMIN', action: 'TRANSACTION_APPROVED', resource: 'TRANSACTION', resourceId: transaction._id.toString(), ipAddress: req.ip, status: 'SUCCESS' });
  }

  res.status(200).json({ message: 'Approval granted successfully.' });
};

const rejectRequest = async (req, res) => {
  const request = await ApprovalRequest.findById(req.params.id);
  if (!request) return res.status(404).json({ message: 'Approval request not found.' });
  if (request.status !== 'PENDING') return res.status(409).json({ message: `Approval request is already ${request.status.toLowerCase()}.` });

  request.status = 'REJECTED';
  request.reviewedAt = new Date();
  request.reviewedBy = req.user.id;
  await request.save();

  if (request.type === 'SUSPICIOUS_TRANSACTION') {
    const transaction = await Transaction.findById(request.resourceId);
    transaction.status = 'REJECTED';
    transaction.paymentStatus = 'REJECTED';
    transaction.approvalStatus = 'REJECTED';
    transaction.adminApprovalStatus = 'REJECTED';
    transaction.rejectedAt = new Date();
    transaction.adminRejectedAt = new Date();
    await transaction.save();

    const user = await User.findById(transaction.sender);
    await createNotificationRecord({
      recipient: user,
      recipientRole: 'USER',
      type: 'TRANSACTION_REJECTED',
      title: 'Transaction Rejected',
      message: `Your transaction to ${transaction.recipientName} was rejected by the administrator and no payment was processed.`,
      severity: 'WARNING',
      relatedEntityType: 'TRANSACTION',
      relatedEntityId: transaction._id.toString(),
      status: 'REJECTED',
    });
  }

  await AuditLog.create({ actor: req.user.email, actorRole: 'ADMIN', action: 'APPROVAL_REJECTED', resource: 'APPROVAL_REQUEST', resourceId: request._id.toString(), ipAddress: req.ip, status: 'REJECTED' });
  res.status(200).json({ message: 'Approval rejected successfully.' });
};

const blockTransaction = async (req, res) => {
  const transaction = await Transaction.findById(req.params.id);
  if (!transaction) return res.status(404).json({ message: 'Transaction not found.' });
  if (!['HIGH', 'CRITICAL'].includes(transaction.riskLevel) && transaction.status !== 'PENDING_ADMIN_APPROVAL') {
    return res.status(409).json({ message: 'Only high-risk or pending-approval transactions can be blocked.' });
  }

  transaction.status = 'BLOCKED';
  transaction.isBlocked = true;
  await transaction.save();
  await AuditLog.create({ actor: req.user.email, actorRole: 'ADMIN', action: 'TRANSACTION_BLOCKED', resource: 'TRANSACTION', resourceId: transaction._id.toString(), ipAddress: req.ip, status: 'BLOCKED' });
  res.status(200).json({ message: 'Transaction blocked successfully.' });
};

const unblockTransaction = async (req, res) => {
  const transaction = await Transaction.findById(req.params.id);
  if (!transaction) return res.status(404).json({ message: 'Transaction not found.' });

  transaction.status = 'COMPLETED';
  transaction.isBlocked = false;
  await transaction.save();
  await AuditLog.create({ actor: req.user.email, actorRole: 'ADMIN', action: 'TRANSACTION_UNBLOCKED', resource: 'TRANSACTION', resourceId: transaction._id.toString(), ipAddress: req.ip, status: 'SUCCESS' });
  res.status(200).json({ message: 'Transaction unblocked successfully.' });
};

const logoutAdmin = async (req, res) => {
  const admin = await Admin.findById(req.user.id);
  await Session.updateMany({ admin: admin._id, status: 'ACTIVE' }, { status: 'LOGGED_OUT', logoutTime: new Date() });
  await AuditLog.create({ actor: admin.email, actorRole: 'ADMIN', action: 'LOGOUT', resource: 'SESSION', resourceId: admin._id.toString(), ipAddress: req.ip, status: 'SUCCESS' });
  res.status(200).json({ message: 'Admin logged out successfully.' });
};

module.exports = {
  getAdminDashboard,
  getAdminUsers,
  getAdminUserById,
  getAdminLoginMonitoring,
  getAdminTransactions,
  getAdminUserTransactions,
  getAdminAlerts,
  getAdminSecurityAlerts,
  getAdminIncidents,
  getAdminAuditLogs,
  getAdminReports,
  exportCsv,
  getAdminProfile,
  updateAdminSettings,
  getAdminNotifications,
  approveRequest,
  rejectRequest,
  blockTransaction,
  unblockTransaction,
  logoutAdmin,
};
