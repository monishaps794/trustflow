const User = require('../models/User');
const Transaction = require('../models/Transaction');
const LoginAttempt = require('../models/LoginAttempt');
const Alert = require('../models/Alert');
const ApprovalRequest = require('../models/ApprovalRequest');
const Settings = require('../models/Settings');
const AuditLog = require('../models/AuditLog');
const Session = require('../models/Session');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { scoreTransactionRisk } = require('../services/riskService');
const { createNotificationRecord } = require('../utils/emailService');
const { createSecurityAction } = require('./authController');

const normalizeTransactionStatus = (status) => {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'PENDING_PAYMENT' || normalized === 'AWAITING_PAYMENT' || normalized === 'APPROVED_PAYMENT_AVAILABLE') {
    return 'AWAITING_PAYMENT';
  }
  if (normalized === 'PENDING_ADMIN_APPROVAL' || normalized === 'AWAITING_ADMIN_APPROVAL') {
    return 'AWAITING_ADMIN_APPROVAL';
  }
  return normalized;
};

const isPaymentStatusEligible = (status) => {
  const normalized = normalizeTransactionStatus(status);
  return normalized === 'AWAITING_PAYMENT' || normalized === 'PENDING' || normalized === 'APPROVED_PAYMENT_AVAILABLE';
};

const parseRupeeAmount = (value) => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const amount = String(value).trim();
  const match = amount.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;

  const wholeRupees = BigInt(match[1]);
  const paise = wholeRupees * 100n + BigInt((match[2] || '').padEnd(2, '0') || '0');
  if (paise <= 0n || paise > BigInt(Number.MAX_SAFE_INTEGER)) return null;

  const paiseNumber = Number(paise);
  const rupees = paiseNumber / 100;
  const storedPaise = Math.round(rupees * 100);
  if (!Number.isFinite(rupees) || !Number.isSafeInteger(storedPaise) || storedPaise !== paiseNumber) return null;

  return { rupees, paise: paiseNumber };
};

const normalizeRupeeAmount = (value) => {
  const parsedAmount = parseRupeeAmount(value);
  return parsedAmount ? parsedAmount.rupees : null;
};

const toPaise = (amountInRupees) => {
  const parsedAmount = parseRupeeAmount(amountInRupees);
  return parsedAmount ? parsedAmount.paise : 0;
};

const sanitizeRazorpayDescription = (description) => String(description || '')
  .replace(/[\x00-\x1F\x7F]+/g, ' ')
  .replace(/\s+/g, ' ')
  .replace(/((?:key_secret|authorization|password|token)\s*[:=]\s*)\S+/gi, '$1[REDACTED]')
  .trim()
  .slice(0, 240);

const getRazorpayErrorDetails = (error) => {
  const providerError = error?.error && typeof error.error === 'object' ? error.error : {};
  return {
    httpStatus: Number(error?.statusCode || 0) || null,
    code: String(providerError.code || error?.code || ''),
    description: sanitizeRazorpayDescription(providerError.description || 'Razorpay order request failed.'),
    source: String(providerError.source || ''),
    field: String(providerError.field || ''),
    reason: String(providerError.reason || ''),
  };
};

const isRazorpaySignatureValid = (orderId, paymentId, signature, secret) => {
  if (!orderId || !paymentId || !secret || !/^[a-f\d]{64}$/i.test(String(signature))) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest();
  const supplied = Buffer.from(signature, 'hex');
  return supplied.length === expected.length && crypto.timingSafeEqual(expected, supplied);
};

const getRazorpayOrderFailureResponse = (errorDetails) => {
  const details = typeof errorDetails === 'string'
    ? { description: errorDetails, httpStatus: null, code: '' }
    : errorDetails || {};
  const errorMessage = String(details.description || '');

  if (/amount exceeds maximum amount allowed/i.test(errorMessage)) {
    return {
      status: 422,
      message: 'Razorpay rejected this order amount. The configured Test Mode account limit may be below the requested amount; verify it with the account owner or Razorpay support.',
    };
  }

  if (details.httpStatus === 400) {
    return {
      status: 422,
      message: 'Razorpay rejected the order request. Please verify the transaction details or contact support.',
    };
  }

  if (details.httpStatus === 429) {
    return {
      status: 503,
      message: 'Razorpay is temporarily rate-limiting order requests. Please wait and try again.',
    };
  }

  if (!details.httpStatus && ['ETIMEDOUT', 'ECONNABORTED', 'ECONNRESET', 'EAI_AGAIN'].includes(details.code)) {
    return {
      status: 504,
      message: 'Razorpay did not confirm whether the order was created. Contact support with the transaction ID before retrying.',
    };
  }

  return {
    status: 502,
    message: /invalid|not configured|payment/i.test(errorMessage)
      ? sanitizeRazorpayDescription(errorMessage)
      : 'Unable to initialize payment. Please try again.',
  };
};

