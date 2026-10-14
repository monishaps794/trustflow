const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createRazorpayOrder,
  getRazorpayErrorDetails,
  getRazorpayOrderFailureResponse,
  getTransactionVerificationState,
  isRazorpaySignatureValid,
  isPaymentAllowedForTransaction,
  normalizeRupeeAmount,
  toPaise,
  verifyRazorpayPayment,
} = require('../src/controllers/userController');
const Razorpay = require('razorpay');
const User = require('../src/models/User');
const Transaction = require('../src/models/Transaction');
const Alert = require('../src/models/Alert');
const AuditLog = require('../src/models/AuditLog');

test('low risk transactions require email verification before payment', () => {
  const low = getTransactionVerificationState('LOW');
  assert.equal(low.status, 'AWAITING_EMAIL_VERIFICATION');
  assert.equal(low.requiresEmailVerification, true);
  assert.equal(low.requiresPayment, false);
  assert.equal(isPaymentAllowedForTransaction({ riskLevel: 'LOW', emailVerificationStatus: 'PENDING', status: 'AWAITING_EMAIL_VERIFICATION' }), false);
});

test('medium risk transactions require email verification before payment', () => {
  const medium = getTransactionVerificationState('MEDIUM');
  assert.equal(medium.status, 'AWAITING_EMAIL_VERIFICATION');
  assert.equal(medium.requiresEmailVerification, true);
  assert.equal(medium.requiresPayment, false);
});

test('high risk transactions require email verification and admin approval before payment', () => {
  const high = getTransactionVerificationState('HIGH');
  assert.equal(high.status, 'AWAITING_EMAIL_VERIFICATION');
  assert.equal(high.requiresEmailVerification, true);
  assert.equal(high.requiresPayment, false);
  assert.equal(isPaymentAllowedForTransaction({ riskLevel: 'HIGH', emailVerificationStatus: 'APPROVED', adminApprovalStatus: 'APPROVED', approvalStatus: 'APPROVED', status: 'AWAITING_PAYMENT' }), true);
  assert.equal(isPaymentAllowedForTransaction({ riskLevel: 'HIGH', emailVerificationStatus: 'APPROVED', adminApprovalStatus: 'PENDING', status: 'AWAITING_ADMIN_APPROVAL' }), false);
});

test('all risk levels use the same authorized payment gateway path after verification', () => {
  assert.equal(isPaymentAllowedForTransaction({ riskLevel: 'LOW', emailVerificationStatus: 'APPROVED', status: 'AWAITING_PAYMENT' }), true);
  assert.equal(isPaymentAllowedForTransaction({ riskLevel: 'MEDIUM', emailVerificationStatus: 'APPROVED', status: 'PENDING_PAYMENT' }), true);
  assert.equal(isPaymentAllowedForTransaction({ riskLevel: 'HIGH', emailVerificationStatus: 'APPROVED', adminApprovalStatus: 'APPROVED', approvalStatus: 'APPROVED', status: 'APPROVED_PAYMENT_AVAILABLE' }), true);
  assert.equal(isPaymentAllowedForTransaction({ riskLevel: 'MEDIUM', emailVerificationStatus: 'PENDING', status: 'AWAITING_PAYMENT' }), false);
  assert.equal(isPaymentAllowedForTransaction({ riskLevel: 'HIGH', emailVerificationStatus: 'APPROVED', adminApprovalStatus: 'PENDING', status: 'AWAITING_PAYMENT' }), false);
  assert.equal(isPaymentAllowedForTransaction({ riskLevel: 'HIGH', emailVerificationStatus: 'APPROVED', adminApprovalStatus: 'PENDING', approvalStatus: 'APPROVED', status: 'AWAITING_PAYMENT' }), false);
});

