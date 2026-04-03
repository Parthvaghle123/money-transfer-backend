const express = require("express");

const router = express.Router();

const Denomination = require("../models/Denomination");

const DenominationHistory = require("../models/DenominationHistory");

const { auth } = require("../middleware/auth");
const RoleAssignment = require("../models/RoleAssignment");
const Company = require("../models/Company");

// Get current stock for a company
router.get("/stock/:companyId", auth, async (req, res) => {
  try {
    const { companyId } = req.params;
    
    // Find company to get owner's userId
    const company = await Company.findById(companyId);
    if (!company) return res.status(404).json({ message: "Company not found" });

    // Stock is stored under the company owner's userId
    const stockOwnerId = company.userId;

    let stock = await Denomination.findOne({ userId: stockOwnerId, companyId }).populate("companyId", "name");
    if (!stock) {
      stock = await Denomination.create({ userId: stockOwnerId, companyId });
      stock = await Denomination.findById(stock._id).populate("companyId", "name");
    }
    res.json({ stock });
  } catch (e) {
    console.error("GET /stock/:companyId ERROR:", e);
    res.status(500).json({ message: "Failed to fetch stock" });
  }
});

// Deposit Cash
router.post("/deposit", auth, async (req, res) => {
  try {
    const { companyId, denominations, totalAmount, remarks } = req.body;

    if (!companyId || !denominations || !totalAmount) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const company = await Company.findById(companyId);
    if (!company) return res.status(404).json({ message: "Company not found" });
    const stockOwnerId = company.userId;

    // 1. Update/Create Stock
    let stockDoc = await Denomination.findOne({ userId: stockOwnerId, companyId });
    if (!stockDoc) {
      stockDoc = new Denomination({ userId: stockOwnerId, companyId });
    }

    // Add new counts to current stock
    Object.keys(denominations).forEach((key) => {
      stockDoc.stock[key] = (stockDoc.stock[key] || 0) + (Number(denominations[key]) || 0);
    });
    stockDoc.totalAmount += Number(totalAmount);
    await stockDoc.save();

    // 2. Create History Record
    const history = await DenominationHistory.create({
      userId: stockOwnerId, // Store history under owner for shared view
      companyId,
      type: "DEPOSIT",
      denominations,
      totalAmount,
      remarks,
    });

    res.status(201).json({ stock: stockDoc, history });
  } catch (e) {
    console.error("POST /deposit ERROR:", e);
    res.status(500).json({ message: "Failed to process deposit" });
  }
});

// Withdraw Cash
router.post("/withdraw", auth, async (req, res) => {
  try {
    const { companyId, denominations, totalAmount, remarks } = req.body;

    if (!companyId || !denominations || !totalAmount) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const company = await Company.findById(companyId);
    if (!company) return res.status(404).json({ message: "Company not found" });
    const stockOwnerId = company.userId;

    // 1. Check/Update Stock
    let stockDoc = await Denomination.findOne({ userId: stockOwnerId, companyId });
    if (!stockDoc) {
      return res.status(400).json({ message: "No stock found for this company" });
    }

    // Validate sufficient stock
    for (const key of Object.keys(denominations)) {
      if ((stockDoc.stock[key] || 0) < (Number(denominations[key]) || 0)) {
        return res.status(400).json({ message: `Insufficient stock for ₹${key} notes` });
      }
    }

    // Subtract counts from current stock
    Object.keys(denominations).forEach((key) => {
      stockDoc.stock[key] -= (Number(denominations[key]) || 0);
    });
    stockDoc.totalAmount -= Number(totalAmount);
    await stockDoc.save();

    // 2. Create History Record
    const history = await DenominationHistory.create({
      userId: stockOwnerId, // Store history under owner for shared view
      companyId,
      type: "WITHDRAW",
      denominations,
      totalAmount,
      remarks,
    });

    res.status(201).json({ stock: stockDoc, history });
  } catch (e) {
    console.error("POST /withdraw ERROR:", e);
    res.status(500).json({ message: "Failed to process withdrawal" });
  }
});

