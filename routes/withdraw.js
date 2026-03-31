const express = require("express");
const router = express.Router();
const { auth, checkPermission } = require("../middleware/auth");
const Company = require("../models/Company");
const BankAccount = require("../models/BankAccount");
const WithdrawTransaction = require("../models/WithdrawTransaction");
const Denomination = require("../models/Denomination");
const DenominationHistory = require("../models/DenominationHistory");
const RoleAssignment = require("../models/RoleAssignment");

// @route   GET /api/withdraw/companies
// @desc    Get all companies for the current user
router.get("/companies", auth, async (req, res) => {
  try {
    // 1. Find companies owned by user
    const ownedCompanies = await Company.find({ userId: req.user.id || req.user._id });
    
    // 2. Find companies where user is assigned a role
    const assignments = await RoleAssignment.find({ email: req.user.email });
    const assignedCompanyIds = assignments.map(a => a.company_id);
    const assignedCompanies = await Company.find({ _id: { $in: assignedCompanyIds } });

    // Combine
    const allCompanies = [...ownedCompanies];
    assignedCompanies.forEach(ac => {
      if (!allCompanies.some(c => c._id.toString() === ac._id.toString())) {
        allCompanies.push(ac);
      }
    });

    res.json(allCompanies.sort((a, b) => b.createdAt - a.createdAt));
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server Error" });
  }
});

// @route   GET /api/withdraw/bank-accounts/:companyId
// @desc    Get all active bank accounts for a specific company
router.get("/bank-accounts/:companyId", auth, async (req, res) => {
  try {
    const { companyId } = req.params;

    // Verify ownership OR role assignment
    const company = await Company.findById(companyId);
    if (!company) return res.status(404).json({ message: "Company not found" });

    const isOwner = company.userId.toString() === (req.user.id || req.user._id).toString();
    const assignment = await RoleAssignment.findOne({ 
      email: req.user.email, 
      company_id: companyId 
    });

    if (!isOwner && !assignment) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const accounts = await BankAccount.find({
      company_id: companyId,
      is_active: true,
    }).sort({ createdAt: -1 });

    res.json(accounts);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server Error" });
  }
});

// @route   GET /api/withdraw/bank-balance
// @desc    Get all bank accounts with current_balance grouped by bank_name for dashboard
router.get("/bank-balance", auth, async (req, res) => {
  try {
    // 1. Find companies owned by user
    const ownedCompanies = await Company.find({ userId: req.user.id || req.user._id });
    const ownedCompanyIds = ownedCompanies.map(c => c._id);

    // 2. Find companies where user is assigned a role
    const assignments = await RoleAssignment.find({ email: req.user.email });
    const assignedCompanyIds = assignments.map(a => a.company_id);

    const allCompanyIds = [...ownedCompanyIds, ...assignedCompanyIds];

    const accounts = await BankAccount.find({
      company_id: { $in: allCompanyIds },
      is_active: true,
    }).populate("company_id", "name");

    // Group by bank_name
    const grouped = accounts.reduce((acc, account) => {
      const existing = acc.find((b) => b.bankName === account.bank_name);
      if (existing) {
        existing.balance += account.current_balance || 0;
        existing.count += 1;
      } else {
        acc.push({
          bankName: account.bank_name,
          balance: account.current_balance || 0,
          count: 1,
        });
      }
      return acc;
    }, []);

    res.json(grouped);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server Error" });
  }
});

// @route   POST /api/withdraw
// @desc    Create a withdraw transaction, deduct bank balance, update denomination stock
router.post("/", auth, checkPermission('denomination_withdraw'), async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      company_id,
      bank_account_id,
      withdraw_amount,
      remark,
      denomination_company_id,
      denomination_snapshot,
    } = req.body;

    // Validate required fields
    if (!company_id || !bank_account_id || !withdraw_amount) {
      return res.status(400).json({ message: "company_id, bank_account_id, and withdraw_amount are required" });
    }

    if (Number(withdraw_amount) <= 0) {
      return res.status(400).json({ message: "Withdraw amount must be greater than 0" });
    }

    // Verify company belongs to user OR user has staff/user role assigned to this company
    const company = await Company.findById(company_id);
    if (!company) return res.status(404).json({ message: "Company not found" });

    const isOwner = company.userId.toString() === userId.toString();
    const assignment = await RoleAssignment.findOne({ 
      email: req.user.email, 
      company_id: company_id 
    });

    if (!isOwner && !assignment) {
      return res.status(401).json({ message: "Invalid company or not authorized" });
    }

    // Use the company owner's ID for denomination stock updates to ensure consistency
    const ownerId = company.userId;

    // Verify bank account belongs to the company
    const bankAccount = await BankAccount.findById(bank_account_id);
    if (!bankAccount || bankAccount.company_id.toString() !== company_id) {
      return res.status(404).json({ message: "Bank account not found or does not belong to selected company" });
    }

    if (!bankAccount.is_active) {
      return res.status(400).json({ message: "Selected bank account is inactive" });
    }

    const amount = Number(withdraw_amount);

    // If denomination snapshot provided, validate and deduct denomination stock
    if (denomination_company_id && denomination_snapshot) {
      const denomCompanyId = denomination_company_id;
      const stockDoc = await Denomination.findOne({ userId: ownerId, companyId: denomCompanyId });

      if (stockDoc) {
        // Validate sufficient denomination stock
        for (const key of Object.keys(denomination_snapshot)) {
          const needed = Number(denomination_snapshot[key]) || 0;
          if (needed > 0 && (stockDoc.stock[key] || 0) < needed) {
            return res.status(400).json({ message: `Insufficient denomination stock for ₹${key} notes` });
          }
        }

        // Deduct denomination stock
        Object.keys(denomination_snapshot).forEach((key) => {
          const needed = Number(denomination_snapshot[key]) || 0;
          if (needed > 0) {
            stockDoc.stock[key] = (stockDoc.stock[key] || 0) - needed;
          }
        });
        stockDoc.totalAmount -= amount;
        await stockDoc.save();

        // Record denomination history under stock owner for consistent viewing
        await DenominationHistory.create({
          userId: ownerId,
          companyId: denomCompanyId,
          type: "WITHDRAW",
          denominations: denomination_snapshot,
          totalAmount: amount,
          remarks: remark || "",
        });
      }
    }

    // Add withdrawn cash to company bank account balance
    await BankAccount.findByIdAndUpdate(bank_account_id, {
      $inc: { current_balance: amount },
    });

    // Create withdraw transaction record
    const withdrawTx = await WithdrawTransaction.create({
      userId,
      company_id,
      bank_account_id,
      company_name: company.name,
      bank_name: bankAccount.bank_name,
      account_number: bankAccount.account_number,
      ifsc_code: bankAccount.ifsc_code,
      withdraw_amount: amount,
      remark: remark || "",
      denomination_snapshot: denomination_snapshot || {},
      transaction_date: new Date(),
    });

    // Fetch updated bank account
    const updatedBankAccount = await BankAccount.findById(bank_account_id);

    res.status(201).json({
      message: "Withdrawal successful",
      transaction: withdrawTx,
      updatedBalance: updatedBankAccount.current_balance,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server Error" });
  }
});

module.exports = router;
