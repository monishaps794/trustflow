const mongoose = require('mongoose');

const securityActionTokenSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  email: { type: String, required: true, lowercase: true, trim: true },
  action: {
    type: String,
    required: true,
    enum: ['SUSPICIOUS_LOGIN_APPROVE', 'SUSPICIOUS_LOGIN_REJECT', 'SUSPICIOUS_TRANSACTION_APPROVE', 'SUSPICIOUS_TRANSACTION_REJECT'],
  },
  targetType: { type: String, required: true, enum: ['LOGIN_ATTEMPT', 'TRANSACTION'] },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  tokenHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('SecurityActionToken', securityActionTokenSchema);
