const express = require('express');
const router = express.Router();
const { protect, requireUser } = require('../middleware/auth');
const {
  getUserDashboard,
  getUserProfile,
  updateUserProfile,
  getUserSecurityLog,
  getUserTransactions,
  createUserTransaction,
  createRazorpayOrder,
  verifyRazorpayPayment,
  reportRazorpayFailure,
  getUserSettings,
  updateUserSettings,
  logoutUser,
  getUserNotifications,
} = require('../controllers/userController');

router.use(protect, requireUser);

router.get('/dashboard', getUserDashboard);
router.get('/profile', getUserProfile);
router.put('/profile', updateUserProfile);
router.get('/security-log', getUserSecurityLog);
router.get('/transactions', getUserTransactions);
router.post('/transactions', createUserTransaction);
router.post('/transactions/:transactionId/create-order', createRazorpayOrder);
router.post('/transactions/:transactionId/verify-payment', verifyRazorpayPayment);
router.post('/transactions/:transactionId/payment-failed', reportRazorpayFailure);
router.get('/settings', getUserSettings);
router.put('/settings', updateUserSettings);
router.get('/notifications', getUserNotifications);
router.post('/logout', logoutUser);

module.exports = router;
