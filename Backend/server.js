const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

// Debug logs
console.log('Environment variables loaded:');
console.log('PORT:', process.env.PORT || 'Not set');
console.log('GROQ_API_KEY exists:', !!process.env.GROQ_API_KEY);

const authRoutes = require('./routes/authRoutes');
const moodRoutes = require('./routes/moodRoutes');
const profileRoutes = require('./routes/profileRoutes');
const settingRoutes = require('./routes/settingRoutes');
const aiRoutes = require('./routes/aiRoutes');
const mentalHealthRoutes = require('./routes/mentalHealthRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');

const app = express();

// =====================
// FIXED CORS CONFIGURATION
// =====================
const allowedOrigins = new Set([
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5500',
  'http://localhost:5501',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5500',
  'http://127.0.0.1:5501'
]);

app.use(cors({
  origin(origin, callback) {
    // Allow server-to-server calls, Postman, and local file:// pages.
    if (!origin || origin === 'null') {
      return callback(null, true);
    }
    if (allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true
}));

app.use(express.json());

// MongoDB connection
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
  }
};
connectDB();

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/mood', moodRoutes);
app.use('/api/user/profile', profileRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/mental-health', mentalHealthRoutes);
app.use('/api/appointments', appointmentRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});