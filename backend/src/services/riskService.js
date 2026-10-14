const User = require('../models/User');
const LoginAttempt = require('../models/LoginAttempt');
const Transaction = require('../models/Transaction');

const calculateRiskLevel = (score) => {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
};

const USER_TRANSACTION_THRESHOLDS = {
  '100000123456': { lowLimit: 100000, mediumLimit: 350000, highLimit: 350000, boundaryNote: 'Chaithra: <= ₹1,00,000 LOW, > ₹1,00,000 and <= ₹3,50,000 MEDIUM, > ₹3,50,000 HIGH.' },
  '987654321098': { lowLimit: 500000, mediumLimit: 1000000, highLimit: 1000000, boundaryNote: 'Monisha: <= ₹5,00,000 LOW, > ₹5,00,000 and <= ₹10,00,000 MEDIUM, above ₹10,00,000 HIGH.' },
  '110011001100': { lowLimit: 75000, mediumLimit: 500000, highLimit: 500000, boundaryNote: 'Rashmi: <= ₹75,000 LOW, > ₹75,000 and <= ₹1,50,000 MEDIUM, > ₹1,50,000 and <= ₹5,00,000 MEDIUM, above ₹5,00,000 HIGH.' },
  '555566667777': { lowLimit: 50000, mediumLimit: 100000, highLimit: 100000, boundaryNote: 'Kavyashree: <= ₹50,000 LOW, > ₹50,000 and <= ₹1,00,000 MEDIUM, above ₹1,00,000 HIGH.' },
};

const resolveUserThresholds = (user) => {
  if (!user) {
    return { lowLimit: 50000, mediumLimit: 100000, highLimit: 100000, boundaryNote: 'Default threshold profile.' };
  }

  const accountNumber = (user.accountNumber || '').toString().trim();
  return USER_TRANSACTION_THRESHOLDS[accountNumber] || {
    lowLimit: 50000,
    mediumLimit: 100000,
    highLimit: 100000,
    boundaryNote: 'Default threshold profile used because no specific user profile was found.',
  };
};

const classifyAmountByUserThresholds = (user, amount) => {
  const thresholds = resolveUserThresholds(user);
  const value = Number(amount) || 0;

  if (value <= thresholds.lowLimit) {
    return { level: 'LOW', score: 20, reason: `Amount is within the configured LOW tier for ${user?.name || 'this user'}.` };
  }

  if (value <= thresholds.mediumLimit) {
    return { level: 'MEDIUM', score: 50, reason: `Amount falls in the configured MEDIUM tier for ${user?.name || 'this user'}.` };
  }

  return { level: 'HIGH', score: 80, reason: `Amount exceeds the configured HIGH threshold for ${user?.name || 'this user'}.` };
};

const scoreLoginRisk = async ({ user, ipAddress, device, browser, location, loginTime, previousAttempts, previousLogin }) => {
  let score = 0;
  const reasons = [];

  if (!previousLogin) {
    score += 10;
    reasons.push('First-time login profile detected');
  }

  if (device && previousLogin && previousLogin.device && device !== previousLogin.device) {
    score += 25;
    reasons.push('New or unrecognized device');
  }

  if (ipAddress && previousLogin && previousLogin.ipAddress && ipAddress !== previousLogin.ipAddress) {
    score += 20;
    reasons.push('Unusual IP address');
  }

  if (browser && previousLogin && previousLogin.browser && browser !== previousLogin.browser) {
    score += 15;
    reasons.push('Unusual browser');
  }

  if (location && previousLogin && previousLogin.location && location !== previousLogin.location) {
    score += 15;
    reasons.push('Unusual location');
  }

  if (loginTime) {
    const hour = new Date(loginTime).getHours();
    if (hour < 5 || hour > 22) {
      score += 10;
      reasons.push('Unusual login time');
    }
  }

  if (previousAttempts && previousAttempts.length >= 3) {
    score += 15;
    reasons.push('Repeated failed login attempts');
  }

  if (user && user.failedLoginAttempts >= 3) {
    score += 15;
    reasons.push('User has previous failed attempts');
  }

  if (user && user.securityStatus === 'LOCKED') {
    score += 30;
    reasons.push('Account is locked or suspicious');
  }

  const finalScore = Math.min(score, 100);
  return {
    score: finalScore,
    level: calculateRiskLevel(finalScore),
    reasons,
  };
};

