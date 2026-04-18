const Conversation = require('../models/Conversation');
const vader = require('vader-sentiment');
const Groq = require('groq-sdk');
const { getAiResponse } = require('../utils/aiChatTest');

const sessionState = new Map();
const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;
const BASE_COUNSELOR_PROMPT = (userName = 'Friend') => (
  `You are a supportive, empathetic mental health assistant for ${userName}. `
  + 'Use conversation history to stay context-aware and natural. '
  + 'Keep greetings short and friendly when the user sends a short greeting. '
  + 'Do NOT provide grounding techniques, breathing exercises, or long coping protocols unless the detected sentiment is very negative or the user explicitly asks for help/coping techniques. '
  + 'If input is unclear or nonsensical, ask the user to rephrase politely.'
);

const SHORT_GREETINGS = new Set(['hi', 'hii', 'hiii', 'hello', 'hey', 'heyy', 'yo']);

const EMERGENCY_PATTERNS = [
  /\bsuicid(e|al)\b/i,
  /\bkill\s*myself\b/i,
  /\bend\s*my\s*life\b/i,
  /\bwant\s*to\s*die\b/i,
  /\bself\s*harm\b/i,
  /\bhurt\s*myself\b/i,
  /\bcut\s*myself\b/i,
  /\boverdose\b/i,
  /\bjump\s*off\b/i,
  /\bhang\s*myself\b/i,
  /\bnot\s*worth\s*living\b/i,
  /\bbetter\s*off\s*dead\b/i,
  /\bend\s*it\s*all\b/i,
  /\bcan('?t|not)\s*go\s*on\b/i,
  /\btaking\s*my\s*life\b/i,
  /\bi\s*(dont|don't)\s*want\s*to\s*live\b/i
];

// @desc    Generate AI chat response
// @route   POST /api/ai/chat
// @access  Private
const generateChatResponse = async (req, res) => {
  try {
    const { message, userName } = req.body;
    const userId = req.user.id;
    const safeUserName = sanitizeUserName(userName);

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    const normalizedMessage = message.replace(/\s+/g, ' ').trim();
    const sentiment = vader.SentimentIntensityAnalyzer.polarity_scores(normalizedMessage);
    const sentimentScore = adjustSentimentScore(normalizedMessage, Number(sentiment.compound) || 0);

    const state = getSessionState(userId);
    let type = 'normal';
    let reply;
    let category = 'general_help';
    let aiGenerated = false;

    if (isShortGreeting(normalizedMessage)) {
      reply = getGreetingResponse(safeUserName);
      type = 'greeting';
      category = 'greeting';
    } else if (isGibberishInput(normalizedMessage)) {
      reply = "I'm sorry, I didn't quite catch that. Could you please rephrase or tell me how you are feeling?";
      type = 'clarification';
      category = 'gibberish';
    } else if (isEmergencyMessage(normalizedMessage) || sentimentScore <= -0.85) {
      reply = getEmergencyResponse();
      type = 'emergency';
      category = 'crisis';
      state.lastDetectedCategory = 'crisis';
    } else {
      const history = await getRecentHistoryMessages(userId);
      try {
        const groqReply = await generateGroqReply(normalizedMessage, history, {
          userName: safeUserName,
          sentimentScore
        });
        reply = groqReply;
        category = 'groq';
        aiGenerated = true;
      } catch (error) {
        console.error('Groq fallback triggered:', error.message);
        const engineResult = getAiResponse(normalizedMessage, state);
        reply = replaceHardcodedName(engineResult.reply, safeUserName);
        category = engineResult.category || category;
      }
    }

    sessionState.set(userId, state);
    await saveConversation(userId, normalizedMessage, reply, type);

    return res.status(200).json({
      success: true,
      response: reply,
      type,
      aiGenerated,
      sentiment_score: sentimentScore,
      sentimentScore: sentimentScore,
      memoryUsed: true,
      category
    });
  } catch (error) {
    console.error('AI Chat Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate response',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get conversation history
// @route   GET /api/ai/conversation
// @access  Private
const getConversationHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit, 10) || 50;

    const conversations = await Conversation.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('userMessage aiResponse type createdAt');

    return res.status(200).json({
      success: true,
      conversations: conversations.reverse()
    });
  } catch (error) {
    console.error('Get Conversation Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve conversation history'
    });
  }
};

// @desc    Clear conversation history
// @route   DELETE /api/ai/conversation
// @access  Private
const clearConversationHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    await Conversation.deleteMany({ user: userId });

    sessionState.delete(userId);

    return res.status(200).json({
      success: true,
      message: 'Conversation history cleared successfully'
    });
  } catch (error) {
    console.error('Clear Conversation Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to clear conversation history'
    });
  }
};

