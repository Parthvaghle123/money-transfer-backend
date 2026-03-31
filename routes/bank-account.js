const express = require("express");
const router = express.Router();
const BankAccount = require("../models/BankAccount");
const Company = require("../models/Company");
const { auth, checkPermission } = require("../middleware/auth");
const RoleAssignment = require("../models/RoleAssignment");

// @route   GET api/bank-account
// @desc    Get all bank accounts for current user (filtered by user's companies)
router.get("/", auth, async (req, res) => {
  try {
    // 1. Find companies owned by user
    const ownedCompanies = await Company.find({ userId: req.user.id || req.user._id });
    const ownedCompanyIds = ownedCompanies.map(c => c._id);

    // 2. Find companies where user is assigned a role
    const assignments = await RoleAssignment.find({ email: req.user.email });
    const assignedCompanyIds = assignments
      .filter(a => a.permissions.includes('bank_account_detail'))
      .map(a => a.company_id);

    const allCompanyIds = [...ownedCompanyIds, ...assignedCompanyIds];

    // Find bank accounts for those companies
    const accounts = await BankAccount.find({ company_id: { $in: allCompanyIds } })
      .populate("company_id", "name")
      .sort({ createdAt: -1 });
    
    res.json(accounts);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server Error" });
  }
});

// @route   GET api/bank-account/:id
// @desc    Get a single bank account by ID
router.get("/:id", auth, async (req, res) => {
  try {
    const account = await BankAccount.findById(req.params.id).populate("company_id", "name userId");
    if (!account) return res.status(404).json({ message: "Bank account not found" });

    // Check ownership OR role assignment
    const isOwner = account.company_id.userId.toString() === req.user.id.toString();
    const assignment = await RoleAssignment.findOne({ 
      email: req.user.email, 
      company_id: account.company_id._id,
      permissions: "bank_account_detail"
    });

    if (!isOwner && !assignment) {
      return res.status(401).json({ message: "Not authorized" });
    }

    res.json(account);
  } catch (err) {
    if (err.kind === "ObjectId") return res.status(404).json({ message: "Bank account not found" });
    res.status(500).json({ message: "Server Error" });
  }
});

// @route   POST api/bank-account
// @desc    Create a new bank account
router.post("/", auth, checkPermission('bank_account_add'), async (req, res) => {
  const { company_id, bank_name, account_number, ifsc_code, nickname, is_active } = req.body;

  try {
    // Permission already checked by checkPermission middleware
    const newAccount = new BankAccount({
      company_id,
      bank_name,
      account_number,
      ifsc_code,
      nickname,
      is_active,
    });

    const account = await newAccount.save();
    res.json(account);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server Error" });
  }
});

// @route   PUT api/bank-account/:id
// @desc    Update a bank account
router.put("/:id", auth, checkPermission('bank_account_edit'), async (req, res) => {
  const { company_id, bank_name, account_number, ifsc_code, nickname, is_active } = req.body;

  try {
    let account = await BankAccount.findById(req.params.id).populate("company_id");
    if (!account) return res.status(404).json({ message: "Bank account not found" });

    // Check permission for the company
    const isOwner = account.company_id.userId.toString() === req.user.id.toString();
    const assignment = await RoleAssignment.findOne({ 
      email: req.user.email, 
      company_id: account.company_id._id,
      permissions: "bank_account_edit"
    });

    if (!isOwner && !assignment) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const updatedFields = {
      company_id,
      bank_name,
      account_number,
      ifsc_code,
      nickname,
      is_active,
    };

    account = await BankAccount.findByIdAndUpdate(
      req.params.id,
      { $set: updatedFields },
      { new: true }
    );

    res.json(account);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server Error" });
  }
});

// @route   DELETE api/bank-account/:id
// @desc    Delete a bank account
router.delete("/:id", auth, checkPermission('bank_account_delete'), async (req, res) => {
  try {
    const account = await BankAccount.findById(req.params.id).populate("company_id");
    if (!account) return res.status(404).json({ message: "Bank account not found" });

    // Check permission
    const isOwner = account.company_id.userId.toString() === req.user.id.toString();
    const assignment = await RoleAssignment.findOne({ 
      email: req.user.email, 
      company_id: account.company_id._id,
      permissions: "bank_account_delete"
    });

    if (!isOwner && !assignment) {
      return res.status(401).json({ message: "Not authorized" });
    }

    await BankAccount.findByIdAndDelete(req.params.id);
    res.json({ message: "Bank account deleted" });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server Error" });
  }
});

module.exports = router;
