const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Session = require('../models/Session');

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    const model = decoded.role === 'ADMIN' ? Admin : User;
    const user = await model.findById(decoded.id).lean();

    if (!user) {
      return res.status(401).json({ message: 'User not found or session invalid.' });
    }

    if (decoded.sid) {
      const session = await Session.findOne({ _id: decoded.sid, status: 'ACTIVE' }).lean();
      if (!session) return res.status(401).json({ message: 'Session is no longer active.' });
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      role: decoded.role,
      name: user.name,
    };
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token expired or invalid.' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ message: 'Admin access required.' });
  }
  next();
};

const requireUser = (req, res, next) => {
  if (req.user?.role !== 'USER') {
    return res.status(403).json({ message: 'User access required.' });
  }
  next();
};

module.exports = { protect, requireAdmin, requireUser };