function getSessionState(userId) {
  const existing = sessionState.get(userId);
  if (existing) return existing;

  const initial = {
    lastDetectedCategory: null,
    last3Replies: [],
    messageCount: 0
  };
  sessionState.set(userId, initial);
  return initial;
}

function isEmergencyMessage(message) {
  const normalized = (message || '').replace(/\s+/g, ' ').trim();
  return EMERGENCY_PATTERNS.some((pattern) => pattern.test(normalized));
}

function getEmergencyResponse() {
  return `I'm very concerned about what you've shared. Your life has value and there are people who want to help you right now.

Immediate Support:
- Crisis Helpline: 9152987821 (24/7)
- Emergency Services: 100
- AASRA: 022-27546669 (24x7 suicide prevention)

Please reach out to someone you trust or call one of these resources now. You are not alone.
If you're in immediate danger, call emergency services right away.`;
}

function sanitizeUserName(name) {
  const value = String(name || '').trim();
  if (!value) return 'Friend';
  return value.slice(0, 60);
}

function isShortGreeting(message) {
  const lowered = String(message || '').toLowerCase().trim();
  if (SHORT_GREETINGS.has(lowered)) return true;
  return /^(hi+|hello+|hey+)[!. ]*$/.test(lowered);
}

function getGreetingResponse(userName) {
  return `Hi ${userName}! How are you feeling today?`;
}

function isGibberishInput(message) {
  const text = String(message || '').trim().toLowerCase();
  if (!text) return false;
  if (text.length >= 3 && /^[a-z]+$/.test(text) && !/[aeiou]/.test(text) && text.length > 5) {
    return true;
  }
  const alphaOnly = text.replace(/[^a-z]/g, '');
  if (alphaOnly.length >= 6) {
    const uniqueChars = new Set(alphaOnly.split('')).size;
    if (uniqueChars <= 3) return true;
  }
  return /^(.)\1{4,}$/.test(alphaOnly) || /^[bcdfghjklmnpqrstvwxyz]{6,}$/.test(alphaOnly);
}

function replaceHardcodedName(reply, userName) {
  return String(reply || '').replace(/\bJanani\b/g, userName || 'Friend');
}

function adjustSentimentScore(message, baseScore) {
  const lowered = (message || '').toLowerCase();

  if (/\bi\s*(dont|don't)\s*want\s*to\s*live\b|\bkill\s*myself\b|\bwant\s*to\s*die\b|\bsuicid(e|al)\b/.test(lowered)) {
    return Math.min(baseScore, -0.92);
  }

  if (/(depress+|depresssi+on|hopeless|lonely|alone|no\s*body\s*talks|nobody\s*talks|no\s*one\s*talks|not\s*feeling\s*good)/.test(lowered)) {
    return Math.min(baseScore, -0.45);
  }

  return baseScore;
}

async function saveConversation(userId, userMessage, aiResponse, type = 'normal') {
  try {
    const conversation = new Conversation({
      user: userId,
      userMessage,
      aiResponse,
      type,
      metadata: {
        timestamp: new Date(),
        responseLength: aiResponse.length
      }
    });

    await conversation.save();
  } catch (error) {
    console.error('Save Conversation Error:', error);
  }
}

async function getRecentHistoryMessages(userId) {
  const recentConversations = await Conversation.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(6)
    .select('userMessage aiResponse');

  const chronological = recentConversations.reverse();
  const flattened = [];

  for (const item of chronological) {
    if (item.userMessage) {
      flattened.push({ role: 'user', content: String(item.userMessage).trim() });
    }
    if (item.aiResponse) {
      flattened.push({ role: 'assistant', content: String(item.aiResponse).trim() });
    }
  }

  return flattened.filter((m) => m.content.length > 0).slice(-6);
}

async function generateGroqReply(message, history, meta = {}) {
  if (!groq) {
    throw new Error('GROQ_API_KEY is missing');
  }

  const userName = sanitizeUserName(meta.userName);
  const sentimentScore = Number(meta.sentimentScore || 0);
  const allowCopingTechniques = sentimentScore <= -0.6;
  const behaviorInstruction = allowCopingTechniques
    ? 'Detected sentiment is very negative. You may include concise coping techniques if relevant.'
    : 'Do not include grounding or breathing techniques unless the user explicitly asks for coping help.';

  const messages = [
    { role: 'system', content: `${BASE_COUNSELOR_PROMPT(userName)} ${behaviorInstruction}` },
    ...(history || []),
    { role: 'user', content: message }
  ];

  const completion = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages,
    temperature: 0.7
  });

  const output = completion?.choices?.[0]?.message?.content?.trim();
  if (!output) {
    throw new Error('Empty Groq response');
  }

  return output;
}

module.exports = {
  generateChatResponse,
  getConversationHistory,
  clearConversationHistory
};