const scoreTransactionRisk = async ({ user, amount, recipientName, recipientAccount, purpose, transactionType, previousTransactions = [] }) => {
  const thresholdClassification = classifyAmountByUserThresholds(user, amount);
  const historicalTotal = previousTransactions.reduce((sum, item) => sum + (item.amount || 0), 0);
  const avg = previousTransactions.length ? historicalTotal / previousTransactions.length : 0;
  const max = previousTransactions.length ? Math.max(...previousTransactions.map((t) => t.amount || 0)) : 0;

  let score = thresholdClassification.score;
  const reasons = [thresholdClassification.reason, resolveUserThresholds(user).boundaryNote];

  if (avg && amount > avg * 3) {
    score += 10;
    reasons.push('Amount exceeds the user’s historical average by more than 3x');
  }

  if (max && amount > max * 2) {
    score += 10;
    reasons.push('Amount exceeds prior maximum by more than 2x');
  }

  if (previousTransactions.some((t) => t.status === 'REJECTED' || t.status === 'FAILED')) {
    score += 10;
    reasons.push('Previous suspicious or failed transaction history');
  }

  if (recipientAccount && user && user.accountNumber && recipientAccount === user.accountNumber) {
    score += 10;
    reasons.push('Recipient matches sender account');
  }

  if (!purpose || purpose.trim().length < 5) {
    score += 15;
    reasons.push('Purpose is vague or missing');
  }

  if (transactionType === 'INTERNATIONAL' || amount > 200000) {
    score += 10;
    reasons.push('High-value transfer pattern');
  }

  const finalScore = Math.min(Math.max(score, thresholdClassification.score), 100);
  const finalLevel = finalScore >= 80 ? 'HIGH' : finalScore >= 50 ? 'MEDIUM' : 'LOW';

  return {
    score: finalScore,
    level: finalLevel,
    reasons: [...new Set(reasons)],
    threshold: thresholdClassification,
  };
};

const aggregateDashboardStats = async () => {
  const [totalUsers, activeUsers, loginAttempts, failedLoginAttempts, securityAlerts, highRiskTransactions, pendingApprovals, blockedActivities] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ accountStatus: 'ACTIVE' }),
    require('../models/LoginAttempt').countDocuments(),
    require('../models/LoginAttempt').countDocuments({ status: 'FAILED' }),
    require('../models/Alert').countDocuments(),
    Transaction.countDocuments({ riskLevel: 'HIGH' }),
    require('../models/ApprovalRequest').countDocuments({ status: 'PENDING' }),
    Transaction.countDocuments({ status: { $in: ['BLOCKED', 'REJECTED'] } }),
  ]);

  return {
    totalUsers,
    activeUsers,
    loginAttempts,
    failedLoginAttempts,
    securityAlerts,
    highRiskTransactions,
    pendingApprovals,
    blockedActivities,
  };
};

const computeWeeklyActivity = async () => {
  const now = new Date();
  const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);

  const activity = [];
  for (let i = 0; i < 7; i += 1) {
    const dayStart = new Date(sixDaysAgo.getTime() + i * 24 * 60 * 60 * 1000);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const [loginAttempts, failedLoginAttempts, securityAlerts, highRiskTransactions, pendingApprovals, blockedActivities] = await Promise.all([
      require('../models/LoginAttempt').countDocuments({ timestamp: { $gte: dayStart, $lt: dayEnd } }),
      require('../models/LoginAttempt').countDocuments({ status: 'FAILED', timestamp: { $gte: dayStart, $lt: dayEnd } }),
      require('../models/Alert').countDocuments({ createdAt: { $gte: dayStart, $lt: dayEnd } }),
      Transaction.countDocuments({ riskLevel: 'HIGH', createdAt: { $gte: dayStart, $lt: dayEnd } }),
      require('../models/ApprovalRequest').countDocuments({ status: 'PENDING', requestedAt: { $gte: dayStart, $lt: dayEnd } }),
      Transaction.countDocuments({ status: { $in: ['BLOCKED', 'REJECTED'] }, createdAt: { $gte: dayStart, $lt: dayEnd } }),
    ]);

    activity.push({
      label: dayStart.toLocaleDateString('en-US', { weekday: 'short' }),
      loginAttempts,
      failedLoginAttempts,
      securityAlerts,
      highRiskTransactions,
      pendingApprovals,
      blockedActivities,
    });
  }

  return activity;
};

module.exports = {
  calculateRiskLevel,
  resolveUserThresholds,
  scoreLoginRisk,
  scoreTransactionRisk,
  aggregateDashboardStats,
  computeWeeklyActivity,
};