const toRazorpayContact = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return '';
};

const getTransactionVerificationState = (riskLevel = 'LOW') => {
  const normalizedLevel = String(riskLevel || 'LOW').toUpperCase();
  const requiresEmailVerification = ['LOW', 'MEDIUM', 'HIGH'].includes(normalizedLevel);

  return {
    riskLevel: normalizedLevel,
    requiresEmailVerification,
    requiresAdminApproval: normalizedLevel === 'HIGH',
    requiresPayment: false,
    status: requiresEmailVerification ? 'AWAITING_EMAIL_VERIFICATION' : 'AWAITING_PAYMENT',
  };
};

const isPaymentAllowedForTransaction = (transaction) => {
  if (!transaction) return false;
  const normalizedStatus = normalizeTransactionStatus(transaction.status);
  if (['REJECTED', 'BLOCKED', 'COMPLETED', 'FAILED'].includes(normalizedStatus)) return false;
  if (transaction.emailVerificationStatus === 'REJECTED') return false;

  const adminApproved = transaction.adminApprovalStatus === 'APPROVED' && transaction.approvalStatus === 'APPROVED';
  const paymentStatusIsEligible = isPaymentStatusEligible(normalizedStatus);

  if (transaction.riskLevel === 'LOW' || transaction.riskLevel === 'MEDIUM') {
    return transaction.emailVerificationStatus === 'APPROVED' && paymentStatusIsEligible;
  }

  if (transaction.riskLevel === 'HIGH') {
    return transaction.emailVerificationStatus === 'APPROVED' && adminApproved && paymentStatusIsEligible;
  }

  return false;
};

const isPaymentEligible = (transaction) => isPaymentAllowedForTransaction(transaction);

const getRazorpayClient = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    return null;
  }

  if (!String(keyId).startsWith('rzp_test_')) {
    return null;
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
};

const logRazorpaySafe = (event, details = {}) => {
  console.info(`[razorpay] ${event}`, {
    requestId: details.requestId || '',
    orderId: details.orderId || '',
    paymentId: details.paymentId || '',
    riskLevel: details.riskLevel || '',
    amountInRupees: details.amountInRupees,
    amountInPaise: details.amountInPaise ?? details.amount,
    currency: details.currency || 'INR',
    environment: details.environment || (String(process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_test_') ? 'test' : 'unknown'),
    providerHttpStatus: details.providerHttpStatus || '',
    providerErrorCode: details.providerErrorCode || details.code || '',
    description: sanitizeRazorpayDescription(details.description),
    transactionId: details.transactionId || '',
  });
};

const getUserDashboard = async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  if (!user) return res.status(404).json({ message: 'User not found.' });

  const transactions = await Transaction.find({ sender: user._id }).sort({ createdAt: -1 }).limit(10).lean();
  const alerts = await Alert.find({ user: user._id }).sort({ createdAt: -1 }).limit(10).lean();
  const securityEvents = await LoginAttempt.find({ user: user._id }).sort({ timestamp: -1 }).limit(10).lean();

  res.status(200).json({
    user: {
      ...user,
      maskedAccountNumber: user.accountNumber ? `******${user.accountNumber.slice(-4)}` : 'N/A',
    },
    transactions,
    alerts,
    securityEvents,
  });
};

const getUserProfile = async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  if (!user) return res.status(404).json({ message: 'User not found.' });
  res.status(200).json({
    ...user,
    maskedAccountNumber: user.accountNumber ? `******${user.accountNumber.slice(-4)}` : 'N/A',
  });
};

const updateUserProfile = async (req, res) => {
  const updates = req.body;
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found.' });

  Object.keys(updates).forEach((key) => {
    if (key !== 'email' && key !== 'phone' && key !== '_id') user[key] = updates[key];
  });

  await user.save();
  await AuditLog.create({ actor: user.email, actorRole: 'USER', action: 'PROFILE_UPDATED', resource: 'USER', resourceId: user._id.toString(), ipAddress: req.ip, status: 'SUCCESS' });
  res.status(200).json({ message: 'Profile updated.', user });
};