test('admin approval gate is enforced for high-risk transactions regardless of status aliases', () => {
  assert.equal(isPaymentAllowedForTransaction({ riskLevel: 'HIGH', emailVerificationStatus: 'APPROVED', adminApprovalStatus: 'PENDING', status: 'PENDING_ADMIN_APPROVAL' }), false);
  assert.equal(isPaymentAllowedForTransaction({ riskLevel: 'HIGH', emailVerificationStatus: 'APPROVED', adminApprovalStatus: 'APPROVED', approvalStatus: 'APPROVED', status: 'AWAITING_ADMIN_APPROVAL' }), false);
  assert.equal(isPaymentAllowedForTransaction({ riskLevel: 'HIGH', emailVerificationStatus: 'APPROVED', adminApprovalStatus: 'APPROVED', approvalStatus: 'APPROVED', status: 'AWAITING_PAYMENT' }), true);
  assert.equal(isPaymentAllowedForTransaction({ riskLevel: 'HIGH', emailVerificationStatus: 'APPROVED', adminApprovalStatus: 'REJECTED', status: 'REJECTED' }), false);
});

test('declined and terminal transactions are never eligible for payment', () => {
  assert.equal(isPaymentAllowedForTransaction({ riskLevel: 'MEDIUM', emailVerificationStatus: 'REJECTED', status: 'REJECTED' }), false);
  assert.equal(isPaymentAllowedForTransaction({ riskLevel: 'LOW', emailVerificationStatus: 'APPROVED', status: 'BLOCKED' }), false);
  assert.equal(isPaymentAllowedForTransaction({ riskLevel: 'LOW', emailVerificationStatus: 'APPROVED', status: 'COMPLETED' }), false);
});

test('transaction amounts remain rupees and convert to paise once at the Razorpay boundary', () => {
  const examples = [
    ['700000', 70000000],
    ['1000000', 100000000],
    ['1500000', 150000000],
    ['2000000', 200000000],
  ];

  for (const [rupees, paise] of examples) {
    assert.equal(normalizeRupeeAmount(rupees), Number(rupees));
    assert.equal(toPaise(rupees), paise);
  }
  assert.equal(toPaise('1000'), 100000);
  assert.equal(toPaise('500.25'), 50025);
});

test('transaction amount validation rejects invalid precision and unsafe paise values', () => {
  assert.equal(normalizeRupeeAmount('0'), null);
  assert.equal(normalizeRupeeAmount('-1'), null);
  assert.equal(normalizeRupeeAmount('1.234'), null);
  assert.equal(normalizeRupeeAmount('1e3'), null);
  assert.equal(normalizeRupeeAmount('90071992547409.92'), null);
  assert.equal(toPaise('1.234'), 0);
});

test('Razorpay per-order amount-limit errors return an actionable response', () => {
  const response = getRazorpayOrderFailureResponse('Amount exceeds maximum amount allowed.');
  assert.equal(response.status, 422);
  assert.match(response.message, /account limit/i);
  assert.match(response.message, /Razorpay support/i);
});

test('Razorpay SDK error details preserve safe provider diagnostics', () => {
  assert.deepEqual(
    getRazorpayErrorDetails({
      statusCode: 400,
      error: {
        code: 'BAD_REQUEST_ERROR',
        description: 'Amount exceeds maximum amount allowed.',
        source: 'business',
        field: 'amount',
        reason: 'input_validation_failed',
        metadata: { privateValue: 'must not be returned' },
      },
      config: { auth: { username: 'secret-key' } },
    }),
    {
      httpStatus: 400,
      code: 'BAD_REQUEST_ERROR',
      description: 'Amount exceeds maximum amount allowed.',
      source: 'business',
      field: 'amount',
      reason: 'input_validation_failed',
    },
  );
});

test('other Razorpay order failures keep their existing response behavior', () => {
  assert.deepEqual(
    getRazorpayOrderFailureResponse('Unable to create payment order'),
    { status: 502, message: 'Unable to create payment order' },
  );
  assert.deepEqual(
    getRazorpayOrderFailureResponse('Unexpected provider failure'),
    { status: 502, message: 'Unable to initialize payment. Please try again.' },
  );
});

