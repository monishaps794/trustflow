const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'ownerModel' },
  ownerModel: { type: String, required: true, enum: ['User', 'Admin'] },
  mfaEnabled: { type: Boolean, default: true },
  userNotifications: {
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
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);