// Get History for a company
router.get("/history/:companyId", auth, async (req, res) => {
  try {
    const { companyId } = req.params;
    const { type } = req.query;

    const company = await Company.findById(companyId);
    if (!company) return res.status(404).json({ message: "Company not found" });
    const stockOwnerId = company.userId;

    // Authorization: only super-admin, company owner, or assigned staff/user can view this company's history.
    if (req.user?.role !== "super-admin") {
      const isOwner = stockOwnerId?.toString() === req.user?.id?.toString();
      const isAssigned =
        req.user?.email
          ? await RoleAssignment.findOne({ email: req.user.email, company_id: companyId })
          : null;
      if (!isOwner && !isAssigned) {
        return res.status(401).json({ message: "Not authorized" });
      }
    }

    // History is scoped by companyId.
    // Previously some legacy records were written with a mismatched userId, so we must not rely on userId here.
    let query = { companyId };

    /**
     * Enforce allowed history type by role and permissions:
     * - `super-admin`: see ALL history (DEPOSIT + WITHDRAW)
     * - Check permissions for role-based users:
     *   - If has `transfer_money` permission: can see DEPOSIT
     *   - If has `denomination_withdraw` permission: can see WITHDRAW
     *   - If has both permissions: can see both
     * - Legacy role fallback:
     *   - `user`: see ONLY DEPOSIT history
     *   - `staff`: see ONLY WITHDRAW history
     *
     * NOTE: the UI currently doesn't pass `?type=...`, but we still guard it.
     */
    const role = req.user?.role;
    
    // Check user's permissions for this company
    let userPermissions = [];
    if (role !== "super-admin") {
      try {
        const assignment = await RoleAssignment.findOne({ 
          email: req.user.email, 
          company_id: companyId 
        });
        userPermissions = assignment?.permissions || [];
      } catch (err) {
        console.error("Error fetching permissions:", err);
        userPermissions = [];
      }
    }
    
    const hasMoneyPermission = userPermissions.includes('transfer_money');
    const hasWithdrawPermission = userPermissions.includes('denomination_withdraw');
    
    // Determine what types to show based on permissions
    let allowedTypes = [];
    
    if (role === "super-admin") {
      // Super-admin can see both
      allowedTypes = ['DEPOSIT', 'WITHDRAW'];
    } else if (hasMoneyPermission && hasWithdrawPermission) {
      // User has both permissions
      allowedTypes = ['DEPOSIT', 'WITHDRAW'];
    } else if (hasMoneyPermission) {
      // User has only money permission
      allowedTypes = ['DEPOSIT'];
    } else if (hasWithdrawPermission) {
      // User has only withdraw permission
      allowedTypes = ['WITHDRAW'];
    } else {
      // Fallback to legacy role-based behavior
      if (role === "staff") {
        allowedTypes = ['WITHDRAW'];
      } else if (role === "user") {
        allowedTypes = ['DEPOSIT'];
      } else {
        // Fail closed: unknown roles only get deposit history.
        allowedTypes = ['DEPOSIT'];
      }
    }
    
    // Apply type filtering
    if (type) {
      if (type !== "DEPOSIT" && type !== "WITHDRAW") {
        return res.status(400).json({ message: "Invalid history type. Use DEPOSIT or WITHDRAW." });
      }
      if (!allowedTypes.includes(type)) {
        return res.status(403).json({ message: `Access denied. Allowed history types: ${allowedTypes.join(', ')}` });
      }
      query.type = type;
    } else if (allowedTypes.length === 1) {
      // If only one type is allowed, filter by it
      query.type = allowedTypes[0];
    }
    // If both types are allowed, don't filter (return all)

    const history = await DenominationHistory.find(query).sort({ date: -1 });
    res.json({ history });
  } catch (e) {
    console.error("GET /history/:companyId ERROR:", e);
    res.status(500).json({ message: "Failed to fetch history" });
  }
});



module.exports = router;