const createResponse = () => ({
  statusCode: 200,
  headers: {},
  body: null,
  set(name, value) {
    this.headers[name] = value;
    return this;
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const createTestTransaction = (riskLevel, overrides = {}) => ({
  _id: { toString: () => `transaction-${riskLevel.toLowerCase()}` },
  amount: 1000.25,
  currency: 'INR',
  riskLevel,
  status: 'AWAITING_PAYMENT',
  emailVerificationStatus: 'APPROVED',
  adminApprovalStatus: riskLevel === 'HIGH' ? 'APPROVED' : 'NOT_REQUIRED',
  approvalStatus: riskLevel === 'HIGH' ? 'APPROVED' : 'NOT_REQUIRED',
  paymentOrderId: '',
  paymentStatus: 'PENDING',
  save: async function save() { this.saved = true; },
  ...overrides,
});

const setAndRestore = (target, key, value, testContext) => {
  const original = target[key];
  target[key] = value;
  testContext.after(() => {
    target[key] = original;
  });
};

const configurePaymentMocks = (testContext, state) => {
  const previousKeyId = process.env.RAZORPAY_KEY_ID;
  const previousKeySecret = process.env.RAZORPAY_KEY_SECRET;
  process.env.RAZORPAY_KEY_ID = 'rzp_test_mock';
  process.env.RAZORPAY_KEY_SECRET = 'mock-secret';
  testContext.after(() => {
    if (previousKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = previousKeyId;
    if (previousKeySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = previousKeySecret;
  });

  setAndRestore(Transaction, 'findOne', async (query) => {
    state.query = query;
    return state.transaction;
  }, testContext);
  setAndRestore(User, 'findById', () => ({
    select: async () => ({ name: 'Test User', email: 'test@example.invalid', phone: '' }),
    lean: async () => ({ _id: 'user-id', email: 'test@example.invalid' }),
  }), testContext);
  setAndRestore(Razorpay.prototype, 'addResources', function addResources() {
    this.orders = {
      fetch: async () => {
        if (state.fetchError) throw state.fetchError;
        return state.existingOrder;
      },
      create: async (payload) => {
        state.orderPayloads.push(payload);
        if (state.orderError) throw state.orderError;
        return { id: 'order_mock_123', amount: payload.amount, currency: payload.currency, status: 'created' };
      },
    };
    this.payments = {
      fetch: async () => {
        if (state.paymentError) throw state.paymentError;
        return state.payment;
      },
    };
  }, testContext);
  setAndRestore(console, 'info', (...args) => state.logs.push(args), testContext);
  setAndRestore(console, 'warn', () => {}, testContext);
  setAndRestore(console, 'error', (...args) => state.logs.push(args), testContext);
};

const createPaymentState = (transaction) => ({
  transaction,
  orderPayloads: [],
  logs: [],
  existingOrder: null,
  fetchError: null,
  orderError: null,
  payment: null,
  paymentError: null,
  query: null,
});

const invokeCreateOrder = (transactionId, response = createResponse()) => createRazorpayOrder({
  params: { transactionId },
  user: { id: 'user-id' },
}, response).then(() => response);

test('LOW, MEDIUM and approved HIGH orders use one INR paise payload and return the provider order', async (t) => {
  const state = createPaymentState(null);
  configurePaymentMocks(t, state);

  for (const riskLevel of ['LOW', 'MEDIUM', 'HIGH']) {
    state.transaction = createTestTransaction(riskLevel);
    state.orderPayloads.length = 0;
    const response = await invokeCreateOrder(`transaction-${riskLevel.toLowerCase()}`);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.order.id, 'order_mock_123');
    assert.equal(response.body.order.amount, 100025);
    assert.equal(response.body.order.currency, 'INR');
    assert.equal(state.orderPayloads.length, 1);
    assert.equal(state.orderPayloads[0].amount, 100025);
    assert.equal(state.orderPayloads[0].currency, 'INR');
    assert.equal(typeof state.orderPayloads[0].amount, 'number');
    assert.equal(Number.isSafeInteger(state.orderPayloads[0].amount), true);
    assert.equal(state.transaction.paymentOrderId, 'order_mock_123');
  }
});

test('order creation rejects unverified users and HIGH transactions without both approval records', async (t) => {
  const state = createPaymentState(null);
  configurePaymentMocks(t, state);

  for (const riskLevel of ['LOW', 'MEDIUM', 'HIGH']) {
    state.transaction = createTestTransaction(riskLevel, { emailVerificationStatus: 'PENDING' });
    const response = await invokeCreateOrder(`transaction-${riskLevel.toLowerCase()}`);
    assert.equal(response.statusCode, 403);
  }

  state.transaction = createTestTransaction('HIGH', { adminApprovalStatus: 'PENDING', approvalStatus: 'APPROVED' });
  const unapproved = await invokeCreateOrder('transaction-high');
  assert.equal(unapproved.statusCode, 403);
  assert.match(unapproved.body.message, /administrator approval/i);
  assert.equal(state.orderPayloads.length, 0);
});

test('order creation scopes lookup to the authenticated owner', async (t) => {
  const state = createPaymentState(null);
  configurePaymentMocks(t, state);
  state.transaction = null;
  const response = await invokeCreateOrder('transaction-not-owned');
  assert.equal(response.statusCode, 404);
  assert.deepEqual(state.query, { _id: 'transaction-not-owned', sender: 'user-id' });
  assert.equal(state.orderPayloads.length, 0);
});

test('order creation does not create a duplicate when the existing provider order cannot be checked', async (t) => {
  const transaction = createTestTransaction('MEDIUM', { paymentOrderId: 'order_existing' });
  const state = createPaymentState(transaction);
  configurePaymentMocks(t, state);
  state.fetchError = { code: 'ETIMEDOUT' };
  const response = await invokeCreateOrder('transaction-medium');
  assert.equal(response.statusCode, 503);
  assert.match(response.body.message, /do not submit another payment/i);
  assert.equal(state.orderPayloads.length, 0);
});

test('order creation replaces only an existing order confirmed missing by Razorpay', async (t) => {
  const transaction = createTestTransaction('LOW', { paymentOrderId: 'order_missing' });
  const state = createPaymentState(transaction);
  configurePaymentMocks(t, state);
  state.fetchError = { statusCode: 404, error: { code: 'NOT_FOUND_ERROR', description: 'Order not found' } };
  const response = await invokeCreateOrder('transaction-low');
  assert.equal(response.statusCode, 200);
  assert.equal(state.orderPayloads.length, 1);
});

test('invalid authoritative amount and currency are rejected before calling Razorpay', async (t) => {
  const state = createPaymentState(createTestTransaction('LOW', { amount: 0 }));
  configurePaymentMocks(t, state);
  const invalidAmount = await invokeCreateOrder('transaction-low');
  assert.equal(invalidAmount.statusCode, 400);
  assert.equal(state.orderPayloads.length, 0);

  state.transaction = createTestTransaction('LOW', { currency: 'USD' });
  const invalidCurrency = await invokeCreateOrder('transaction-low');
  assert.equal(invalidCurrency.statusCode, 400);
  assert.equal(state.orderPayloads.length, 0);
});

test('provider amount-limit rejection preserves provider status internally and is not reported as a gateway failure', async (t) => {
  const state = createPaymentState(createTestTransaction('MEDIUM'));
  configurePaymentMocks(t, state);
  state.orderError = {
    statusCode: 400,
    code: 'BAD_REQUEST_ERROR',
    error: { code: 'BAD_REQUEST_ERROR', description: 'Amount exceeds maximum amount allowed.' },
  };
  const response = await invokeCreateOrder('transaction-medium');

  assert.equal(response.statusCode, 422);
  assert.equal(response.body.success, false);
  assert.match(response.body.message, /account limit/i);
  assert.equal(state.orderPayloads[0].amount, 100025);
  const failureLog = state.logs.find(([event]) => event === '[razorpay] order_create_failed');
  assert.equal(failureLog[1].providerHttpStatus, 400);
  assert.equal(failureLog[1].providerErrorCode, 'BAD_REQUEST_ERROR');
  assert.equal(failureLog[1].amountInRupees, 1000.25);
  assert.equal(failureLog[1].amountInPaise, 100025);
  assert.equal(failureLog[1].environment, 'test');
  assert.equal(JSON.stringify(failureLog).includes('mock-secret'), false);
});

test('order creation timeouts do not claim that Razorpay did not create an order', async (t) => {
  const state = createPaymentState(createTestTransaction('LOW'));
  configurePaymentMocks(t, state);
  state.orderError = { code: 'ECONNABORTED' };
  const response = await invokeCreateOrder('transaction-low');
  assert.equal(response.statusCode, 504);
  assert.match(response.body.message, /did not confirm whether the order was created/i);
});

test('Razorpay signature validation accepts only the expected fixed-length HMAC', () => {
  const signature = require('node:crypto')
    .createHmac('sha256', 'mock-secret')
    .update('order_mock_123|pay_mock_123')
    .digest('hex');
  assert.equal(isRazorpaySignatureValid('order_mock_123', 'pay_mock_123', signature, 'mock-secret'), true);
  assert.equal(isRazorpaySignatureValid('order_mock_123', 'pay_mock_123', 'invalid', 'mock-secret'), false);
  assert.equal(isRazorpaySignatureValid('order_mock_123', 'pay_mock_123', `${signature}00`, 'mock-secret'), false);
});

test('payment is not marked paid when Razorpay payment lookup fails', async (t) => {
  const transaction = createTestTransaction('MEDIUM', { paymentOrderId: 'order_mock_123' });
  const state = createPaymentState(transaction);
  configurePaymentMocks(t, state);
  state.paymentError = { statusCode: 503, error: { code: 'SERVER_ERROR', description: 'Provider temporarily unavailable' } };
  const signature = require('node:crypto')
    .createHmac('sha256', 'mock-secret')
    .update('order_mock_123|pay_mock_123')
    .digest('hex');
  const response = await verifyRazorpayPayment({
    params: { transactionId: 'transaction-medium' },
    user: { id: 'user-id', email: 'test@example.invalid' },
    body: { razorpay_order_id: 'order_mock_123', razorpay_payment_id: 'pay_mock_123', razorpay_signature: signature },
  }, createResponse());

  assert.equal(response.statusCode, 503);
  assert.equal(transaction.paymentStatus, 'PENDING');
  assert.notEqual(transaction.status, 'COMPLETED');
  assert.equal(transaction.saved, undefined);
});

test('captured payments must match the provider order, payment ID, amount and currency before completion', async (t) => {
  const transaction = createTestTransaction('HIGH', { paymentOrderId: 'order_mock_123' });
  const state = createPaymentState(transaction);
  configurePaymentMocks(t, state);
  state.payment = {
    id: 'pay_mock_123',
    order_id: 'order_mock_123',
    amount: 100025,
    currency: 'INR',
    status: 'captured',
  };

  setAndRestore(Alert, 'create', async () => ({ save: async () => {} }), t);
  setAndRestore(AuditLog, 'create', async () => ({}), t);
  const signature = require('node:crypto')
    .createHmac('sha256', 'mock-secret')
    .update('order_mock_123|pay_mock_123')
    .digest('hex');
  const response = await verifyRazorpayPayment({
    params: { transactionId: 'transaction-high' },
    user: { id: 'user-id', email: 'test@example.invalid' },
    ip: '127.0.0.1',
    body: { razorpay_order_id: 'order_mock_123', razorpay_payment_id: 'pay_mock_123', razorpay_signature: signature },
  }, createResponse());

  assert.equal(response.statusCode, 200);
  assert.equal(transaction.paymentStatus, 'PAID');
  assert.equal(transaction.status, 'COMPLETED');
  assert.equal(transaction.paymentId, 'pay_mock_123');
});

test('mismatched payment amount cannot complete a transaction', async (t) => {
  const transaction = createTestTransaction('LOW', { paymentOrderId: 'order_mock_123' });
  const state = createPaymentState(transaction);
  configurePaymentMocks(t, state);
  state.payment = { id: 'pay_mock_123', order_id: 'order_mock_123', amount: 1, currency: 'INR', status: 'captured' };
  const signature = require('node:crypto')
    .createHmac('sha256', 'mock-secret')
    .update('order_mock_123|pay_mock_123')
    .digest('hex');
  const response = await verifyRazorpayPayment({
    params: { transactionId: 'transaction-low' },
    user: { id: 'user-id', email: 'test@example.invalid' },
    body: { razorpay_order_id: 'order_mock_123', razorpay_payment_id: 'pay_mock_123', razorpay_signature: signature },
  }, createResponse());

  assert.equal(response.statusCode, 400);
  assert.equal(transaction.paymentStatus, 'PENDING');
  assert.notEqual(transaction.status, 'COMPLETED');
  assert.equal(transaction.saved, undefined);
});
