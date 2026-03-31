const express = require("express");
const router = express.Router();
const User = require("../models/User");
const jwt = require("jsonwebtoken");

const SECRET_KEY = process.env.SECRET_KEY || "MY_SUPER_SECRET_KEY";

// --------------------- Verify Email ---------------------
router.post("/verify-email", async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() });
  res.json({ exists: !!user });
});

// --------------------- Change Password ---------------------
router.post("/change-password", async (req, res) => {
  const { email, newPassword } = req.body;

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.json({ message: "User not found" });

    if (newPassword.length < 8) {
      return res.json({ message: "Password must be at least 8 characters" });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: "Password updated successfully ✅" });
  } catch (err) {
    res.status(500).json({ message: "Error updating password" });
  }
});

const RoleAssignment = require("../models/RoleAssignment");

// --------------------- Login ---------------------
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Validate inputs
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: "Invalid email or password" });
    }

    // 1. Try to find in Super Admin collection (User)
    let user = await User.findOne({ email: email.toLowerCase() });
    let role = "";
    
    if (user) {
      // Check password
      if (user.password !== password) {
        return res.status(401).json({ success: false, message: "Invalid email or password" });
      }
      role = user.role || "super-admin";
    } else {
      // 2. Try to find in Role Assignments (Staff/Users)
      const assignment = await RoleAssignment.findOne({ email: email.toLowerCase() });
      if (!assignment) {
        return res.status(401).json({ success: false, message: "Invalid email or password" });
      }
      if (assignment.password !== password) {
        return res.status(401).json({ success: false, message: "Invalid email or password" });
      }
      
      // Create a mock user object for the token
      user = {
        _id: assignment._id,
        firstName: assignment.firstName,
        lastName: assignment.lastName,
        email: assignment.email,
        role: assignment.role
      };
      role = assignment.role;
    }

    const wasFirstLogin = user.firstLogin !== false;

    const token = jwt.sign(
      { id: user._id, email: user.email },
      SECRET_KEY,
      { expiresIn: "1d" }
    );

    if (user.save && wasFirstLogin) {
      user.firstLogin = false;
      await user.save();
    }

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: role,
      firstLogin: wasFirstLogin,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Server error during login" });
  }
});

// --------------------- Register ---------------------
router.post("/register", async (req, res) => {
  try {
    const { email, password, firstName, lastName, phoneNumber, fullAddress, city, state, pincode } = req.body;

    if (!password || password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    if (!firstName || !lastName) {
      return res.status(400).json({ message: "First name and last name are required" });
    }

    if (!phoneNumber) {
      return res.status(400).json({ message: "Phone number is required" });
    }

    if (!fullAddress || !city || !state || !pincode) {
      return res.status(400).json({ message: "Full address, city, state, and pincode are required" });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) return res.status(400).json({ message: "User already exists" });

    const newUser = await User.create({
      firstName,
      lastName,
      email: email.toLowerCase(),
      phoneNumber,
      fullAddress,
      city,
      state,
      pincode,
      password, // Note: In a real app, you'd hash this. But keeping user's logic for now unless requested.
    });

    res.status(200).json({ success: true, user: newUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
});

module.exports = router;
