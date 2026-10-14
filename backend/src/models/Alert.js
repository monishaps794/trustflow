const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  type: { type: String, required: true },
  title: { type: String, default: '' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  recipientId: { type: mongoose.Schema.Types.ObjectId, refPath: 'recipientModel', default: null },
  recipientModel: { type: String, enum: ['User', 'Admin'], default: 'User' },
  recipientRole: { type: String, enum: ['USER', 'ADMIN'], default: 'USER' },
  relatedTransaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
  relatedLogin: { type: mongoose.Schema.Types.ObjectId, ref: 'LoginAttempt', default: null },
  relatedIncident: { type: mongoose.Schema.Types.ObjectId, ref: 'SecurityIncident', default: null },
  relatedEntityType: { type: String, default: '' },
  relatedEntityId: { type: String, default: '' },
  message: { type: String, required: true },
  severity: { type: String, default: 'MEDIUM' },
  riskScore: { type: Number, default: 0 },
  status: { type: String, enum: ['OPEN', 'RESOLVED', 'PENDING', 'REJECTED'], default: 'OPEN' },
  read: { type: Boolean, default: false },
  emailStatus: { type: String, enum: ['PENDING', 'SENT', 'FAILED', 'SKIPPED'], default: 'PENDING' },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('Alert', alertSchema);
