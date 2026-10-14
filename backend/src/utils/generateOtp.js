const crypto = require('crypto');

const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const hashValue = async (value) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(`${salt}:${value}`).digest('hex');
  return `${salt}:${hash}`;
};

const verifyHash = async (value, hashedValue) => {
  const [salt, hash] = hashedValue.split(':');
  if (!salt || !hash) return false;
  const computedHash = crypto.createHash('sha256').update(`${salt}:${value}`).digest('hex');
  return computedHash === hash;
};

module.exports = { generateOtp, hashValue, verifyHash };