const getUserSecurityLog = async (req, res) => {
  const user = await User.findById(req.user.id);
  const events = await LoginAttempt.find({ user: user._id }).sort({ timestamp: -1 }).lean();
  res.status(200).json({
    securityScore: user.securityScore || 0,
    accountStatus: user.accountStatus,
    mfaStatus: user.mfaEnabled ? 'ENABLED' : 'DISABLED',
    lastLogin: user.lastLogin,
    riskStatus: user.riskLevel,
    recentSecurityEvents: events,
    failedLoginAttempts: user.failedLoginAttempts,
    suspiciousLoginEvents: events.filter((event) => event.status === 'SUSPICIOUS'),
    deviceInformation: events.map((event) => ({ device: event.device, browser: event.browser, ipAddress: event.ipAddress, location: event.location })),
    sessionInformation: { currentSession: user.sessionInfo?.currentSession || null, lastActiveSession: user.sessionInfo?.lastActiveSession || null },
  });
};

const getUserTransactions = async (req, res) => {
  const transactions = await Transaction.find({ sender: req.user.id }).sort({ createdAt: -1 }).lean();
  res.status(200).json({ transactions });
};

const createUserTransaction = async (req, res) => {
  const { recipientName, recipientBankName, recipientAccount, amount, purpose } = req.body;
  const user = await User.findById(req.user.id);

  if (!recipientName || !recipientBankName || !recipientAccount || !amount || !purpose) {
    return res.status(400).json({ message: 'Recipient name, bank name, account, amount, and purpose are required.' });
  }

  const normalizedAmount = normalizeRupeeAmount(amount);
  if (normalizedAmount === null) {
    return res.status(400).json({ message: 'Transaction amount must be a positive INR amount with no more than two decimal places.' });
  }

  const previousTransactions = await Transaction.find({ sender: user._id, status: { $ne: 'REJECTED' } }).sort({ createdAt: -1 }).limit(20).lean();
  const riskResult = await scoreTransactionRisk({
    user,
    amount: normalizedAmount,
    recipientName,
    recipientBankName,
    recipientAccount,
    purpose,
    transactionType: 'TRANSFER',
    previousTransactions,
  });

  const verificationState = getTransactionVerificationState(riskResult.level);
  const isHighRisk = riskResult.level === 'HIGH';

  const transaction = await Transaction.create({
    sender: user._id,
    senderAccountNumber: user.accountNumber,
    recipientName,
    recipientBankName,
    recipientAccount,
    amount: normalizedAmount,
    purpose,
    transactionType: 'TRANSFER',
    status: verificationState.status,
    paymentStatus: 'PENDING',
    approvalStatus: isHighRisk ? 'PENDING' : 'NOT_REQUIRED',
    adminApprovalStatus: isHighRisk ? 'PENDING' : 'NOT_REQUIRED',
    riskScore: riskResult.score,
    riskLevel: riskResult.level,
    riskReasons: riskResult.reasons,
    emailVerified: false,
    emailVerificationStatus: verificationState.requiresEmailVerification ? 'PENDING' : 'NOT_REQUIRED',
  });

  if (verificationState.requiresEmailVerification) {
    const alert = await Alert.create({
      type: 'SUSPICIOUS_TRANSACTION',
      user: user._id,
      relatedTransaction: transaction._id,
      message: `${riskResult.level === 'HIGH' ? 'High-risk' : (riskResult.level === 'MEDIUM' ? 'Medium-risk' : 'Low-risk')} transaction detected for ${Number(amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}. Verification is required before payment can proceed.`,
      severity: riskResult.level === 'HIGH' ? 'HIGH' : 'MEDIUM',
      riskScore: riskResult.score,
      status: 'OPEN',
    });

    transaction.relatedAlert = alert._id;
    await transaction.save();

    if (isHighRisk) {
      await ApprovalRequest.create({
        type: 'SUSPICIOUS_TRANSACTION',
        resourceType: 'TRANSACTION',
        resourceId: transaction._id,
        user: user._id,
        details: `Transaction approval required for ${recipientName} amount ${Number(amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}`,
        status: 'PENDING',
      });

      const admin = await require('../models/Admin').findOne({}).lean();
      if (admin) {
        await createNotificationRecord({
          recipient: admin,
          recipientRole: 'ADMIN',
          type: 'PENDING_APPROVAL',
          title: 'Pending Approval Required',
          message: `A high-risk transaction from ${user.name} for ${Number(amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })} is awaiting approval.`,
          severity: 'CRITICAL',
          relatedEntityType: 'TRANSACTION',
          relatedEntityId: transaction._id.toString(),
          status: 'PENDING',
        });
      }
    }

    await createSecurityAction({
      email: user.email,
      user,
      action: 'SUSPICIOUS_TRANSACTION_APPROVE',
      targetType: 'TRANSACTION',
      targetId: transaction._id,
      eventTitle: 'TRUSTFLOW — Transaction Verification Required',
      eventDescription: `${riskResult.level === 'HIGH' ? 'A high-risk' : (riskResult.level === 'MEDIUM' ? 'A medium-risk' : 'A low-risk')} transfer to ${recipientName} for ${Number(amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })} requires confirmation. Please confirm if this transaction was yours.`,
    });

    await createNotificationRecord({
      recipient: user,
      recipientRole: 'USER',
      type: 'TRANSACTION_VERIFICATION_REQUIRED',
      title: 'Verification message sent',
      message: `A ${riskResult.level.toLowerCase()} risk transfer to ${recipientName} for ${Number(amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })} requires confirmation before payment can proceed.`,
      severity: riskResult.level === 'HIGH' ? 'CRITICAL' : 'WARNING',
      relatedEntityType: 'TRANSACTION',
      relatedEntityId: transaction._id.toString(),
      status: 'PENDING',
    });

    await AuditLog.create({ actor: user.email, actorRole: 'USER', action: 'TRANSACTION_PROPOSED_SUSPICIOUS', resource: 'TRANSACTION', resourceId: transaction._id.toString(), ipAddress: req.ip, status: 'PENDING', metadata: { riskScore: riskResult.score, reasons: riskResult.reasons, riskLevel: riskResult.level } });

    return res.status(200).json({
      message: 'Verification email sent to your registered email address. Waiting for your confirmation.',
      riskScore: riskResult.score,
      riskLevel: riskResult.level,
      transactionId: transaction._id,
      requiresApproval: isHighRisk,
      requiresPayment: false,
      status: 'AWAITING_EMAIL_VERIFICATION',
    });
  }

  await AuditLog.create({ actor: user.email, actorRole: 'USER', action: 'TRANSACTION_CREATED', resource: 'TRANSACTION', resourceId: transaction._id.toString(), ipAddress: req.ip, status: 'SUCCESS', metadata: { amount: Number(amount), riskLevel: riskResult.level } });

  res.status(201).json({
    message: 'Payment risk is low. Email verification is complete. You may proceed to Razorpay payment.',
    riskScore: riskResult.score,
    riskLevel: riskResult.level,
    transactionId: transaction._id,
    requiresApproval: false,
    requiresPayment: true,
    status: 'AWAITING_PAYMENT',
    transaction,
  });
};

