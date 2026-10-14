const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  device: { type: String, default: 'unknown' },
  ipAddress: { type: String, default: 'unknown' },
  browser: { type: String, default: 'unknown' },
  location: { type: String, default: 'unknown' },
  loginTime: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now },
  logoutTime: { type: Date, default: null },
  status: { type: String, enum: ['ACTIVE', 'LOGGED_OUT', 'SUSPICIOUS'], default: 'ACTIVE' },
}, { timestamps: true });

module.exports = mongoose.model('Session', sessionSchema);
