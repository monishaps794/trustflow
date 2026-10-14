const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  accountNumber: { type: String, required: true, unique: true, trim: true },
  accountHolderType: { type: String, required: true },
  accountType: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, required: true, unique: true, trim: true },
  address: { type: String, required: true },
  accountStatus: { type: String, default: 'ACTIVE' },
  securityStatus: { type: String, default: 'SECURE' },
  securityScore: { type: Number, default: 0 },
  riskLevel: { type: String, default: 'LOW' },
  mfaEnabled: { type: Boolean, default: true },
  transactionRiskThresholds: {
    lowLimit: { type: Number, default: 50000 },
    mediumLimit: { type: Number, default: 100000 },
    highLimit: { type: Number, default: 200000 },
    boundaryNote: { type: String, default: 'Default transaction threshold profile.' },
  },
  notificationPreferences: {
    securityNotifications: { type: Boolean, default: true },
    transactionNotifications: { type: Boolean, default: true },
    loginNotifications: { type: Boolean, default: true },
  },
  securityPreferences: {
    otpVerification: { type: Boolean, default: true },
    loginAlerts: { type: Boolean, default: true },
    transactionAlerts: { type: Boolean, default: true },
  },
  sessionInfo: {
    currentSession: { type: String, default: null },
    lastActiveSession: { type: String, default: null },
  },
  failedLoginAttempts: { type: Number, default: 0 },
  lastLogin: { type: Date, default: null },
  loginHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LoginAttempt' }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

userSchema.methods.getMaskedAccountNumber = function () {
  if (!this.accountNumber) return 'N/A';
  const last4 = this.accountNumber.slice(-4);
  return `******${last4}`;
};

module.exports = mongoose.model('User', userSchema);
