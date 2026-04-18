const vader = require('vader-sentiment');

const CRISIS_PATTERNS = [
  /\bi\s*(dont|don't)\s*want\s*to\s*live\b/i,
  /\bwant\s*to\s*die\b/i,
  /\bkill\s*myself\b/i,
  /\bend\s*my\s*life\b/i,
  /\bbetter\s*off\s*dead\b/i,
  /\bsuicid(e|al)\b/i,
  /\bself\s*harm\b/i,
  /\bhurt\s*myself\b/i,
  /\bcan('?t|not)\s*go\s*on\b/i,
  /\btaking\s*my\s*life\b/i
];

const RESPONSES = {
  greetings: Array(10).fill('Hi Janani! I am your Soul Space assistant. How can I help you today?'),
  exams: [
    'Exam pressure is heavy, but manageable. Try Pomodoro: 25 minutes focus + 5 minutes break, repeated 4 times.',
    'If exam fear is rising, use 4-7-8 breathing for one minute, then start with your easiest chapter to build momentum.',
    'Use active recall instead of re-reading: close notes and write what you remember, then fill gaps.',
    'Create an A/B/C topic list. Finish A topics first today, then move to B only if energy allows.',
    'Try one past-paper question now. Small completion lowers anxiety faster than planning alone.',
    'When overwhelmed, do a 10-minute sprint on one concept and stop. Progress beats perfection.',
    'Night-before stress: pack essentials, avoid late cramming, and prioritize 7+ hours sleep.',
    'Use a stress dump page for 2 minutes, then begin your first revision block immediately.',
    'Try teach-back: explain the topic out loud in simple words to detect weak spots quickly.',
    'If motivation is low, do minimum mode: one Pomodoro + one revision test. Keep the streak alive.'
  ],
  anxiety: [
    'Anxiety feels intense, but your body can settle. Do box breathing: inhale 4, hold 4, exhale 4, hold 4.',
    'Use 5-4-3-2-1 grounding now: 5 things you see, 4 touch, 3 hear, 2 smell, 1 taste.',
    'Write one fear and one likely reality beside it. This helps your brain move from panic to balance.',
    'Try unclenching jaw, dropping shoulders, and lengthening exhale for one minute.',
    'Set a 10-minute worry timer, then switch to one concrete action in your control.',
    'Drink water slowly and count 10 calm breaths to reduce nervous-system overload.',
    'Say: "I am having an anxious thought, not a fact." This creates useful distance.',
    'Use a grounding object (pen, ring, cloth) and describe texture for 30 seconds.',
    'Break tasks into now/next/later. Only "now" matters in this moment.',
    'You are not alone. Tell me the exact trigger so I can give a sharper coping step.'
  ],
  stress: [
    'That sounds really heavy. Stress can feel exhausting, especially when expectations keep building. Start with a two-list reset: what I control, what I cannot.',
    'Try a 90-second physiological sigh pattern to calm quickly, then return to one small task.',
    'Use time-blocking for 60 minutes: 40 minutes work, 10 minutes review, 10 minutes break.',
    'If overloaded, pick one must-do and two nice-to-do items. Keep scope realistic.',
    'Do a posture reset and 5 slow breaths before continuing. Body calm improves focus.',
    'Use a 2-minute brain dump, then pick the single highest-impact action.',
    'Protect energy: no multitasking for the next 25 minutes.',
    'When mind spirals, ask: "What is the next useful step?" and do only that.',
    'Try short movement now: 2 minutes stretch or walk to release stress chemistry.',
    'Tell me your top stress source and I will help you build a micro-plan.'
  ],
  family_pressure: [
    'I hear you. Family pressure around studies can feel painful and lonely. Your feelings are valid. Start with one calming breath cycle, then write one boundary sentence you can use respectfully.',
    'That sounds difficult. When family expectations feel too intense, try saying: "I am trying sincerely, and I need a calmer space to perform better."',
    'You are carrying a lot. Family pressure can create guilt and fear together. Try a 10-minute reset: breathe, drink water, and choose one realistic study task only.',
    'Thank you for sharing this. You deserve support, not just pressure. If possible, talk to one trusted family member using "I feel" statements instead of arguments.',
    'It makes sense that you feel low with this pressure. Start small: one Pomodoro, then a short break, and remind yourself your worth is bigger than marks.',
    'I hear how stressful this is. You can try this script: "I understand your concern, but constant pressure is affecting me. Encouragement will help me more."',
    'Family study pressure can feel overwhelming. Ground first with 5 slow breaths, then list what is in your control today and do only the first step.',
    'You are not weak for feeling this. Pressure from home can deeply affect mood. Try sharing a clear study plan with your family to reduce repeated conflict.',
    'I am glad you told me this. When pressure rises, protect your mind: short study blocks, hydration, and 5-minute walks between sessions.',
    'This is hard, and you are doing your best. If you want, I can help you build a simple one-day plan you can show your family.'
  ],
  depression: [
    'I am really glad you shared this. Feeling depressed can be heavy. Start tiny: drink water, open a window, and take five slow breaths.',
    'Thank you for being honest about this. When mood is low, try minimum goals: eat something light, wash your face, and step outside for 2 minutes.',
    'That sounds painful, and you do not have to carry it alone. Try journaling: "What hurts most right now, and what support do I need today?"',
    'You matter deeply. If your thoughts feel unsafe at any point, please contact a trusted person and a helpline immediately.',
    'When everything feels too much, use the next-10-minutes method: choose one safe, simple action for just ten minutes.',
    'Place one hand on your chest and breathe out slowly for 60 seconds. This can reduce emotional overload and body tension.',
    'Try a compassion baseline for one hour: no self-attack language, only kind and factual self-talk.',
    'If sleep is affected, start a gentle wind-down 30 minutes before bed with no phone and low lights.',
    'Tonight, try a small mood log: trigger -> thought -> feeling -> action. It helps make patterns clearer.',
    'You are not alone in this. If you want, I can help you create a very simple safety and support plan now.'
  ],
  loneliness: [
    'I hear you. Feeling lonely can hurt deeply, and your feelings are valid. Start with one gentle step: message one trusted person with a simple "Can we talk for 10 minutes?"',
    'That sounds really painful. When no one feels available, loneliness becomes heavy. Try a short grounding break, then reach out to one person you feel safest with.',
    'You deserve connection and care. If talking feels hard, send a short text: "I am having a rough day and could use company."',
    'I am glad you shared this. Loneliness often tells us we are alone forever, but that feeling can change. Let us plan one small social step for today.',
    'No one talking to you can feel exhausting emotionally. Please be kind to yourself and start with one small action: call, text, or voice note to one person.',
    'You are not a burden for needing connection. Try joining one supportive group or community space online/offline for even 10 minutes today.',
    'Thank you for opening up. Would you like help writing a message to someone you trust right now?',
    'I hear the pain in this. Take 5 slow breaths, then tell me who feels safest to contact first so we can make that step easier.',
    'Loneliness is real and hard, but you do not have to handle it alone. We can create a tiny connection plan together.',
    'You matter. If you want, I can help you with a 3-step plan for tonight: self-care, one message, and one calming activity.'
  ],
  crisis: [
    'I am really concerned about your safety. Please call a crisis helpline now: 9152987821 or AASRA 022-27546669.',
    'Your life has value. If you are in immediate danger, call Emergency 100 right now and stay with someone trusted.',
    'I am here with you. Please contact 9152987821 immediately and tell a trusted person you need urgent support.',
    'You deserve immediate care. Reach AASRA at 022-27546669 now and avoid being alone.',
    'Please seek urgent support right now: call 100 or your nearest emergency service and stay connected to someone safe.',
    'I hear your pain. Call a crisis service now: 9152987821. You do not have to carry this alone.',
    'Please pause and reach live help immediately: AASRA 022-27546669 or emergency 100.',
    'Your safety comes first. Contact emergency support now and keep your phone with you.',
    'You matter deeply. Please call a crisis line this moment: 9152987821.',
    'I am taking this seriously. Get urgent human help now through 100 or AASRA 022-27546669.'
  ],
  general_help: [
    'Let us make this practical: define the problem in one line, then choose a 10-minute first step.',
    'Try three slow breaths, then tell me what feels most urgent right now.',
    'Use next best step thinking: what is one action that reduces stress by 10 percent?',
    'Write what you can control today and commit to one item now.',
    'If your mind feels noisy, do a 2-minute thought dump and pick one task.',
    'Try this prompt: If my friend faced this, what advice would I give?',
    'Shrink the target: one small completed action builds momentum.',
    'Use a focused timer for 15 minutes, then reassess calmly.',
    'I can help structure this. Share your exact situation and deadline.',
    'You are doing the right thing by reaching out. What support type do you need: calm, plan, or motivation?'
  ],
  gibberish: [
    'I want to support you well, and I could not fully understand that message. Could you type it again in a simple sentence?',
    'I may have missed what you meant. Share how you are feeling in a few words, and I will respond clearly.',
    'No problem, let us try again. Tell me: are you feeling stressed, sad, anxious, or something else right now?',
    'I am here with you. Could you rephrase that message so I can give the right support?',
    'I did not catch that clearly. Please type one short line about what is bothering you most right now.',
    'Thanks for staying with me. Try this format: "I feel ___ because ___."',
    'I want to help, but that looked unclear. Could you send your message once more in plain words?',
    'I may have misunderstood. If easier, choose one word: anxious, low, overwhelmed, numb, or okay.',
    'Let us reset gently. Tell me what happened today in one sentence.',
    'I am listening. Please retype your concern so I can respond in the best way for you.'
  ]
};

function normalizeText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function isGreeting(text) {
  const lowered = normalizeText(text).toLowerCase();
  return /^(h+i+|he+y+|hello+)\b/.test(lowered);
}

function isCrisisMessage(text) {
  const normalized = normalizeText(text);
  return CRISIS_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isGibberish(text) {
  const cleaned = normalizeText(text).toLowerCase();
  if (!cleaned) return true;
  if (cleaned.length <= 2) return true;

  const words = cleaned.split(' ').filter(Boolean);
  const hasKnownWord = words.some((word) =>
    /(i|am|feel|feeling|sad|depressed|stress|stressed|anxiety|anxious|help|exam|hello|hi|hey)/.test(word)
  );
  if (hasKnownWord) return false;

  return /[bcdfghjklmnpqrstvwxyz]{6,}/i.test(cleaned) ||
    words.every((word) => word.length >= 3 && !/[aeiou]/i.test(word));
}

function detectCategory(text, sessionContext) {
  const lowered = text.toLowerCase();
  const hasPronoun = /\b(this|it|that)\b/.test(lowered);

  if (hasPronoun && sessionContext.lastDetectedCategory) {
    return sessionContext.lastDetectedCategory;
  }

  if (isCrisisMessage(text)) return 'crisis';
  if (/(lonely|alone|no\s*body\s*talks|nobody\s*talks|no\s*one\s*talks|no\s*friends|isolated)/.test(lowered)) {
    return 'loneliness';
  }
  if (/(becoming\s*mental|going\s*crazy|losing\s*my\s*mind|i\s*am\s*broken|i\s*am\s*useless)/.test(lowered)) {
    return 'depression';
  }
  if (/(anxious|axious|anxiety|panic|overwhelm|overwhelmed|nervous|fear|overthink|worried)/.test(lowered)) {
    return 'anxiety';
  }
  if (/(stress|stressed|pressure|burnout|relive\s*from\s*stress|relief\s*from\s*stress)/.test(lowered)) {
    return 'stress';
  }
  if (/^(hi+|hey+|hello+)\b/.test(lowered) && lowered.trim().split(/\s+/).length <= 3) return 'greetings';
  if (/(family|parents?|mother|father|mom|dad|home)/.test(lowered) && /(pressure|study|marks|grade|exam|stress|not feeling good)/.test(lowered)) {
    return 'family_pressure';
  }
  if (/exam|test|study|grade|marks|semester|university|revision/.test(lowered)) return 'exams';
  if (/(depress+|depression|depresssi+on|hopeless|empty|numb|worthless|sad|cry|not\s*feeling\s*good)/.test(lowered)) return 'depression';
  if (isGibberish(lowered)) return 'gibberish';
  return 'general_help';
}

function pickNonRepeatingResponse(category, sessionContext) {
  const list = RESPONSES[category] || RESPONSES.general_help;
  const last3 = Array.isArray(sessionContext.last3Replies) ? sessionContext.last3Replies : [];

  let choice = list[Math.floor(Math.random() * list.length)];
  let guard = 0;
  while (last3.includes(choice) && guard < 50) {
    choice = list[Math.floor(Math.random() * list.length)];
    guard += 1;
  }
  return choice;
}

function updateSessionMemory(sessionContext, category, reply) {
  sessionContext.lastDetectedCategory = category;
  if (!Array.isArray(sessionContext.last3Replies)) sessionContext.last3Replies = [];
  sessionContext.last3Replies.push(reply);
  if (sessionContext.last3Replies.length > 3) sessionContext.last3Replies.shift();
  sessionContext.messageCount = (sessionContext.messageCount || 0) + 1;
}

function getAiResponse(userMessage, sessionContext = {}) {
  const normalized = normalizeText(userMessage);
  const score = vader.SentimentIntensityAnalyzer.polarity_scores(normalized).compound;

  if (!sessionContext.messageCount && isGreeting(normalized)) {
    const greeting = 'Hi Janani! I am your Soul Space assistant. How can I help you today?';
    updateSessionMemory(sessionContext, 'greetings', greeting);
    return { reply: greeting, sentiment_score: score, category: 'greetings' };
  }

  let category = detectCategory(normalized, sessionContext);
  if (score <= -0.75 && category !== 'greetings') {
    category = 'crisis';
  }

  const reply = pickNonRepeatingResponse(category, sessionContext);
  updateSessionMemory(sessionContext, category, reply);

  return { reply, sentiment_score: score, category };
}

module.exports = { getAiResponse };
