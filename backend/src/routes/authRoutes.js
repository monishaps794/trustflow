const express = require('express');
const router = express.Router();
const {
  requestUserOtp,
  verifyUserOtp,
  registerUser,
  adminRegister,
  requestAdminOtp,
  verifyAdminOtp,
  loginRiskCheck,
  continueSuspiciousLogin,
  cancelSuspiciousLogin,
} = require('../controllers/authController');

router.post('/user/request-otp', requestUserOtp);
router.post('/user/verify-otp', verifyUserOtp);
router.post('/user/register', registerUser);
router.post('/user/login-risk-check', loginRiskCheck);
router.post('/user/suspicious-login/continue', continueSuspiciousLogin);
router.post('/user/suspicious-login/cancel', cancelSuspiciousLogin);

router.post('/admin/register', adminRegister);
router.post('/admin/request-otp', requestAdminOtp);
router.post('/admin/verify-otp', verifyAdminOtp);

module.exports = router;
