const express = require("express");
const router = express.Router();
const Transaction = require("../models/Transaction");
const DenominationHistory = require("../models/DenominationHistory");
const WithdrawTransaction = require("../models/WithdrawTransaction");
const Company = require("../models/Company");
const BankAccount = require("../models/BankAccount");
const Customer = require("../models/Customer");
const Denomination = require("../models/Denomination");
const { auth, checkPermission } = require("../middleware/auth");
const RoleAssignment = require("../models/RoleAssignment");

// Helper to get allowed companies for a user
const getAllowedCompanyIds = async (user) => {
  if (!user) return [];
  const userId = user.id || user._id;
  if (!userId) {
    console.error("getAllowedCompanyIds: No user ID found in user object:", user);
    return [];
  }

  // If Super Admin, find all their companies
  if (user.role === 'super-admin') {
    const ownedCompanies = await Company.find({ userId: userId });
    return ownedCompanies.map(c => c._id.toString());
  }

  // 1. Find companies owned by user (just in case they have companies)
  const ownedCompanies = await Company.find({ userId: userId });
  const ownedCompanyIds = ownedCompanies.map(c => c._id.toString());

  // 2. Find companies where user is assigned a role (allow user role for basic viewing)
  const email = user.email || "";
  const assignments = await RoleAssignment.find({ email: email });
  const assignedCompanyIds = assignments
    .filter(a => a.permissions.includes('report_view') || a.role === 'user')
    .map(a => a.company_id.toString());

  return [...new Set([...ownedCompanyIds, ...assignedCompanyIds])];
};

