const express = require("express");
const router = express.Router();
const Customer = require("../models/Customer");
const Company = require("../models/Company");
const Transaction = require("../models/Transaction");
const { auth, checkPermission } = require("../middleware/auth");
const RoleAssignment = require("../models/RoleAssignment");

// @route   GET api/customer
// @desc    Get all customers for current user (filtered by user's companies)
router.get("/", auth, async (req, res) => {
  try {
    // 1. Find companies owned by user
    const ownedCompanies = await Company.find({ userId: req.user.id || req.user._id });
    const ownedCompanyIds = ownedCompanies.map(c => c._id);

    // 2. Find companies where user is assigned a role
    const assignments = await RoleAssignment.find({ email: req.user.email });
    const assignedCompanyIds = assignments
      .filter(a => a.permissions.includes('customer_detail'))
      .map(a => a.company_id);

    const allCompanyIds = [...ownedCompanyIds, ...assignedCompanyIds];

    const query = { company_id: { $in: allCompanyIds } };
    
    // Filter by company_id if provided in query
    if (req.query.company_id && req.query.company_id !== "undefined" && req.query.company_id !== "null") {
      // If filtering by a specific company, verify user has access to it
      if (!allCompanyIds.some(id => id.toString() === req.query.company_id)) {
        return res.status(403).json({ message: "Access denied to this company's customers" });
      }
      query.company_id = req.query.company_id;
    }

    const customers = await Customer.find(query)
      .populate("company_id", "name")
      .sort({ createdAt: -1 });
    
    res.json(customers);
  } catch (err) {
    console.error("GET /api/customer ERROR:", err);
    res.status(500).json({ message: "Server Error" });
  }
});

// @route   GET api/customer/:id
// @desc    Get a single customer by ID
router.get("/:id", auth, async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id).populate("company_id", "name userId");
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    // Check ownership OR role assignment
    const isOwner = customer.company_id.userId.toString() === (req.user.id || req.user._id).toString();
    const assignment = await RoleAssignment.findOne({ 
      email: req.user.email, 
      company_id: customer.company_id._id,
      permissions: "customer_detail"
    });

    if (!isOwner && !assignment && req.user.role !== 'super-admin') {
      return res.status(401).json({ message: "Not authorized" });
    }

    res.json(customer);
  } catch (err) {
    if (err.kind === "ObjectId") return res.status(404).json({ message: "Customer not found" });
    res.status(500).json({ message: "Server Error" });
  }
});

// @route   POST api/customer
// @desc    Create a new customer
router.post("/", auth, checkPermission('customer_add'), async (req, res) => {
  const { company_id, customer_name, mobile_number, customer_email, customer_address, bank_name, account_number, ifsc_code, nickname, status, bank_accounts } = req.body;

  try {
    if (!company_id || company_id === "undefined" || company_id === "null") {
      return res.status(400).json({ message: "Company ID is required" });
    }

    // Validate mobile_number - must be exactly 10 digits
    if (!mobile_number || !/^\d{10}$/.test(mobile_number.replace(/\D/g, ''))) {
      return res.status(400).json({ message: "Mobile number must be exactly 10 digits" });
    }

    // Check permission manually for company_id
    const isOwner = await Company.findOne({ _id: company_id, userId: req.user.id || req.user._id });
    const assignment = await RoleAssignment.findOne({ 
      email: req.user.email, 
      company_id: company_id,
      permissions: "customer_add"
    });

    if (!isOwner && !assignment && req.user.role !== 'super-admin') {
      return res.status(403).json({ message: "Access denied to add customers for this company" });
    }

    // Build bank_accounts
    let accounts = Array.isArray(bank_accounts) && bank_accounts.length > 0
      ? bank_accounts
      : (bank_name ? [{ bank_name, account_number, ifsc_code, nickname: nickname || "" }] : []);

    const newCustomer = new Customer({
      company_id,
      customer_name,
      mobile_number: mobile_number.replace(/\D/g, ''),
      customer_email,
      customer_address,
      bank_name: accounts[0]?.bank_name || bank_name,
      account_number: accounts[0]?.account_number || account_number,
      ifsc_code: accounts[0]?.ifsc_code || ifsc_code,
      nickname: accounts[0]?.nickname || nickname,
      bank_accounts: accounts,
      status,
    });

    const customer = await newCustomer.save();
    res.json(customer);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server Error" });
  }
});

// @route   PUT api/customer/:id
// @desc    Update a customer
router.put("/:id", auth, checkPermission('customer_edit'), async (req, res) => {
  const { customer_name, mobile_number, customer_email, customer_address, bank_accounts, status } = req.body;

  try {
    let customer = await Customer.findById(req.params.id).populate("company_id");
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    // Validate mobile_number if provided - must be exactly 10 digits
    if (mobile_number && !/^\d{10}$/.test(mobile_number.replace(/\D/g, ''))) {
      return res.status(400).json({ message: "Mobile number must be exactly 10 digits" });
    }

    // Check permission
    const isOwner = customer.company_id.userId.toString() === (req.user.id || req.user._id).toString();
    const assignment = await RoleAssignment.findOne({ 
      email: req.user.email, 
      company_id: customer.company_id._id,
      permissions: "customer_edit"
    });

    if (!isOwner && !assignment && req.user.role !== 'super-admin') {
      return res.status(401).json({ message: "Not authorized" });
    }

    const updatedFields = {
      customer_name,
      mobile_number: mobile_number ? mobile_number.replace(/\D/g, '') : mobile_number,
      customer_email,
      customer_address,
      bank_accounts,
      status
    };

    customer = await Customer.findByIdAndUpdate(
      req.params.id,
      { $set: updatedFields },
      { new: true }
    );

    res.json(customer);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server Error" });
  }
});

// @route   DELETE api/customer/:id
// @desc    Delete a customer with cascade delete for related transactions
router.delete("/:id", auth, checkPermission('customer_delete'), async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id).populate("company_id");
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    // Check permission
    const isOwner = customer.company_id.userId.toString() === (req.user.id || req.user._id).toString();
    const assignment = await RoleAssignment.findOne({ 
      email: req.user.email, 
      company_id: customer.company_id._id,
      permissions: "customer_delete"
    });

    if (!isOwner && !assignment && req.user.role !== 'super-admin') {
      return res.status(401).json({ message: "Not authorized" });
    }

    // First, delete all related transactions
    const deleteResult = await Transaction.deleteMany({ customer_id: req.params.id });
    console.log(`Deleted ${deleteResult.deletedCount} transactions for customer ${req.params.id}`);

    // Then delete the customer
    await Customer.findByIdAndDelete(req.params.id);
    
    res.json({ 
      message: "Customer and all related transactions removed successfully",
      deletedTransactions: deleteResult.deletedCount
    });
  } catch (err) {
    console.error("DELETE customer ERROR:", err);
    res.status(500).json({ message: "Server Error" });
  }
});

module.exports = router;
