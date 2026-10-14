import { useEffect, useRef, useState } from 'react';
import api from '../../api/axios';
import Sidebar from '../../components/Sidebar';
import Topbar from '../../components/Topbar';
import { formatDateTime, maskAccount, toCurrency } from '../../utils/formatters';

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

const canPayTransaction = (tx) => {
  if (!tx) return false;
  const normalizedStatus = normalizeTransactionStatus(tx.status);
  if (['REJECTED', 'BLOCKED', 'COMPLETED', 'FAILED'].includes(normalizedStatus)) return false;
  if (tx.emailVerificationStatus === 'REJECTED') return false;

  const adminApproved = tx.adminApprovalStatus === 'APPROVED' && tx.approvalStatus === 'APPROVED';
  const paymentStatusIsEligible = isPaymentStatusEligible(normalizedStatus);

  if (tx.riskLevel === 'LOW' || tx.riskLevel === 'MEDIUM') {
    return tx.emailVerificationStatus === 'APPROVED' && paymentStatusIsEligible;
  }

  if (tx.riskLevel === 'HIGH') {
    return tx.emailVerificationStatus === 'APPROVED' && adminApproved && paymentStatusIsEligible;
  }

  return false;
};

const loadRazorpayScript = () => new Promise((resolve) => {
  if (window.Razorpay) {
    resolve(true);
    return;
  }

  const script = document.createElement('script');
  script.src = 'https://checkout.razorpay.com/v1/checkout.js';
  script.onload = () => resolve(true);
  script.onerror = () => resolve(false);
  document.body.appendChild(script);
});

