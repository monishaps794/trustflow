const express = require('express');
const router = express.Router();
const { protect, requireAdmin } = require('../middleware/auth');
const {
  getAdminDashboard,
  getAdminUsers,
  getAdminUserById,
  getAdminLoginMonitoring,
  getAdminTransactions,
  getAdminAlerts,
  getAdminSecurityAlerts,
  getAdminAuditLogs,
  getAdminReports,
  exportCsv,
  getAdminProfile,
  updateAdminSettings,
  getAdminNotifications,
  approveRequest,
  rejectRequest,
  blockTransaction,
  unblockTransaction,
  logoutAdmin,
  getAdminUserTransactions,
} = require('../controllers/adminController');

router.use(protect, requireAdmin);

router.get('/dashboard', getAdminDashboard);
router.get('/users', getAdminUsers);
router.get('/users/:id', getAdminUserById);
router.get('/users/:id/transactions', getAdminUserTransactions);
router.get('/logins', getAdminLoginMonitoring);
router.get('/transactions', getAdminTransactions);
router.get('/alerts', getAdminAlerts);
router.get('/security-alerts', getAdminSecurityAlerts);
router.get('/audit-logs', getAdminAuditLogs);
router.get('/reports', getAdminReports);
router.get('/reports/export-csv', exportCsv);
router.get('/profile', getAdminProfile);
router.get('/notifications', getAdminNotifications);
router.put('/settings', updateAdminSettings);
router.post('/approvals/:id/approve', approveRequest);
router.post('/approvals/:id/reject', rejectRequest);
router.post('/transactions/:id/block', blockTransaction);
router.post('/transactions/:id/unblock', unblockTransaction);
router.post('/logout', logoutAdmin);

module.exports = router;
