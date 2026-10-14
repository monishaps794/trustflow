const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  role: { type: String, default: 'ADMIN' },
  mfaEnabled: { type: Boolean, default: true },
  lastLogin: { type: Date, default: null },
  notificationPreferences: {
    securityNotifications: { type: Boolean, default: true },
    transactionNotifications: { type: Boolean, default: true },
    loginNotifications: { type: Boolean, default: true },
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('Admin', adminSchema);
