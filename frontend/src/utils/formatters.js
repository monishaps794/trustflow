export const toCurrency = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

export const maskAccount = (account) => {
  if (!account) return 'N/A';
  return `******${String(account).slice(-4)}`;
};

export const formatDateTime = (value) => {
  if (!value) return 'N/A';
  return new Date(value).toLocaleString('en-IN');
};

export const riskBadgeClass = (level) => {
  const normalized = (level || '').toUpperCase();
  if (normalized === 'CRITICAL') return 'badge critical';
  if (normalized === 'HIGH') return 'badge high';
  if (normalized === 'MEDIUM') return 'badge medium';
  return 'badge low';
};
