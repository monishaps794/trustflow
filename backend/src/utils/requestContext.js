const axios = require('axios');

const normalizeIp = (value = '') => {
  const ip = String(value || '').trim();
  if (!ip || ip === 'unknown' || ip === '::ffff:127.0.0.1' || ip === '::1') return '127.0.0.1';
  const normalized = ip.split(',')[0].trim();
  const ipv6Mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  return ipv6Mapped ? ipv6Mapped[1] : normalized;
};

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  const forwardedHeader = req.headers.forwarded;
  const candidates = [];

  if (Array.isArray(forwarded)) candidates.push(...forwarded.map((entry) => String(entry).trim()));
  else if (forwarded) candidates.push(...String(forwarded).split(',').map((entry) => entry.trim()));

  if (realIp) candidates.push(String(realIp).trim());

  if (forwardedHeader) {
    const match = String(forwardedHeader).match(/for=\[?([^\]]+)\]?/i);
    if (match && match[1]) candidates.push(match[1].replace(/"/g, ''));
  }

  if (req.socket?.remoteAddress) candidates.push(req.socket.remoteAddress);
  if (req.ip) candidates.push(req.ip);

  for (const candidate of candidates) {
    const normalized = normalizeIp(candidate);
    if (normalized && normalized !== 'unknown' && !/^127\.0\.0\.1$/i.test(normalized) && !/^::1$/i.test(normalized)) {
      return normalized;
    }
  }

  return normalizeIp(req.socket?.remoteAddress || req.ip || '127.0.0.1');
};

const getBrowser = (userAgent = '') => {
  if (/edg/i.test(userAgent)) return 'Edge';
  if (/chrome/i.test(userAgent)) return 'Chrome';
  if (/firefox/i.test(userAgent)) return 'Firefox';
  if (/safari/i.test(userAgent)) return 'Safari';
  return 'Unknown';
};

const getDevice = (userAgent = '') => {
  if (/mobile|android|iphone|ipad/i.test(userAgent)) return 'Mobile Device';
  if (userAgent) return 'Desktop Device';
  return 'Unknown';
};

const getLocation = async (ipAddress) => {
  const normalized = normalizeIp(ipAddress);
  if (!normalized || normalized === 'unknown' || /^127\.0\.0\.1$/i.test(normalized) || /^::1$/i.test(normalized)) {
    return 'Location unavailable';
  }

  const geoUrlTemplate = process.env.GEOLOCATION_URL || 'https://ipapi.co/{ip}/json/';
  try {
    const response = await axios.get(geoUrlTemplate.replace('{ip}', encodeURIComponent(normalized)), {
      timeout: 1500,
      headers: process.env.GEOLOCATION_API_KEY ? { 'X-API-Key': process.env.GEOLOCATION_API_KEY } : undefined,
    });
    const data = response.data || {};
    const city = data.city || data.region || data.country_name || data.country || '';
    const region = data.region || data.region_name || '';
    const country = data.country_name || data.country || '';
    const location = [city, region, country].filter(Boolean).join(', ');
    return location || 'Location unavailable';
  } catch (error) {
    return 'Location unavailable';
  }
};

const getRequestContext = async (req) => {
  const userAgent = req.headers['user-agent'] || '';
  const ipAddress = getClientIp(req);
  return {
    ipAddress,
    device: getDevice(userAgent),
    browser: getBrowser(userAgent),
    location: await getLocation(ipAddress),
  };
};

module.exports = { getClientIp, getRequestContext };