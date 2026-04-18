const express = require('express');
const multer = require('multer');
const { protect } = require('../middleware/authMiddleware');
const {
  saveMood,
  getMoodHistory,
  getRecentMood,
  analyzeMood
} = require('../controllers/moodController');

const router = express.Router();

// =====================
// Configure multer for memory storage (image upload)
// =====================
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max file size
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.mimetype)) {
      const error = new Error('Invalid file type. Only JPG, JPEG, PNG are allowed.');
      error.status = 400;
      return cb(error);
    }
    cb(null, true);
  }
});

// =====================
// Protect all mood routes with authentication middleware
// =====================
router.use(protect);

// =====================
// Mood tracking routes
// =====================

// Save a manual mood entry
router.post('/', saveMood);

// Get mood history (paginated)
router.get('/', getMoodHistory);

// Get most recent mood
router.get('/recent', getRecentMood);

// Analyze uploaded image for mood using ML service
router.post('/analyze', upload.single('image'), analyzeMood);

// =====================
// Export the router
// =====================
module.exports = router;