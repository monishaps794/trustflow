const mongoose = require('mongoose');

const securityIncidentSchema = new mongoose.Schema({
  relatedAlert: { type: mongoose.Schema.Types.ObjectId, ref: 'Alert', default: null },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  type: { type: String, required: true },
  severity: { type: String, default: 'HIGH' },
  status: { type: String, enum: ['OPEN', 'UNDER_INVESTIGATION', 'RESOLVED', 'CLOSED'], default: 'OPEN' },
  assignedAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  investigationNotes: { type: String, default: '' },
  resolution: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('SecurityIncident', securityIncidentSchema);