const createRazorpayOrder = async (req, res) => {
  const requestId = crypto.randomUUID();
  res.set('X-Request-ID', requestId);
  const { transactionId, id } = req.params;
  const targetTransactionId = transactionId || id;
  const transaction = await Transaction.findOne({ _id: targetTransactionId, sender: req.user.id });
  if (!transaction) return res.status(404).json({ success: false, message: 'Transaction not found.' });

  if (transaction.riskLevel === 'MEDIUM' && transaction.emailVerificationStatus !== 'APPROVED') {
    return res.status(403).json({ success: false, message: 'Email verification required before payment.' });
  }

  if (transaction.riskLevel === 'HIGH') {
    if (transaction.emailVerificationStatus !== 'APPROVED') {
      return res.status(403).json({ success: false, message: 'Email verification required before payment.' });
    }
    const adminApproved = transaction.adminApprovalStatus === 'APPROVED' && transaction.approvalStatus === 'APPROVED';
    if (!adminApproved) {
      return res.status(403).json({ success: false, message: 'Administrator approval required before payment.' });
    }
  }

  if (!isPaymentEligible(transaction)) {
    return res.status(403).json({ success: false, message: 'This transaction is not authorized for payment.' });
  }

  const razorpayClient = getRazorpayClient();
  if (!razorpayClient) {
    return res.status(503).json({ success: false, message: 'Razorpay payment is not configured. Please contact support.' });
  }

  const user = await User.findById(req.user.id).select('name email phone');
  const transactionCurrency = String(transaction.currency || 'INR').trim().toUpperCase();
  const normalizedAmount = normalizeRupeeAmount(transaction.amount);
  if (normalizedAmount === null) {
    return res.status(400).json({ success: false, message: 'The transaction amount must be a positive INR amount with no more than two decimal places.' });
  }
  if (transactionCurrency !== 'INR') {
    return res.status(400).json({ success: false, message: 'Only INR transactions can be paid through this Razorpay checkout.' });
  }

  const amountPaise = toPaise(normalizedAmount);
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    return res.status(400).json({ success: false, message: 'The transaction amount is invalid for Razorpay.' });
  }
  transaction.amount = normalizedAmount;
  const keyId = process.env.RAZORPAY_KEY_ID;
  const prefill = {
    name: user?.name || 'TrustFlow User',
    email: user?.email || '',
    contact: toRazorpayContact(user?.phone),
  };

  const respondWithOrder = (order, reused = false) => res.status(200).json({
    success: true,
    orderId: order.id,
    order: { id: order.id, amount: Number(order.amount), currency: 'INR' },
    keyId,
    amount: Number(order.amount),
    currency: 'INR',
    prefill,
    reused,
  });

  let order;
  try {
    if (transaction.paymentOrderId) {
      try {
        const existing = await razorpayClient.orders.fetch(transaction.paymentOrderId);
        if (
          existing
          && existing.status === 'created'
          && Number(existing.amount) === amountPaise
          && String(existing.currency).toUpperCase() === 'INR'
        ) {
          logRazorpaySafe('order_reused', {
            requestId,
            orderId: existing.id,
            riskLevel: transaction.riskLevel,
            amountInRupees: normalizedAmount,
            amountInPaise: existing.amount,
            currency: existing.currency,
            transactionId: transaction._id.toString(),
          });
          return respondWithOrder(existing, true);
        }
        return res.status(409).json({
          success: false,
          message: 'The existing Razorpay order is no longer available for checkout. Contact support to verify its status before retrying.',
        });
      } catch (fetchErr) {
        const providerError = getRazorpayErrorDetails(fetchErr);
        if (providerError.httpStatus !== 404) {
          logRazorpaySafe('order_fetch_failed', {
            requestId,
            orderId: transaction.paymentOrderId,
            riskLevel: transaction.riskLevel,
            amountInRupees: normalizedAmount,
            amountInPaise: amountPaise,
            currency: transactionCurrency,
            providerHttpStatus: providerError.httpStatus,
            providerErrorCode: providerError.code,
            description: providerError.description,
            transactionId: transaction._id.toString(),
          });
          return res.status(503).json({
            success: false,
            message: 'TrustFlow could not confirm the existing Razorpay order. Please try again shortly; do not submit another payment.',
          });
        }
      }
    }

    try {
      order = await razorpayClient.orders.create({
        amount: amountPaise,
        currency: 'INR',
        receipt: `tf${transaction._id}${Date.now()}`.slice(0, 40),
        notes: {
          transactionId: transaction._id.toString(),
          userId: String(req.user.id),
          flow: 'INR_DOMESTIC_TEST',
        },
      });
    } catch (error) {
      const razorpayError = getRazorpayErrorDetails(error);
      const failureResponse = getRazorpayOrderFailureResponse(razorpayError);
      logRazorpaySafe('order_create_failed', {
        requestId,
        riskLevel: transaction.riskLevel,
        amountInRupees: normalizedAmount,
        amountInPaise: amountPaise,
        currency: transactionCurrency,
        providerHttpStatus: razorpayError.httpStatus,
        providerErrorCode: razorpayError.code,
        description: razorpayError.description,
        transactionId: transaction._id.toString(),
      });
      return res.status(failureResponse.status).json({ success: false, message: failureResponse.message });
    }

    transaction.paymentOrderId = order.id;
    transaction.paymentStatus = 'PENDING';
    transaction.currency = 'INR';
    if (transaction.status === 'PENDING_ADMIN_APPROVAL' || transaction.status === 'AWAITING_ADMIN_APPROVAL') {
      transaction.status = 'AWAITING_PAYMENT';
    }
    await transaction.save();

    logRazorpaySafe('order_created', {
      requestId,
      orderId: order.id,
      riskLevel: transaction.riskLevel,
      amountInRupees: normalizedAmount,
      amountInPaise: order.amount,
      currency: order.currency,
      transactionId: transaction._id.toString(),
    });
    return respondWithOrder(order, false);
  } catch (error) {
    console.error('[razorpay] order_persistence_failed', {
      requestId,
      transactionId: transaction._id.toString(),
      riskLevel: transaction.riskLevel,
      amountInRupees: normalizedAmount,
      amountInPaise: amountPaise,
      transactionCurrency,
      orderId: order?.id || '',
      error: sanitizeRazorpayDescription(error?.message || 'Unable to persist payment order'),
    });
    return res.status(500).json({
      success: false,
      message: 'Razorpay may have created the payment order, but TrustFlow could not save its status. Contact support before retrying.',
    });
  }
};