// @route   GET api/reports/daily
// @desc    Daily Transaction Report
router.get("/daily", auth, async (req, res) => {
  try {
    console.log("DAILY REPORT: Starting request for user:", req.user.email);
    const { startDate, endDate, companyId } = req.query;
    
    const allCompanyIds = await getAllowedCompanyIds(req.user);
    console.log("DAILY REPORT: Allowed company IDs:", allCompanyIds);

    let query = { company_id: { $in: allCompanyIds } };
    
    if (startDate && endDate) {
      console.log("DAILY REPORT: Filtering by date:", startDate, "to", endDate);
      query.transaction_date = { 
        $gte: new Date(startDate), 
        $lte: new Date(endDate) 
      };
    }
    
    if (companyId && companyId !== "undefined" && companyId !== "null") {
      if (!allCompanyIds.includes(companyId.toString())) {
        console.log("DAILY REPORT: Access denied to companyId:", companyId);
        return res.status(403).json({ message: "Access denied to this company's report" });
      }
      query.company_id = companyId;
    }

    console.log("DAILY REPORT: Bank Transaction query:", JSON.stringify(query));
    // Get Bank Transactions
    const transactions = await Transaction.find(query)
      .populate("company_id", "name")
      .populate("customer_id", "customer_name")
      .sort({ transaction_date: -1 });

    console.log(`DAILY REPORT: Found ${transactions.length} bank transactions`);

    // Get Withdraw Transactions (also need to adjust this to include assigned companies)
    let withdrawQuery = { company_id: { $in: allCompanyIds } };
    if (startDate && endDate) {
      withdrawQuery.transaction_date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    if (companyId && companyId !== "undefined" && companyId !== "null") withdrawQuery.company_id = companyId;
    
    console.log("DAILY REPORT: Withdraw Transaction query:", JSON.stringify(withdrawQuery));
    const withdrawTransactions = await WithdrawTransaction.find(withdrawQuery);
    console.log(`DAILY REPORT: Found ${withdrawTransactions.length} withdraw transactions`);

    // Format for unified table (Bank Transactions Only)
    let formattedTransactions = [];
    try {
      formattedTransactions = transactions
        .filter(t => t.company_id) // Ensure company_id exists
        .map(t => ({
          id: t._id,
          date: t.transaction_date,
          transactionId: t._id.toString().slice(-8).toUpperCase(),
          companyName: t.company_id?.name || "N/A",
          bankName: t.company_bank_name || "N/A",
          type: "Bank Transfer",
          amount: t.transfer_amount,
          status: t.status,
          isCash: false
        }));
      console.log(`DAILY REPORT: Formatted ${formattedTransactions.length} bank transactions`);
    } catch (err) {
      console.error("DAILY REPORT: Error formatting transactions:", err);
      throw err;
    }

    // The user wants ONLY bank transactions in this report now
    // So we skip adding formattedCash

    let totalTransactions = 0;
    let totalDeposit = 0;
    let totalWithdraw = 0;

    try {
      totalTransactions = formattedTransactions.length;
      totalDeposit = formattedTransactions
        .filter(t => t.type === "Bank Transfer")
        .reduce((sum, t) => sum + (t.amount || 0), 0);
      totalWithdraw = withdrawTransactions.reduce((sum, w) => sum + (w.withdraw_amount || 0), 0);
      console.log(`DAILY REPORT: Calculated summary - totalTransactions: ${totalTransactions}, totalDeposit: ${totalDeposit}, totalWithdraw: ${totalWithdraw}`);
    } catch (err) {
      console.error("DAILY REPORT: Error calculating totals:", err);
      throw err;
    }

    res.json({
      summary: {
        totalTransactions,
        totalDeposit,
        totalWithdraw
      },
      data: formattedTransactions
    });
  } catch (err) {
    console.error("GET /api/reports/daily ERROR:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// @route   GET api/reports/denomination
// @desc    Denomination Report
router.get("/denomination", auth, async (req, res) => {
  try {
    const { startDate, endDate, companyId } = req.query;
    
    const allCompanyIds = await getAllowedCompanyIds(req.user);

    let query = { 
      companyId: { $in: allCompanyIds }
    };

    if (startDate && endDate) {
      query.date = { 
        $gte: new Date(startDate), 
        $lte: new Date(endDate) 
      };
    }

    if (companyId && companyId !== "undefined" && companyId !== "null") {
      if (!allCompanyIds.includes(companyId.toString())) {
        return res.status(403).json({ message: "Access denied to this company's report" });
      }
      query.companyId = companyId;
    }

    const history = await DenominationHistory.find(query)
      .populate("companyId", "name")
      .sort({ date: -1 });

    // Aggregate counts for denominations (DEPOSIT adds, WITHDRAW subtracts)
    const denominations = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
    const reportData = denominations.map(d => ({
      denomination: d,
      count: 0,
      totalAmount: 0
    }));

    history.forEach(record => {
      const multiplier = record.type === "WITHDRAW" ? -1 : 1;
      denominations.forEach((d, index) => {
        const count = (record.denominations && record.denominations[d]) || 0;
        reportData[index].count += count * multiplier;
        reportData[index].totalAmount += count * d * multiplier;
      });
    });

    // Calculate separate deposit/withdraw totals for summary
    const deposits = history.filter(h => h.type === "DEPOSIT");
    const withdraws = history.filter(h => h.type === "WITHDRAW");
    const totalDeposit = deposits.reduce((sum, h) => sum + h.totalAmount, 0);
    const totalWithdraw = withdraws.reduce((sum, h) => sum + h.totalAmount, 0);
    const netAmount = totalDeposit - totalWithdraw;

    res.json({
      summary: {
        totalAmount: netAmount,
        totalDeposit,
        totalWithdraw,
        totalRecords: history.length
      },
      data: reportData,
      history: history.map(h => ({
        id: h._id,
        date: h.date,
        companyName: h.companyId?.name || "N/A",
        type: h.type,
        totalAmount: h.totalAmount,
        remarks: h.remarks
      }))
    });
  } catch (err) {
    console.error("GET /api/reports/denomination ERROR:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// @route   GET api/reports/company
// @desc    Company-wise Report
router.get("/company", auth, async (req, res) => {
  try {
    const { startDate, endDate, companyId } = req.query;
    
    const allCompanyIds = await getAllowedCompanyIds(req.user);

    const userCompanies = await Company.find({ 
      _id: { $in: allCompanyIds },
      ...(companyId && companyId !== "undefined" && companyId !== "null" ? { _id: companyId } : {})
    });

    const reportData = await Promise.all(userCompanies.map(async (company) => {
      let query = { company_id: company._id };
      if (startDate && endDate) {
        query.transaction_date = { $gte: new Date(startDate), $lte: new Date(endDate) };
      }

      const transactions = await Transaction.find(query);
      
      let cashQuery = { 
        companyId: company._id 
      };
      if (startDate && endDate) {
        cashQuery.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
      }
      const cashHistory = await DenominationHistory.find(cashQuery);
      
      // Get withdraw transactions for this company
      let wQuery = { company_id: company._id };
      if (startDate && endDate) wQuery.transaction_date = { $gte: new Date(startDate), $lte: new Date(endDate) };
      const companyWithdraws = await WithdrawTransaction.find(wQuery);

      const totalBankDeposit = transactions.reduce((sum, t) => sum + t.transfer_amount, 0);
      
      const totalDeposit = totalBankDeposit;
      const totalWithdraw = companyWithdraws.reduce((sum, w) => sum + w.withdraw_amount, 0);
      
      return {
        companyId: company._id,
        companyName: company.name,
        totalDeposit,
        totalWithdraw,
        netBalance: totalDeposit - totalWithdraw,
        totalTransactions: transactions.length
      };
    }));

    res.json({
      summary: {
        totalCompanies: reportData.length,
        totalDeposit: reportData.reduce((sum, c) => sum + c.totalDeposit, 0),
        totalWithdraw: reportData.reduce((sum, c) => sum + c.totalWithdraw, 0),
        totalNetBalance: reportData.reduce((sum, c) => sum + c.netBalance, 0)
      },
      data: reportData
    });
  } catch (err) {
    console.error("GET /api/reports/company ERROR:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// @route   GET api/reports/bank
// @desc    Bank-wise Report
router.get("/bank", auth, async (req, res) => {
  try {
    const { startDate, endDate, bankName } = req.query;
    
    const allCompanyIds = await getAllowedCompanyIds(req.user);

    // Get all unique bank accounts for user's companies
    const bankAccounts = await BankAccount.find({ 
      company_id: { $in: allCompanyIds },
      ...(bankName ? { bank_name: bankName } : {})
    }).populate("company_id", "name");

    const reportData = await Promise.all(bankAccounts
      .filter(account => account.company_id) // Ensure company_id exists
      .map(async (account) => {
      let query = { 
        company_id: account.company_id._id,
        company_bank_account_id: account.account_number
      };
      
      if (startDate && endDate) {
        query.transaction_date = { $gte: new Date(startDate), $lte: new Date(endDate) };
      }

      const transactions = await Transaction.find(query);
      
      const totalDeposit = transactions.reduce((sum, t) => sum + t.transfer_amount, 0);

      // Get withdraw transactions for this bank account
      let bwQuery = { bank_account_id: account._id };
      if (startDate && endDate) bwQuery.transaction_date = { $gte: new Date(startDate), $lte: new Date(endDate) };
      const bankWithdraws = await WithdrawTransaction.find(bwQuery);
      const totalWithdraw = bankWithdraws.reduce((sum, w) => sum + w.withdraw_amount, 0);

      return {
        bankName: account.bank_name,
        accountNumber: account.account_number,
        companyName: account.company_id.name,
        totalDeposit,
        totalWithdraw,
        availableBalance: account.current_balance ?? (totalDeposit + totalWithdraw),
        transactionCount: transactions.length
      };
    }));

    res.json({
      summary: {
        totalBanks: reportData.length,
        totalBalance: reportData.reduce((sum, b) => sum + b.availableBalance, 0)
      },
      data: reportData
    });
  } catch (err) {
    console.error("GET /api/reports/bank ERROR:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// @route   GET api/reports/dashboard
// @desc    Consolidated Dashboard Stats
router.get("/dashboard", auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const allCompanyIds = await getAllowedCompanyIds(req.user);

    // 1. Transaction Stats (Bank + Cash)
    let bankQuery = { company_id: { $in: allCompanyIds } };
    let cashQuery = { companyId: { $in: allCompanyIds } };
    
    if (startDate && endDate) {
      bankQuery.transaction_date = { $gte: new Date(startDate), $lte: new Date(endDate) };
      cashQuery.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const [bankTransactions, cashHistory] = await Promise.all([
      Transaction.find(bankQuery),
      DenominationHistory.find(cashQuery)
    ]);

    const totalBankAmount = bankTransactions.reduce((sum, t) => sum + t.transfer_amount, 0);
    const totalCashDeposit = cashHistory.filter(h => h.type === "DEPOSIT").reduce((sum, h) => sum + h.totalAmount, 0);
    const totalCashWithdraw = cashHistory.filter(h => h.type === "WITHDRAW").reduce((sum, h) => sum + h.totalAmount, 0);

    const totalAmountTransferred = totalBankAmount + totalCashDeposit;
    const totalTransactions = bankTransactions.length + cashHistory.length;

    // 2. Current Cash Stock (Aggregated across companies)
    const DenominationModel = require("../models/Denomination");
    const denominations = await DenominationModel.find({ companyId: { $in: allCompanyIds } });
    const currentCashStock = denominations.reduce((sum, d) => sum + d.totalAmount, 0);

    const CustomerModel = require("../models/Customer");
    const [bankAccounts, customers] = await Promise.all([
      BankAccount.countDocuments({ company_id: { $in: allCompanyIds } }),
      CustomerModel.countDocuments({ company_id: { $in: allCompanyIds } })
    ]);

    // 4. Recent Transactions Combined
    const recentBank = bankTransactions.slice(0, 5).map(t => ({
      id: t._id,
      date: t.transaction_date,
      type: "Bank Transfer",
      amount: t.transfer_amount,
      status: t.status
    }));
    const recentCash = cashHistory.slice(0, 5).map(h => ({
      id: h._id,
      date: h.date,
      type: h.type === "DEPOSIT" ? "Cash Deposit" : "Cash Withdraw",
      amount: h.totalAmount,
      status: "completed"
    }));

    const recentTransactions = [...recentBank, ...recentCash]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);

    res.json({
      totalTransactions,
      totalAmountTransferred,
      currentCashStock,
      bankAccounts,
      activeCustomers: customers,
      recentTransactions,
      pendingTransactions: bankTransactions.filter(t => t.status === 'pending').length,
      failedTransactions: bankTransactions.filter(t => t.status === 'failed').length,
    });
  } catch (err) {
    console.error("GET /api/reports/dashboard ERROR:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

module.exports = router;