export default function UserTransactions() {
  const [transactions, setTransactions] = useState([]);
  const [form, setForm] = useState({ recipientName: '', recipientBankName: '', recipientAccount: '', amount: '', purpose: '' });
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const payingRef = useRef(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchTransactions = async () => {
    try {
      const res = await api.get('/user/transactions');
      setTransactions(res.data.transactions || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to fetch transaction history.');
    } finally {
      setLoading(false);
    }
  };

  const openRazorpayCheckout = async (transactionId) => {
    if (payingRef.current) return;
    payingRef.current = true;
    setPaying(true);
    setError('');
    setSuccess('');

    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        setError('Unable to initialize payment. Please try again.');
        payingRef.current = false;
        setPaying(false);
        return;
      }

      const orderRes = await api.post(`/user/transactions/${transactionId}/create-order`);
      if (!orderRes.data?.success && orderRes.data?.message) {
        setError(orderRes.data.message);
        payingRef.current = false;
        setPaying(false);
        return;
      }

      const { order, orderId, keyId, amount, currency, prefill } = orderRes.data;
      const resolvedOrderId = orderId || order?.id;
      const resolvedAmount = Number(order?.amount || amount);
      const resolvedCurrency = (order?.currency || currency || 'INR').toUpperCase();

      if (!keyId || !resolvedOrderId || !resolvedAmount || resolvedCurrency !== 'INR') {
        setError(orderRes.data?.message || 'Unable to initialize payment. Please try again.');
        payingRef.current = false;
        setPaying(false);
        return;
      }

      const razorpay = new window.Razorpay({
        key: keyId,
        amount: resolvedAmount,
        currency: 'INR',
        name: 'TrustFlow',
        description: 'INR domestic Test Mode payment',
        order_id: resolvedOrderId,
        timeout: 300,
        retry: { enabled: false },
        remember_customer: false,
        notes: {
          transactionId: String(transactionId),
        },
        prefill: {
          name: prefill?.name || 'TrustFlow User',
          email: prefill?.email || '',
          contact: prefill?.contact || '',
        },
        method: {
          netbanking: true,
          card: true,
          upi: true,
          wallet: true,
          emi: false,
          cardless_emi: false,
          paylater: false,
        },
        config: {
          display: {
            hide: [{ method: 'emi' }, { method: 'international' }],
            preferences: { show_default_blocks: true },
          },
        },
        theme: {
          color: '#2f6fed',
        },
        handler: async function (response) {
          try {
            const verifyRes = await api.post(`/user/transactions/${transactionId}/verify-payment`, {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            setSuccess(verifyRes.data.message || 'Payment successful. Transaction completed.');
            await fetchTransactions();
          } catch (verifyErr) {
            setError(verifyErr.response?.data?.message || 'Payment verification failed. Please contact support or try again.');
          } finally {
            payingRef.current = false;
            setPaying(false);
          }
        },
        modal: {
          ondismiss: function () {
            payingRef.current = false;
            setPaying(false);
            setError('Payment was cancelled. No payment was charged.');
          },
        },
      });

      razorpay.on('payment.failed', function (response) {
        const failureCode = response.error?.code || '';
        const failureReason = response.error?.description || response.error?.reason || 'Payment failed. Please try again.';
        setError(failureCode === 'BAD_REQUEST_ERROR' && /international/i.test(failureReason)
          ? 'This card is treated as international. Use Razorpay domestic Test Mode card 5267 3181 8797 5449, any future expiry, and any 3-digit CVV. Do not use 4111 1111 1111 1111.'
          : (failureReason || 'Payment failed. Please try again.'));
        api.post(`/user/transactions/${transactionId}/payment-failed`, {
          code: failureCode,
          description: failureReason,
          reason: response.error?.reason || '',
          order_id: response.error?.metadata?.order_id || resolvedOrderId,
          payment_id: response.error?.metadata?.payment_id || '',
        }).catch(() => {});
        payingRef.current = false;
        setPaying(false);
      });

      razorpay.open();
    } catch (err) {
      const backendMessage = err.response?.data?.message || err.message || 'Unable to initialize payment. Please try again.';
      setError(backendMessage);
      payingRef.current = false;
      setPaying(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const submitTransaction = async (e) => {
    e.preventDefault();
    if (payingRef.current) return;
    setError('');
    setSuccess('');

    const amountInput = String(form.amount).trim();
    const numericAmount = Number(amountInput);
    const amountInPaise = numericAmount * 100;
    if (
      !/^\d+(?:\.\d{1,2})?$/.test(amountInput)
      || !Number.isFinite(numericAmount)
      || numericAmount <= 0
      || !Number.isSafeInteger(amountInPaise)
    ) {
      setError('Transaction amount must be a positive INR amount with no more than two decimal places.');
      return;
    }

    try {
      const res = await api.post('/user/transactions', form);
      setSuccess(res.data.message);
      setForm({ recipientName: '', recipientBankName: '', recipientAccount: '', amount: '', purpose: '' });
      await fetchTransactions();

      if (res.data.requiresPayment && res.data.transactionId && res.data.status !== 'AWAITING_EMAIL_VERIFICATION') {
        await openRazorpayCheckout(res.data.transactionId);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Transaction could not be processed.');
    }
  };

  return (
    <div className="app-shell">
      <Sidebar role="USER" />
      <main className="content-area">
        <Topbar title="Start Transaction" subtitle="AML risk screening before payment proceeds" />
        <div className="panel full-width">
          <h3>+ Add New Transaction</h3>
          <form className="transaction-form" onSubmit={submitTransaction}>
            <div className="field-group"><label>Recipient Name</label><input value={form.recipientName} onChange={(e) => setForm({ ...form, recipientName: e.target.value })} /></div>
            <div className="field-group"><label>Recipient Bank Name</label><input value={form.recipientBankName} onChange={(e) => setForm({ ...form, recipientBankName: e.target.value })} /></div>
            <div className="field-group"><label>Recipient Bank Account Number</label><input value={form.recipientAccount} onChange={(e) => setForm({ ...form, recipientAccount: e.target.value })} /></div>
            <div className="field-group"><label>Amount</label><input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div className="field-group"><label>Purpose</label><input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></div>
            <button className="btn primary" type="submit" disabled={paying}>{paying ? 'Processing payment...' : 'Proceed'}</button>
          </form>
          <p className="helper-text">
            Razorpay Test Mode uses INR domestic payments only. In Checkout, prefer Card or UPI.
            Domestic test card: Mastercard 5267 3181 8797 5449, any future expiry, any 3-digit CVV.
            Do not use 4111 1111 1111 1111 (Razorpay treats it as international). UPI success ID: success@razorpay.
          </p>
          {error && <div className="alert error">{error}</div>}
          {success && <div className="alert success">{success}</div>}
        </div>

        <div className="panel full-width">
          <h3>Transaction History</h3>
          {loading ? <div>Loading...</div> : (
            <table>
              <thead>
                <tr><th>ID</th><th>Sender</th><th>Recipient</th><th>Bank</th><th>Amount</th><th>Status</th><th>Risk</th><th>Date</th><th>Action</th></tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx._id}>
                    <td>{tx._id.slice(0, 10)}</td>
                    <td>{maskAccount(tx.senderAccountNumber)}</td>
                    <td>{tx.recipientName}</td>
                    <td>{tx.recipientBankName || 'N/A'}</td>
                    <td>{toCurrency(tx.amount)}</td>
                    <td>{tx.status}</td>
                    <td><span className={`badge ${tx.riskLevel?.toLowerCase()}`}>{tx.riskLevel}</span></td>
                    <td>{formatDateTime(tx.createdAt)}</td>
                    <td>
                      {canPayTransaction(tx) ? (
                        <button className="btn small" type="button" disabled={paying} onClick={() => openRazorpayCheckout(tx._id)}>
                          Make Payment
                        </button>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
