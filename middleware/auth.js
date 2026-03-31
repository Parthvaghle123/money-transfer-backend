const jwt = require("jsonwebtoken");
const User = require("../models/User");
const RoleAssignment = require("../models/RoleAssignment");

const SECRET_KEY = process.env.SECRET_KEY || "MY_SUPER_SECRET_KEY";

const auth = async (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ message: "No token, authorization denied" });

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    
    // Try to find in Super Admin collection (User)
    let user = await User.findById(decoded.id);
    
    if (!user) {
      // Try to find in Role Assignments (Staff/Users)
      const assignment = await RoleAssignment.findById(decoded.id);
      if (assignment) {
        user = {
          id: assignment._id.toString(),
          _id: assignment._id,
          firstName: assignment.firstName,
          lastName: assignment.lastName,
          email: assignment.email,
          role: assignment.role,
          permissions: assignment.permissions,
          company_id: assignment.company_id
        };
      }
    } else {
      // Ensure user object has consistent id property for Mongoose models that expect a string or ObjectId
      // For plain objects used in frontend or other parts of backend
      if (!user.id) user.id = user._id.toString();
      // Super admin has all permissions
      user.permissions = 'all';
    }

    if (!user) return res.status(401).json({ message: "User not found" });

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ message: "Token is not valid" });
  }
};

const superAdmin = (req, res, next) => {
  if (req.user.role !== 'super-admin') {
    return res.status(403).json({ message: "Access denied. Super Admin only." });
  }
  next();
};

const checkPermission = (permission) => {
  return async (req, res, next) => {
    // Super Admin has all permissions
    if (req.user.role === 'super-admin' || req.user.permissions === 'all') {
      return next();
    }

    // Check RoleAssignment for current user and company
    // Note: We need company_id for this check. Usually it comes from params or query or body.
    const companyId = req.params.companyId || req.body.company_id || req.query.company_id || req.params.id;
    
    // If no companyId is provided (e.g. POST /api/company), enforce permission globally
    // by checking any role assignment for this user.
    if (!companyId) {
      const anyAssignment = await RoleAssignment.findOne({ email: req.user.email });
      if (!anyAssignment || !anyAssignment.permissions.includes(permission)) {
        return res.status(403).json({ message: `Access denied. Missing permission: ${permission}` });
      }
      return next();
    }

    const assignment = await RoleAssignment.findOne({ 
      email: req.user.email, 
      company_id: companyId 
    });

    if (!assignment || !assignment.permissions.includes(permission)) {
      return res.status(403).json({ message: `Access denied. Missing permission: ${permission}` });
    }

    next();
  };
};

module.exports = { auth, superAdmin, checkPermission };