const verifyRazorpayPayment = async (req, res) => {
  const { transactionId, id } = req.params;
  const targetTransactionId = transactionId || id;
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ message: 'Payment verification data is incomplete.' });
  }

  const transaction = await Transaction.findOne({ _id: targetTransactionId, sender: req.user.id });
  if (!transaction) return res.status(404).json({ success: false, message: 'Transaction not found.' });

  if (transaction.status === 'COMPLETED' && transaction.paymentId === razorpay_payment_id) {
    return res.status(200).json({ message: 'Payment verified successfully.', transaction });
  }

  if (!transaction.paymentOrderId || transaction.paymentOrderId !== razorpay_order_id) {
    return res.status(400).json({ message: 'Order mismatch. The payment order does not belong to this transaction.' });
  }

  if (!isPaymentEligible(transaction)) {
    return res.status(403).json({ message: 'This transaction is not authorized for payment.' });
  }

  if (!process.env.RAZORPAY_KEY_SECRET) {
    return res.status(503).json({ message: 'Payment verification failed. Please contact support or try again.' });
  }

  const isValid = isRazorpaySignatureValid(
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    process.env.RAZORPAY_KEY_SECRET,
  );
  if (!isValid) {
    transaction.paymentStatus = 'FAILED';
    transaction.paymentFailureReason = 'Razorpay signature verification failed.';
    transaction.paymentFailureCode = 'SIGNATURE_MISMATCH';
    await transaction.save();
    await AuditLog.create({ actor: req.user.email, actorRole: 'USER', action: 'RAZORPAY_PAYMENT_FAILED', resource: 'TRANSACTION', resourceId: transaction._id.toString(), ipAddress: req.ip, status: 'FAILED', metadata: { razorpay_payment_id: razorpay_payment_id || '', razorpay_order_id: razorpay_order_id || '', reason: 'SIGNATURE_MISMATCH' } });
    logRazorpaySafe('signature_mismatch', { orderId: razorpay_order_id, paymentId: razorpay_payment_id, transactionId: transaction._id.toString() });
    return res.status(400).json({ message: 'Payment verification failed. Please contact support or try again.' });
  }

  const razorpayClient = getRazorpayClient();
  if (!razorpayClient) {
    return res.status(503).json({ message: 'Payment could not be confirmed with Razorpay. Please contact support or try again.' });
  }

  let payment;
  try {
    payment = await razorpayClient.payments.fetch(razorpay_payment_id);
  } catch (fetchErr) {
    const providerError = getRazorpayErrorDetails(fetchErr);
    logRazorpaySafe('payment_fetch_failed', {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      providerHttpStatus: providerError.httpStatus,
      providerErrorCode: providerError.code,
      description: providerError.description,
      transactionId: transaction._id.toString(),
    });
    return res.status(503).json({ message: 'Payment could not be confirmed with Razorpay. Please contact support or try again.' });
  }

  const expectedAmountPaise = toPaise(transaction.amount);
  if (
    !expectedAmountPaise
    || payment.id !== razorpay_payment_id
    || payment.order_id !== razorpay_order_id
    || Number(payment.amount) !== expectedAmountPaise
    || String(payment.currency || '').toUpperCase() !== 'INR'
  ) {
    logRazorpaySafe('payment_details_mismatch', {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      amountInRupees: transaction.amount,
      amountInPaise: Number(payment.amount),
      currency: payment.currency,
      description: 'Provider payment details do not match the transaction',
      transactionId: transaction._id.toString(),
    });
    return res.status(400).json({ message: 'Payment verification failed. Please contact support or try again.' });
  }

  if (payment.status !== 'captured') {
    if (payment.status === 'failed') {
      transaction.paymentStatus = 'FAILED';
      transaction.status = 'FAILED';
      transaction.paymentFailureReason = payment.error_description || 'Razorpay payment failed.';
      transaction.paymentFailureCode = payment.error_code || 'PAYMENT_FAILED';
      await transaction.save();
      return res.status(400).json({ message: 'Payment failed. Please try again.' });
    }
    return res.status(409).json({ message: 'Razorpay has not confirmed that this payment was captured yet. Please try again shortly.' });
  }
  logRazorpaySafe('payment_fetched', { orderId: razorpay_order_id, paymentId: razorpay_payment_id, amountInPaise: payment.amount, currency: payment.currency, description: payment.status, transactionId: transaction._id.toString() });

  transaction.paymentStatus = 'PAID';
  transaction.paymentId = razorpay_payment_id || '';
  transaction.paymentReference = razorpay_order_id || '';
  transaction.paymentMethod = 'RAZORPAY';
  transaction.currency = 'INR';
  transaction.status = 'COMPLETED';
  transaction.approvedAt = new Date();
  transaction.paymentFailureReason = '';
  transaction.paymentFailureCode = '';
  await transaction.save();

  const user = await User.findById(req.user.id).lean();
  await createNotificationRecord({
    recipient: user,
    recipientRole: 'USER',
    type: 'PAYMENT_SUCCESSFUL',
    title: 'Payment Successful',
    message: `Your payment of ${Number(transaction.amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })} to ${transaction.recipientName} was successful. Transaction ID: ${transaction._id.toString()}.`,
    severity: 'SUCCESS',
    relatedEntityType: 'TRANSACTION',
    relatedEntityId: transaction._id.toString(),
    status: 'RESOLVED',
  });

  await Alert.create({
    type: 'PAYMENT_COMPLETED',
    user: req.user.id,
    relatedTransaction: transaction._id,
    message: `Razorpay Test Mode payment completed for ${Number(transaction.amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}.`,
    severity: 'LOW',
    riskScore: transaction.riskScore || 0,
    status: 'RESOLVED',
  });

  await AuditLog.create({ actor: req.user.email, actorRole: 'USER', action: 'PAYMENT_VERIFIED', resource: 'TRANSACTION', resourceId: transaction._id.toString(), ipAddress: req.ip, status: 'SUCCESS', metadata: { razorpay_payment_id: razorpay_payment_id || '', razorpay_order_id: razorpay_order_id || '' } });

  return res.status(200).json({ message: 'Payment verified successfully.', transaction });
};

