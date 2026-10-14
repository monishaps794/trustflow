const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actor: { type: String, required: true },
  actorRole: { type: String, required: true },
  action: { type: String, required: true },
  resource: { type: String, default: '' },
  resourceId: { type: String, default: '' },
  ipAddress: { type: String, default: 'unknown' },
  status: { type: String, default: 'SUCCESS' },
  timestamp: { type: Date, default: Date.now },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

module.exports = mongoose.model('AuditLog', auditLogSchema);
