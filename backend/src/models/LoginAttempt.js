const mongoose = require('mongoose');

const loginAttemptSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  email: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
  ipAddress: { type: String, default: 'unknown' },
  device: { type: String, default: 'unknown' },
  browser: { type: String, default: 'unknown' },
  location: { type: String, default: 'unknown' },
  status: { type: String, enum: ['SUCCESS', 'FAILED', 'SUSPICIOUS', 'PENDING_APPROVAL', 'REJECTED'], default: 'FAILED' },
  riskScore: { type: Number, default: 0 },
  riskLevel: { type: String, default: 'LOW' },
  reason: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('LoginAttempt', loginAttemptSchema);