const reportRazorpayFailure = async (req, res) => {
  const { transactionId, id } = req.params;
  const targetTransactionId = transactionId || id;
  const transaction = await Transaction.findOne({ _id: targetTransactionId, sender: req.user.id });
  if (!transaction) return res.status(404).json({ success: false, message: 'Transaction not found.' });
  if (transaction.status === 'COMPLETED') {
    return res.status(400).json({ message: 'This transaction is already completed.' });
  }

  const code = req.body.code || req.body.reason || 'PAYMENT_FAILED';
  const description = req.body.description || req.body.reason || 'Payment failed. Please try again.';

  transaction.paymentFailureReason = String(description).slice(0, 500);
  transaction.paymentFailureCode = String(code).slice(0, 80);
  transaction.paymentStatus = 'PENDING';
  await transaction.save();

  const user = await User.findById(req.user.id).lean();
  await createNotificationRecord({
    recipient: user,
    recipientRole: 'USER',
    type: 'PAYMENT_FAILED',
    title: 'Payment Failed',
    message: `Your payment attempt for ${Number(transaction.amount).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })} could not be completed.`,
    severity: 'WARNING',
    relatedEntityType: 'TRANSACTION',
    relatedEntityId: transaction._id.toString(),
    status: 'REJECTED',
  });

  await AuditLog.create({
    actor: req.user.email,
    actorRole: 'USER',
    action: 'RAZORPAY_PAYMENT_FAILED',
    resource: 'TRANSACTION',
    resourceId: transaction._id.toString(),
    ipAddress: req.ip,
    status: 'FAILED',
    metadata: {
      razorpay_payment_id: req.body.payment_id || '',
      razorpay_order_id: req.body.order_id || transaction.paymentOrderId || '',
      code: transaction.paymentFailureCode,
      description: transaction.paymentFailureReason,
    },
  });

  logRazorpaySafe('checkout_failed', {
    orderId: req.body.order_id || transaction.paymentOrderId,
    paymentId: req.body.payment_id || '',
    amount: toPaise(transaction.amount),
    currency: 'INR',
    code: transaction.paymentFailureCode,
    description: transaction.paymentFailureReason,
    transactionId: transaction._id.toString(),
  });

  return res.status(200).json({ message: 'Payment failed. Please try again.' });
};

