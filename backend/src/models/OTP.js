const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  purpose: { type: String, enum: ['USER_LOGIN', 'ADMIN_LOGIN', 'USER_REGISTRATION', 'TRANSACTION_APPROVAL', 'SUSPICIOUS_LOGIN'], default: 'USER_LOGIN' },
  otpHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
  verified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('OTP', otpSchema);
