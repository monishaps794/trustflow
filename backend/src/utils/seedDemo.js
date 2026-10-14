require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Transaction = require('../models/Transaction');
const LoginAttempt = require('../models/LoginAttempt');
const Alert = require('../models/Alert');
const ApprovalRequest = require('../models/ApprovalRequest');
const AuditLog = require('../models/AuditLog');
const Session = require('../models/Session');

const resetData = async () => {
  await User.deleteMany({});
  await Admin.deleteMany({});
  await Transaction.deleteMany({});
  await LoginAttempt.deleteMany({});
  await Alert.deleteMany({});
  await ApprovalRequest.deleteMany({});
  await AuditLog.deleteMany({});
  await Session.deleteMany({});
};

const userSeedList = [
  {
    name: 'Chaithra',
    email: 'chaithrakeshav03@gmail.com',
    phone: '6360362859',
    accountType: 'Savings',
    accountNumber: '100000123456',
    accountHolderType: 'Individual',
    address: '#4, 4th A Main B Cross Kalyana Nagar, Moodalapalya, Bangalore - 560072',
  },
  {
    name: 'Monisha PS',
    email: 'monishaps794@gmail.com',
    phone: '9972045096',
    accountType: 'Savings',
    accountNumber: '987654321098',
    accountHolderType: 'Business',
    address: 'Indsberg Serenity Apartment, Malathalli, Bangalore - 560056',
  },
  {
    name: 'Rashmi Ventakesha Shetty',
    email: 'rashmi.shetty8979@gmail.com',
    phone: '6363694987',
    accountType: 'Current',
    accountNumber: '110011001100',
    accountHolderType: 'Joint',
    address: '18, Lake View Street, Whitefield, Bengaluru, Karnataka - 560066',
  },
  {
    name: 'Kavyashree Ganapati Bhat',
    email: 'kavyabhat2005@gmail.com',
    phone: '9448424660',
    accountType: 'Current',
    accountNumber: '555566667777',
    accountHolderType: 'Individual',
    address: '27, MG Layout, Jayanagar, Bengaluru, Karnataka - 560041',
  },
];

const adminSeed = { name: 'System Admin', email: 'trustflowadmin@gmail.com', role: 'ADMIN', mfaEnabled: true };

const runSeed = async () => {
  try {
    await connectDB();
    await resetData();

    const admin = await Admin.create(adminSeed);

    const users = await Promise.all(
      userSeedList.map((user) =>
        User.create({
          ...user,
          accountStatus: 'ACTIVE',
          securityStatus: 'SECURE',
          securityScore: 0,
          riskLevel: 'LOW',
          mfaEnabled: true,
          failedLoginAttempts: 0,
          transactionRiskThresholds: {
            lowLimit: user.accountNumber === '100000123456' ? 100000 : user.accountNumber === '987654321098' ? 500000 : user.accountNumber === '110011001100' ? 75000 : 50000,
            mediumLimit: user.accountNumber === '100000123456' ? 350000 : user.accountNumber === '987654321098' ? 1000000 : user.accountNumber === '110011001100' ? 150000 : 75000,
            highLimit: user.accountNumber === '100000123456' ? 350000 : user.accountNumber === '987654321098' ? 1000000 : user.accountNumber === '110011001100' ? 500000 : 100000,
            boundaryNote: user.accountNumber === '100000123456'
              ? 'Chaithra: <= ₹1,00,000 LOW, > ₹1,00,000 and <= ₹3,50,000 MEDIUM, > ₹3,50,000 HIGH.'
              : user.accountNumber === '987654321098'
                ? 'Monisha: <= ₹5,00,000 LOW, > ₹5,00,000 and <= ₹10,00,000 MEDIUM, above ₹10,00,000 HIGH.'
                : user.accountNumber === '110011001100'
                  ? 'Rashmi: <= ₹75,000 LOW, > ₹75,000 and <= ₹1,50,000 MEDIUM, > ₹1,50,000 and <= ₹5,00,000 MEDIUM, above ₹5,00,000 HIGH.'
                  : 'Kavyashree: <= ₹50,000 LOW, > ₹50,000 and <= ₹75,000 MEDIUM, > ₹1,00,000 HIGH.',
          },
          notificationPreferences: { securityNotifications: true, transactionNotifications: true, loginNotifications: true },
          securityPreferences: { otpVerification: true, loginAlerts: true, transactionAlerts: true },
        })
      )
    );

    console.log('Demo data reset complete.');
    console.log('Admin:', admin.email);
    users.forEach((user) => console.log(`${user.name} <${user.email}> ${user.accountNumber}`));
    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error.message);
    process.exit(1);
  }
};

runSeed();
