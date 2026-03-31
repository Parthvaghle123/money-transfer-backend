  const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const RoleAssignment = require('../models/RoleAssignment');

// Get current user permissions for a specific company
router.get('/company/:companyId', auth, async (req, res) => {
  try {
    const { companyId } = req.params;
    const user = req.user;

    // Super admin has all permissions
    if (user.role === 'super-admin') {
      return res.json({
        permissions: 'all',
        role: 'super-admin',
        companyId
      });
    }

    // Find role assignment for this user and company
    const assignment = await RoleAssignment.findOne({
      email: user.email,
      company_id: companyId
    });

    if (!assignment) {
      return res.status(404).json({ 
        message: 'No role assignment found for this company' 
      });
    }

    res.json({
      permissions: assignment.permissions,
      role: assignment.role,
      companyId
    });

  } catch (error) {
    console.error('Error fetching permissions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