const getUserSettings = async (req, res) => {
  const user = await User.findById(req.user.id);
  const settings = await Settings.findOne({ owner: req.user.id, ownerModel: 'User' }).lean();
  if (!settings) {
    const created = await Settings.create({ owner: user._id, ownerModel: 'User', mfaEnabled: user.mfaEnabled, userNotifications: user.notificationPreferences, securityPreferences: user.securityPreferences });
    return res.status(200).json({ settings: created });
  }
  if (typeof settings.mfaEnabled !== 'boolean') settings.mfaEnabled = user.mfaEnabled !== false;
  res.status(200).json({ settings });
};

const updateUserSettings = async (req, res) => {
  const user = await User.findById(req.user.id);
  const settings = await Settings.findOne({ owner: user._id, ownerModel: 'User' });
  const updateData = req.body;

  if (!settings) {
    const created = await Settings.create({ owner: user._id, ownerModel: 'User', mfaEnabled: typeof updateData.mfaEnabled === 'boolean' ? updateData.mfaEnabled : user.mfaEnabled, userNotifications: { ...user.notificationPreferences, ...updateData.userNotifications }, securityPreferences: { ...user.securityPreferences, ...updateData.securityPreferences } });
    user.mfaEnabled = created.mfaEnabled;
    user.notificationPreferences = created.userNotifications;
    user.securityPreferences = created.securityPreferences;
    await user.save();
    return res.status(200).json({ message: 'User settings created.', settings: created });
  }

  if (typeof updateData.mfaEnabled === 'boolean') {
    settings.mfaEnabled = updateData.mfaEnabled;
    user.mfaEnabled = updateData.mfaEnabled;
  }
  settings.userNotifications = { ...settings.userNotifications, ...updateData.userNotifications };
  settings.securityPreferences = { ...settings.securityPreferences, ...updateData.securityPreferences };
  user.notificationPreferences = settings.userNotifications;
  user.securityPreferences = settings.securityPreferences;
  await settings.save();
  await user.save();

  await AuditLog.create({ actor: user.email, actorRole: 'USER', action: 'SETTINGS_UPDATED', resource: 'SETTINGS', resourceId: settings._id.toString(), ipAddress: req.ip, status: 'SUCCESS', metadata: { mfaEnabled: settings.mfaEnabled } });
  res.status(200).json({ message: 'Settings updated.', settings });
};

