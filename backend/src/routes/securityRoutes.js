const express = require('express');
const router = express.Router();
const { handleSecurityEmailAction } = require('../controllers/authController');

router.get('/email-action/:token', handleSecurityEmailAction);

module.exports = router;
