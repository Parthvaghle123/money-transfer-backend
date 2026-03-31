const express = require("express");
const router = express.Router();
const Transaction = require("../models/Transaction");
const Customer = require("../models/Customer");
const Company = require("../models/Company");
const BankAccount = require("../models/BankAccount");
const Denomination = require("../models/Denomination");
const DenominationHistory = require("../models/DenominationHistory");
const { auth, checkPermission } = require("../middleware/auth");
const RoleAssignment = require("../models/RoleAssignment");

// @route   GET api/transaction
// @desc    Get all transactions for current user (filtered by user's companies)
router.get("/", auth, async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;
    let query = {};

    // Date filtering
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      query.transaction_date = { $gte: startOfDay, $lte: endOfDay };
    } else if (startDate || endDate) {
      query.transaction_date = {};
      if (startDate) {
        query.transaction_date.$gte = new Date(startDate);
      }
      if (endDate) {
        const endOfRange = new Date(endDate);
        endOfRange.setHours(23, 59, 59, 999);
        query.transaction_date.$lte = endOfRange;
      }
    }

    // 1. Find companies owned by user
    const ownedCompanies = await Company.find({ userId: req.user.id || req.user._id });
    const ownedCompanyIds = ownedCompanies.map(c => c._id);

    // 2. Find companies where user is assigned a role
    const assignments = await RoleAssignment.find({ email: req.user.email });
    const assignedCompanyIds = assignments
      .filter(a => a.permissions.includes('transfer_money') || a.permissions.includes('company_detail'))
      .map(a => a.company_id);

    const allCompanyIds = [...ownedCompanyIds, ...assignedCompanyIds];

    if (allCompanyIds.length === 0) {
      return res.json([]);
    }

    // Add company filter to query
    query.company_id = { $in: allCompanyIds };

    const transactions = await Transaction.find(query)
      .populate("company_id")
      .populate("customer_id")
      .sort({ transaction_date: -1 });
    
    res.json(transactions);
  } catch (err) {
    console.error("GET /api/transaction ERROR:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// @route   GET api/transaction/:id
// @desc    Get a single transaction by ID
router.get("/:id", auth, async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate("company_id")
      .populate("customer_id")
      .populate("created_by", "firstName lastName email");
    
    if (!transaction) return res.status(404).json({ message: "Transaction not found" });

    // Check ownership OR role assignment
    const isOwner = transaction.company_id.userId.toString() === req.user.id.toString();
    const assignment = await RoleAssignment.findOne({ 
      email: req.user.email, 
      company_id: transaction.company_id._id
    });

    if (!isOwner && !assignment) {
      return res.status(401).json({ message: "Not authorized" });
    }

    res.json(transaction);
  } catch (err) {
    console.error("GET /api/transaction/:id ERROR:", err);
    if (err.kind === "ObjectId") return res.status(404).json({ message: "Transaction not found" });
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// @route   POST api/transaction
// @desc    Create a new transaction
router.post("/", auth, checkPermission('transfer_money'), async (req, res) => {
  const { 
    company_id, 
    customer_id, 
    customer_bank_account_id, 
    customer_bank_name,
    customer_ifsc_code,
    company_bank_account_id, 
    company_bank_name,
    company_ifsc_code,
    transfer_amount, 
    transfer_date,
    notes,
    denominations,
    status = 'completed' // Defaulting to completed for now as per simple transfer
  } = req.body;

  try {
    // Validate required fields
    if (!company_id || !customer_id || !transfer_amount || !transfer_date) {
      return res.status(400).json({ 
        message: "Missing required fields: company_id, customer_id, transfer_amount, and transfer_date are required" 
      });
    }

    const company = await Company.findById(company_id);
    if (!company) return res.status(404).json({ message: "Company not found" });

    const customer = await Customer.findById(customer_id);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Parse and validate transfer_date
    let parsedTransferDate;
    try {
      parsedTransferDate = transfer_date ? new Date(transfer_date) : new Date();
      if (isNaN(parsedTransferDate.getTime())) {
        return res.status(400).json({ message: "Invalid transfer date format" });
      }
    } catch (dateError) {
      return res.status(400).json({ message: "Invalid transfer date format" });
    }

    // 1. Update Denomination Stock automatically
    if (denominations) {
      // Find the stock owner (the company creator)
      const stockOwnerId = company.userId;

      let stockDoc = await Denomination.findOne({ userId: stockOwnerId, companyId: company_id });
      if (!stockDoc) {
        stockDoc = new Denomination({ userId: stockOwnerId, companyId: company_id });
      }

      // Add denominations to stock
      Object.keys(denominations).forEach((key) => {
        stockDoc.stock[key] = (stockDoc.stock[key] || 0) + (Number(denominations[key]) || 0);
      });
      stockDoc.totalAmount += Number(transfer_amount);
      await stockDoc.save();

      // Create History Record
      await DenominationHistory.create({
        // Store history under stock owner so GET /api/denomination/history works consistently
        userId: stockOwnerId,
        companyId: company_id,
        type: "DEPOSIT",
        denominations,
        totalAmount: transfer_amount,
        remarks: `Money Transfer to ${customer.customer_name}`,
      });
    }

    const newTransaction = new Transaction({
      company_id,
      customer_id,
      customer_bank_account_id,
      customer_bank_name,
      customer_ifsc_code,
      company_bank_account_id,
      company_bank_name,
      company_ifsc_code,
      transfer_amount,
      transfer_date: parsedTransferDate,
      notes,
      status,
      created_by: req.user.id
    });

    const transaction = await newTransaction.save();
    res.json(transaction);
  } catch (err) {
    console.error("POST /api/transaction ERROR:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

module.exports = router;
