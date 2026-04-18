const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');


// Helper: Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

// ================= REGISTER =================
const register = async (req, res) => {
  try {
    const { firstName, lastName, email, password, mobile, dob } = req.body;

    if (!firstName || !lastName || !email || !password || !mobile || !dob) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ success: false, message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      mobile,
      dob,
      isVerified: true
    });

    const token = generateToken(user._id);

    const userResponse = {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      mobile: user.mobile,
      dob: user.dob,
      role: user.role
    };

    res.status(201).json({ success: true, token, user: userResponse });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ================= LOGIN =================
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log("Login request body:", req.body);
    if (!email || !password) return res.status(400).json({ success: false, message: "Email and password are required" });

    // ⚠️ Explicitly select password because select:false in schema
    const user = await User.findOne({ email }).select('+password');
    console.log("User from DB:", user);
    if (!user) return res.status(400).json({ success: false, message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    console.log("Password match result:", isMatch);
    if (!isMatch) return res.status(400).json({ success: false, message: "Invalid credentials" });

    const token = generateToken(user._id);

    const userResponse = {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      mobile: user.mobile,
      dob: user.dob,
      role: user.role
    };

    res.status(200).json({ success: true, token, user: userResponse });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ================= DUMMY FUNCTIONS =================
const verifyOTP = async (req, res) => res.json({ success: true, message: "OTP verified (dummy)" });
const resendOTP = async (req, res) => res.json({ success: true, message: "OTP resent (dummy)" });
const forgotPassword = async (req, res) => res.json({ success: true, message: "Forgot password working (dummy)" });
const resetPassword = async (req, res) => res.json({ success: true, message: "Reset password working (dummy)" });

module.exports = { register, verifyOTP, resendOTP, login, forgotPassword, resetPassword };