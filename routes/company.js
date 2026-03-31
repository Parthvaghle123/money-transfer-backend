const express = require("express");
const router = express.Router();
const Company = require("../models/Company");
const { auth, checkPermission } = require("../middleware/auth");
const RoleAssignment = require("../models/RoleAssignment");

// @route   GET api/company
// @desc    Get all companies for current user
router.get("/", auth, async (req, res) => {
  try {
    // 1. If Super Admin, return all companies they created
    const createdCompanies = await Company.find({ userId: req.user.id }).sort({ createdAt: -1 });
    
    // 2. Also find companies where the user is assigned a role
    const assignments = await RoleAssignment.find({ email: req.user.email });
    const assignedCompanyIds = assignments.map(a => a.company_id);
    
    const assignedCompanies = await Company.find({ _id: { $in: assignedCompanyIds } }).sort({ createdAt: -1 });
    
    // Combine and remove duplicates
    const allCompanies = [...createdCompanies];
    assignedCompanies.forEach(ac => {
      if (!allCompanies.some(c => c._id.toString() === ac._id.toString())) {
        allCompanies.push(ac);
      }
    });

    res.json(allCompanies);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// @route   GET api/company/:id
// @desc    Get a single company by ID
router.get("/:id", auth, async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ message: "Company not found" });

    // Check if user owns company
    const isOwner = company.userId.toString() === req.user.id;
    
    // OR check if user has a role assignment in this company
    const assignment = await RoleAssignment.findOne({ 
      email: req.user.email, 
      company_id: req.params.id 
    });

    if (!isOwner && !assignment) {
      return res.status(401).json({ message: "Not authorized" });
    }

    res.json(company);
  } catch (err) {
    if (err.kind === "ObjectId") return res.status(404).json({ message: "Company not found" });
    res.status(500).send("Server Error");
  }
});

// @route   POST api/company
// @desc    Create a new company
router.post("/", auth, checkPermission('company_add'), async (req, res) => {
  const { name, phone, paymentDueDays, jurisdiction, standardRules, additionalNotes, extraRules, isDefault, logoDataUrl } = req.body;

  try {
    // Check if this is the user's first company
    const existingCompanies = await Company.find({ userId: req.user.id });
    const isFirstCompany = existingCompanies.length === 0;
    
    const newCompany = new Company({
      userId: req.user.id,
      name,
      phone,
      paymentDueDays,
      jurisdiction,
      standardRules,
      additionalNotes,
      extraRules,
      isDefault: isFirstCompany ? true : isDefault, // Auto-set to true if it's the first company
      logoDataUrl,
    });

    const company = await newCompany.save();
    res.json(company);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// @route   PUT api/company/:id
// @desc    Update a company
router.put("/:id", auth, checkPermission('company_edit'), async (req, res) => {
  const { name, phone, paymentDueDays, jurisdiction, standardRules, additionalNotes, extraRules, isDefault, logoDataUrl } = req.body;

  try {
    let company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ message: "Company not found" });

    // Check ownership OR role assignment with edit permission
    const isOwner = company.userId.toString() === req.user.id.toString();
    const assignment = await RoleAssignment.findOne({ 
      email: req.user.email, 
      company_id: req.params.id,
      permissions: "company_edit"
    });

    if (!isOwner && !assignment) {
      return res.status(401).json({ message: "Not authorized" });
    }

    // If setting this company as default, unset all other default companies for this user
    if (isDefault) {
      await Company.updateMany(
        { userId: req.user.id, _id: { $ne: req.params.id } },
        { $set: { isDefault: false } }
      );
    }

    const updatedFields = {
      name,
      phone,
      paymentDueDays,
      jurisdiction,
      standardRules,
      additionalNotes,
      extraRules,
      isDefault,
      logoDataUrl,
    };

    company = await Company.findByIdAndUpdate(
      req.params.id,
      { $set: updatedFields },
      { new: true }
    );

    res.json(company);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// @route   DELETE api/company/:id
// @desc    Delete a company
router.delete("/:id", auth, checkPermission('company_delete'), async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ message: "Company not found" });

    // Check ownership OR role assignment with delete permission
    const isOwner = company.userId.toString() === req.user.id.toString();
    const assignment = await RoleAssignment.findOne({ 
      email: req.user.email, 
      company_id: req.params.id,
      permissions: "company_delete"
    });

    if (!isOwner && !assignment) {
      return res.status(401).json({ message: "Not authorized" });
    }

    await Company.findByIdAndDelete(req.params.id);
    res.json({ message: "Company removed" });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