const logoutUser = async (req, res) => {
  const user = await User.findById(req.user.id);
  await Session.updateMany({ user: user._id, status: 'ACTIVE' }, { status: 'LOGGED_OUT', logoutTime: new Date() });
  await createNotificationRecord({
    recipient: user,
    recipientRole: 'USER',
    type: 'SESSION_LOGOUT',
    title: 'Session Logout',
    message: 'Your TRUSTFLOW session has ended successfully.',
    severity: 'INFO',
    relatedEntityType: 'SESSION',
    relatedEntityId: user._id.toString(),
    status: 'RESOLVED',
  });
  await AuditLog.create({ actor: user.email, actorRole: 'USER', action: 'LOGOUT', resource: 'SESSION', resourceId: user._id.toString(), ipAddress: req.ip, status: 'SUCCESS' });
  res.status(200).json({ message: 'User logged out successfully.' });
};

const getUserNotifications = async (req, res) => {
  const notifications = await Alert.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(25).lean();
  res.status(200).json({ notifications });
};

module.exports = {
  normalizeRupeeAmount,
  toPaise,
  getRazorpayErrorDetails,
  getRazorpayOrderFailureResponse,
  isRazorpaySignatureValid,
  getTransactionVerificationState,
  isPaymentAllowedForTransaction,
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
};
