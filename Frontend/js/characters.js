// Global Character System for Soul Space
const characterProfiles = {
    aya: {
        id: 'aya',
        name: 'Aya',
        role: 'Mindful Guide',
        icon: 'fa-feather-alt',
        color: 'linear-gradient(135deg, #7c3aed, #22d3ee)',
        bio: 'A gentle companion who helps you reflect and breathe through difficult moments.',
        greeting: (userName = 'Friend') => `I'm Aya, your mindful guide. Let's navigate this journey together, ${userName}.`,
        moodMessage: 'I am here to help you understand your emotions with calm and compassion.',
        dashboardMessage: 'Let us take a moment to focus on what truly matters in your wellness.',
        emoji: '🌸'
    },
    arjun: {
        id: 'arjun',
        name: 'Arjun',
        role: 'Empathy Coach',
        icon: 'fa-hand-holding-heart',
        color: 'linear-gradient(135deg, #0ea5e9, #14b8a6)',
        bio: 'A warm friend who listens closely and offers caring support.',
        greeting: (userName = 'Friend') => `Hey ${userName}! I'm Arjun. I'm here to listen and support you every step of the way.`,
        moodMessage: 'Your feelings matter. Let me help you understand what you are experiencing.',
        dashboardMessage: 'Welcome! Together, we will build a stronger, healthier you.',
        emoji: '💙'
    },
    neha: {
        id: 'neha',
        name: 'Neha',
        role: 'Growth Partner',
        icon: 'fa-seedling',
        color: 'linear-gradient(135deg, #22c55e, #84cc16)',
        bio: 'A motivated partner who helps you take gentle steps forward.',
        greeting: (userName = 'Friend') => `Welcome ${userName}! I'm Neha. Let's grow together and unlock your potential!`,
        moodMessage: 'Every emotion is a chance to learn about yourself. Let us explore together.',
        dashboardMessage: 'You are doing great! Let us keep building on your progress.',
        emoji: '🌱'
    },
    sam: {
        id: 'sam',
        name: 'Sam',
        role: 'Joy Creator',
        icon: 'fa-star',
        color: 'linear-gradient(135deg, #f97316, #ec4899)',
        bio: 'An energetic companion who brings positivity and encouragement.',
        greeting: (userName = 'Friend') => `Heyy ${userName}! I'm Sam, your joy creator. Let's make today amazing!`,
        moodMessage: 'Let us find the silver lining and celebrate your resilience today!',
        dashboardMessage: 'You have got this! Let us make today full of positive moments.',
        emoji: '✨'
    }
};

let currentCharacter = 'aya';
let currentCharacterData = characterProfiles.aya;

// Set character for current page
function setCharacter(characterKey, event = null) {
    if (event) {
        event.preventDefault();
    }
    
    if (!characterProfiles[characterKey]) return;
    
    currentCharacter = characterKey;
    currentCharacterData = characterProfiles[characterKey];
    
    // Save to localStorage
    localStorage.setItem('selectedCharacter', characterKey);
    
    // Update all character displays on current page
    updateCharacterDisplay(characterKey);
    
    // Show feedback
    showCharacterSelectedNotification(characterKey);
}

// Set character specifically for mood page
function setMoodCharacter(characterKey) {
    setCharacter(characterKey);
    
    // Update mood-specific messages
    const moodTitle = document.getElementById('mood-companion-title');
    const moodMsg = document.getElementById('mood-companion-msg');
    
    if (moodTitle) {
        moodTitle.textContent = `${currentCharacterData.name}'s Mood Check-in`;
    }
    if (moodMsg) {
        moodMsg.textContent = currentCharacterData.moodMessage;
    }
}

// Update all character visuals on page
function updateCharacterDisplay(characterKey) {
    const charData = characterProfiles[characterKey];
    
    // Update character option buttons
    const allOptions = document.querySelectorAll('.character-option');
    allOptions.forEach(opt => {
        opt.classList.remove('active');
        if (opt.dataset.character === characterKey) {
            opt.classList.add('active');
        }
    });
    
    // Update character avatars
    const avatars = document.querySelectorAll('[class*="character-avatar"]');
    avatars.forEach(avatar => {
        // Remove all color classes
        avatar.className = avatar.className.replace(/\s*(aya|arjun|neha|sam)-avatar/g, '');
        // Add current character class
        avatar.classList.add(`${characterKey}-avatar`);
        avatar.style.background = charData.color;
    });
    
    // Update greeting messages
    const greetingMsg = document.getElementById('character-greeting-msg');
    const welcomeMsg = document.getElementById('companion-msg');
    const compassionMsg = document.getElementById('companion-intro');
    
    const userName = document.getElementById('user-name')?.textContent || 'Friend';
    
    if (greetingMsg) {
        greetingMsg.textContent = charData.dashboardMessage;
    }
    if (welcomeMsg) {
        welcomeMsg.textContent = charData.bio;
    }
    if (compassionMsg) {
        compassionMsg.textContent = charData.bio;
    }
    
    // Update page title if present
    const companionName = document.getElementById('companion-name');
    if (companionName) {
        companionName.textContent = charData.name;
    }
}

// Show notification when character is selected
function showCharacterSelectedNotification(characterKey) {
    const charData = characterProfiles[characterKey];
    const notificationContainer = document.getElementById('notifications-container');
    
    if (!notificationContainer) return;
    
    const notification = document.createElement('div');
    notification.className = 'character-notification';
    notification.style.cssText = `
        background: ${charData.color};
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        margin-bottom: 12px;
        animation: slideInDown 0.3s ease;
        display: flex;
        align-items: center;
        gap: 12px;
        font-weight: 500;
    `;
    notification.innerHTML = `
        <i class="fas ${charData.icon}" style="font-size: 18px;"></i>
        <span>${charData.emoji} ${charData.name} is now your guide!</span>
    `;
    
    notificationContainer.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutUp 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Initialize character on page load
function initializeCharacter() {
    // Load saved character or default to Aya
    const savedCharacter = localStorage.getItem('selectedCharacter') || 'aya';
    setCharacter(savedCharacter);
}

// Load character on page load
document.addEventListener('DOMContentLoaded', initializeCharacter);

// Helper function to get character greeting
function getCharacterGreeting(userName = 'Friend') {
    return currentCharacterData.greeting(userName);
}

// Helper function to get character message
function getCharacterMessage(type = 'dashboard') {
    switch (type) {
        case 'mood':
            return currentCharacterData.moodMessage;
        case 'greeting':
            return currentCharacterData.greeting();
        case 'dashboard':
        default:
            return currentCharacterData.dashboardMessage;
    }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        characterProfiles,
        setCharacter,
        setMoodCharacter,
        updateCharacterDisplay,
        getCharacterGreeting,
        getCharacterMessage
    };
}
