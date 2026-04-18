const Mood = require('../models/Mood');
const axios = require('axios');
const FormData = require('form-data');

// =====================
// Save mood manually or from AI
// =====================
exports.saveMood = async (req, res) => {
  try {
    const { value, label, notes, capturedVia } = req.body;

    const mood = await Mood.create({
      user: req.user.id,
      value,
      label,
      notes: notes || '',
      capturedVia: capturedVia || 'manual'
    });

    res.status(201).json({
      success: true,
      data: mood
    });
  } catch (error) {
    console.error('Error saving mood:', error);
    res.status(500).json({
      success: false,
      message: 'Could not save mood data',
      error: error.message
    });
  }
};

// =====================
// Get mood history with pagination
// =====================
exports.getMoodHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 30;
    const skip = (page - 1) * limit;

    const moods = await Mood.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Mood.countDocuments({ user: req.user.id });

    res.status(200).json({
      success: true,
      count: moods.length,
      total,
      pages: Math.ceil(total / limit),
      data: moods
    });
  } catch (error) {
    console.error('Error fetching mood history:', error);
    res.status(500).json({
      success: false,
      message: 'Could not retrieve mood history',
      error: error.message
    });
  }
};

// =====================
// Get most recent mood
// =====================
exports.getRecentMood = async (req, res) => {
  try {
    const recentMood = await Mood.findOne({ user: req.user.id })
      .sort({ createdAt: -1 });

    if (!recentMood) {
      return res.status(404).json({
        success: false,
        message: 'No mood entries found'
      });
    }

    const twoHoursAgo = new Date();
    twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);

    const isRecent = recentMood.createdAt > twoHoursAgo;

    res.status(200).json({
      success: true,
      data: recentMood,
      isRecent
    });
  } catch (error) {
    console.error('Error fetching recent mood:', error);
    res.status(500).json({
      success: false,
      message: 'Could not retrieve recent mood',
      error: error.message
    });
  }
};

// =====================
// Analyze mood from uploaded image using ML service
// =====================
exports.analyzeMood = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    // Prepare FormData to send to Flask ML service
    const formData = new FormData();
    formData.append('image', req.file.buffer, {
      filename: req.file.originalname || 'capture.jpg',
      contentType: req.file.mimetype
    });

    const mlUrl = process.env.ML_SERVICE_URL || 'http://localhost:5055/predict_emotion';
    const mlTimeoutMs = parseInt(process.env.ML_SERVICE_TIMEOUT_MS || '180000', 10);

    let mlResponse;
    try {
      mlResponse = await axios.post(mlUrl, formData, {
        headers: {
          ...formData.getHeaders(),
          'Content-Type': 'multipart/form-data'
        },
        timeout: mlTimeoutMs
      });
    } catch (mlError) {
      console.error('ML service call failed:', mlError.message);
      mlResponse = null;
    }

    let moodValue;
    let moodLabel;

    const labelByName = {
      Angry: 0,
      Disgust: 1,
      Fear: 2,
      Happy: 3,
      Neutral: 4,
      Sad: 5,
      Surprise: 6
    };

    if (mlResponse && mlResponse.data && mlResponse.data.mood !== undefined) {
      const rawMood = mlResponse.data.mood;
      moodLabel = mlResponse.data.moodLabel;
      if (typeof rawMood === 'string') {
        moodLabel = moodLabel || rawMood;
        moodValue = labelByName[rawMood] ?? 4;
      } else {
        moodValue = rawMood;
        if (!moodLabel && typeof moodValue === 'number') {
          const names = ['Angry', 'Disgust', 'Fear', 'Happy', 'Neutral', 'Sad', 'Surprise'];
          moodLabel = names[moodValue] ?? 'Neutral';
        }
      }
    } else {
      // Fallback random mood
      const moodLabels = ['Angry', 'Disgust', 'Fear', 'Happy', 'Neutral', 'Sad', 'Surprise'];
      moodValue = Math.floor(Math.random() * 7);
      moodLabel = moodLabels[moodValue];
    }

    const moodNames = ['Angry', 'Disgust', 'Fear', 'Happy', 'Neutral', 'Sad', 'Surprise'];
    if (typeof moodLabel !== 'string' || !moodLabel) {
      moodLabel = moodNames[Number(moodValue)] ?? 'Neutral';
    }

    // Save mood in database
    const mood = await Mood.create({
      user: req.user.id,
      value: moodValue,
      label: moodLabel,
      capturedVia: 'ai'
    });

    res.status(200).json({
      success: true,
      data: {
        mood: moodValue,
        moodLabel,
        id: mood._id,
        createdAt: mood.createdAt
      },
      note: (!mlResponse) ? 'ML service unavailable, used fallback random mood detection' : undefined
    });

  } catch (error) {
    console.error('Error analyzing mood:', error);
    res.status(500).json({
      success: false,
      message: 'Could not analyze mood from image',
      error: error.message
    });
  }
};