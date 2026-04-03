const express = require("express");
const router = express.Router();
const RoleAssignment = require("../models/RoleAssignment");
const User = require("../models/User");
const { auth, superAdmin } = require("../middleware/auth");

/**
 * transfer_money → customer_detail + add/edit/delete.
 * denomination_withdraw only (no transfer_money) → customer_detail only.
 * If both, transfer_money wins (full customer).
 */
function normalizeMoneyTransferCustomerPerms(permissions) {
  if (!Array.isArray(permissions)) return permissions;
  const hasMoney = permissions.includes("transfer_money");
  const hasWithdraw = permissions.includes("denomination_withdraw");

  if (hasMoney) {
    const full = ["customer_detail", "customer_add", "customer_edit", "customer_delete"];
    return [...new Set([...permissions, ...full])];
  }

  if (hasWithdraw) {
    const stripped = permissions.filter(
      (p) => p !== "customer_add" && p !== "customer_edit" && p !== "customer_delete"
    );
    if (!stripped.includes("customer_detail")) stripped.push("customer_detail");
    return stripped;
  }

  return [...permissions];
}

// @route   GET api/role-assignment/company/:companyId
// @desc    Get all role assignments for a company
router.get("/company/:companyId", auth, async (req, res) => {
  try {
    const assignments = await RoleAssignment.find({ company_id: req.params.companyId }).sort({ created_at: -1 });
    res.json(assignments);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// @route   POST api/role-assignment
// @desc    Create a new role assignment (Super Admin only)
router.post("/", auth, superAdmin, async (req, res) => {
  const { firstName, lastName, email, password, role, permissions, company_id } = req.body;

  try {
    // Check if email already exists for this company
    const existingAssignment = await RoleAssignment.findOne({ 
      email: email.toLowerCase(), 
      company_id 
    });

    if (existingAssignment) {
      return res.status(400).json({ message: "Role assignment already exists for this email in this company." });
    }

    const newAssignment = new RoleAssignment({
      firstName,
      lastName,
      email: email.toLowerCase(),
      password,
      role,
      permissions: normalizeMoneyTransferCustomerPerms(permissions),
      company_id
    });

    const assignment = await newAssignment.save();
    res.json(assignment);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// @route   PUT api/role-assignment/:id
// @desc    Update a role assignment (Super Admin only)
router.put("/:id", auth, superAdmin, async (req, res) => {
  const { firstName, lastName, email, password, role, permissions } = req.body;

  try {
    let assignment = await RoleAssignment.findById(req.params.id);
    if (!assignment) return res.status(404).json({ message: "Role assignment not found" });

    // Check if new email is already used in this company by another assignment
    if (email.toLowerCase() !== assignment.email) {
      const existingAssignment = await RoleAssignment.findOne({ 
        email: email.toLowerCase(), 
        company_id: assignment.company_id,
        _id: { $ne: req.params.id }
      });
      if (existingAssignment) {
        return res.status(400).json({ message: "Role assignment already exists for this email in this company." });
      }
    }

    assignment.firstName = firstName;
    assignment.lastName = lastName;
    assignment.email = email.toLowerCase();
    if (password) assignment.password = password; // Only update if password provided
    assignment.role = role;
    assignment.permissions = normalizeMoneyTransferCustomerPerms(permissions);

    await assignment.save();
    res.json(assignment);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// @route   DELETE api/role-assignment/:id
// @desc    Delete a role assignment (Super Admin only)
router.delete("/:id", auth, superAdmin, async (req, res) => {
  try {
    const assignment = await RoleAssignment.findByIdAndDelete(req.params.id);
    if (!assignment) return res.status(404).json({ message: "Role assignment not found" });

    res.json({ message: "Role assignment removed" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
