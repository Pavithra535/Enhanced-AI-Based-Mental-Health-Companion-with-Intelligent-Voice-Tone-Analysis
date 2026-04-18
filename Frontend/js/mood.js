document.addEventListener('DOMContentLoaded', function() {
    // Check if user is logged in
    const authToken = localStorage.getItem('authToken');
    if (!authToken) {
        // Redirect to login page if not logged in
        window.location.href = 'index.html';
        return;
    }
    
    // Get user data from localStorage
    const userData = JSON.parse(localStorage.getItem('userData') || '{}');
    
    // Update profile information
    updateProfileInfo(userData);
    
    // Set up authentication header for API requests
    const headers = {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
    };
    
    // Elements for AI mood detection
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const captureBtn = document.getElementById('captureBtn');
    const countdown = document.getElementById('countdown');
    const result = document.getElementById('result');
    const ctx = canvas.getContext('2d');
    
    // Set canvas dimensions
    canvas.width = 640;
    canvas.height = 480;
    
    // Elements for manual mood selection
    const moodOptions = document.querySelectorAll('.mood-option');
    const saveManualMoodBtn = document.getElementById('save-manual-mood-btn');
    const moodNotes = document.getElementById('mood-notes');
    
    // Variables for tracking selected mood
    let selectedMood = null;
    let mediaStream = null;
    
    // Mood data for the chart
    let moodHistory = [];
    let moodChart = null;
    let filteredMoodHistory = [];
    
    // Emoji map for moods
    const moodEmojis = {
        'Angry': '😠',
        'Disgust': '🤢',
        'Fear': '😨',
        'Happy': '😄',
        'Neutral': '😐',
        'Sad': '😢',
        'Surprise': '😲'
    };
    
    // API Configuration - will be loaded from server
    let apiConfig = {
        backendApiUrl: 'http://localhost:5001', // Default fallback
        mlServiceUrl: 'http://localhost:5000/predict_emotion' // Default fallback
    };
    
    // Initialize the page
    initializePage();
    
    // Set up mood options selection
    moodOptions.forEach(option => {
        option.addEventListener('click', function() {
            // Remove selected class from all options
            moodOptions.forEach(opt => opt.classList.remove('selected'));
            
            // Add selected class to clicked option
            this.classList.add('selected');
            
            // Update selected mood
            selectedMood = {
                value: parseInt(this.getAttribute('data-mood')),
                label: this.getAttribute('data-label')
            };
        });
    });
    
    // Save manual mood button click handler
    saveManualMoodBtn.addEventListener('click', function() {
        if (!selectedMood) {
            showWarning('Please select a mood before saving.');
            return;
        }
        
        const notes = moodNotes.value;
        
        // Save the mood to the server
        saveManualMood(selectedMood.value, selectedMood.label, notes);
    });
    
    // Capture mood with AI button click handler
    captureBtn.addEventListener('click', function() {
        startMoodCapture();
    });
    
    // Function to initialize the page
    async function initializePage() {
        // Load API configuration from frontend environment config
        loadApiConfig();
        
        // Check if user has recently tracked their mood
        checkRecentMood();
        
        // Load mood history
        loadMoodHistory();
        
        // Initialize chart
        initMoodChart();
    }
    
    // Function to load API configuration from frontend environment config
    function loadApiConfig() {
        if (window.ENV_CONFIG) {
            apiConfig.backendApiUrl = window.ENV_CONFIG.backendApiUrl;
            apiConfig.mlServiceUrl = window.ENV_CONFIG.mlServiceUrl;
            console.log('API configuration loaded from environment:', apiConfig);
        } else {
            console.warn('Environment config not available, using defaults:', apiConfig);
        }
    }
    
    // Function to update profile information
    function updateProfileInfo(userData) {
        if (userData) {
            const fullName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim();
            const initials = ((userData.firstName || '').charAt(0) + (userData.lastName || '').charAt(0)).toUpperCase();
            
            // Update header profile dropdown
            document.getElementById('header-username').textContent = userData.firstName || 'User';
            document.getElementById('header-avatar').textContent = initials || 'U';
            
            // Set up dropdown toggle
            const profileTrigger = document.getElementById('profile-trigger');
            const profileDropdown = document.getElementById('profile-dropdown');
            
            profileTrigger.addEventListener('click', function() {
                profileDropdown.classList.toggle('active');
            });
            
            // Close dropdown when clicking outside
            document.addEventListener('click', function(event) {
                if (!profileTrigger.contains(event.target) && !profileDropdown.contains(event.target)) {
                    profileDropdown.classList.remove('active');
                }
            });
            
            // Handle logout
            document.getElementById('logout-btn').addEventListener('click', function(e) {
                e.preventDefault();
                
                // Clear authentication data
                localStorage.removeItem('authToken');
                localStorage.removeItem('userData');
                
                // Show success notification
                showSuccess('Logged out successfully!');
                
                // Redirect to home page after short delay
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 1500);
            });
        }
    }
    
    // Function to check if user has recently tracked their mood
    async function checkRecentMood() {
        try {
            const apiUrl = `${apiConfig.backendApiUrl}/api/mood/recent`;
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers
            });
            
            const data = await response.json();
            
            if (data.success && data.isRecent) {
                // User has tracked mood within the last 2 hours
                updateMoodTrackerButton(data.data);
            }
        } catch (error) {
            console.error('Error checking recent mood:', error);
        }
    }
    
    // Function to update the mood tracker button with current mood
    function updateMoodTrackerButton(moodData) {
        const moodTrackerBtn = document.getElementById('mood-tracker-btn');
        const emoji = moodEmojis[moodData.label] || '📊';
        // Only change content, not size
        moodTrackerBtn.innerHTML = `
            <span class="mood-emoji">${emoji}</span> Mood: <strong>${moodData.label}</strong>
        `;
        moodTrackerBtn.classList.add('current-mood');
    }
    
    // Function to load mood history from the server
    async function loadMoodHistory() {
        try {
            const apiUrl = `${apiConfig.backendApiUrl}/api/mood?limit=30`;
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers
            });
            
            const data = await response.json();
            
            if (data.success) {
                moodHistory = data.data;
                // Set max date to today but don't auto-select
                if (historyDateFilter) {
                    const today = new Date();
                    const todayStr = today.toISOString().split('T')[0];
                    historyDateFilter.max = todayStr;
                    // Don't auto-set the value - leave it empty by default
                }
                filterMoodHistoryByDate();
            }
        } catch (error) {
            console.error('Error loading mood history:', error);
            showError('Failed to load mood history. Please try again later.');
        }
    }
    
    // Date filter for mood history
    const historyDateFilter = document.getElementById('history-date-filter');
    
    // Set max date for filter to today but don't auto-select a date
    if (historyDateFilter) {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        historyDateFilter.max = todayStr;
        // Leave value empty by default - don't auto-set to today
        historyDateFilter.addEventListener('change', function() {
            filterMoodHistoryByDate();
        });
    }
    
    // Filter mood history by selected date (last 7 days only)
    function filterMoodHistoryByDate() {
        if (!moodHistory.length) {
            filteredMoodHistory = [];
            updateHistoryList();
            updateMoodChart();
            return;
        }
        
        // If no date is selected, show all entries (no filter)
        if (!historyDateFilter || !historyDateFilter.value) {
            filteredMoodHistory = moodHistory.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            updateHistoryList();
            updateMoodChart();
            return;
        }
        
        const selectedDate = new Date(historyDateFilter.value);
        selectedDate.setHours(23,59,59,999); // include full day
        const startDate = new Date(selectedDate);
        startDate.setDate(startDate.getDate() - 6); // 7 days window
        startDate.setHours(0,0,0,0);
        
        // Filter and sort by most recent first
        filteredMoodHistory = moodHistory.filter(entry => {
            const entryDate = new Date(entry.createdAt);
            return entryDate >= startDate && entryDate <= selectedDate;
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        updateHistoryList();
        updateMoodChart();
    }
    
    // Function to update the history list display with better timestamps
    function updateHistoryList() {
        const historyList = document.getElementById('historyList');
        historyList.innerHTML = '';
        const list = filteredMoodHistory && filteredMoodHistory.length ? filteredMoodHistory : [];
        if (list.length === 0) {
            historyList.innerHTML = '<p class="empty-history">No mood entries yet.</p>';
            return;
        }
        
        // Display most recent 10 entries
        const recentEntries = list.slice(0, 10);
        
        recentEntries.forEach(entry => {
            const date = new Date(entry.createdAt);
            
            // Format date and time in a more user-friendly way
            const formattedDate = date.toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
            
            const formattedTime = date.toLocaleTimeString(undefined, { 
                hour: '2-digit', 
                minute: '2-digit'
            });
            
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            
            // Add captured method indicator (AI or manual)
            const captureMethod = entry.capturedVia === 'ai' ? 
                '<span class="capture-method ai">AI</span>' : 
                '<span class="capture-method manual">Manual</span>';
            
            // Add mood color dot
            const moodDot = `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${getMoodColor(entry.label)};margin-right:5px;"></span>`;
            
            historyItem.innerHTML = `
                <span>${formattedDate}, ${formattedTime}</span>
                <div class="mood-details">
                    ${captureMethod}
                    <span class="mood-label-display">
                        ${moodDot}
                        ${entry.label}
                    </span>
                </div>
            `;
            
            historyList.appendChild(historyItem);
        });
    }
    
    // Initialize the chart
    function initMoodChart() {
        const ctx = document.getElementById('mood-history-chart').getContext('2d');
        
        moodChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Mood Level',
                    data: [],
                    backgroundColor: 'rgba(64, 115, 192, 0.2)',
                    borderColor: 'rgba(64, 115, 192, 1)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true,
                    pointBackgroundColor: [], // Will be set dynamically
                    pointRadius: 6,
                    pointHoverRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        min: 0,
                        max: 6,
                        ticks: {
                            stepSize: 1,
                            callback: function(value) {
                                const labels = ['Angry', 'Disgust', 'Fear', 'Happy', 'Neutral', 'Sad', 'Surprise'];
                                return labels[value] || '';
                            }
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const moodLabels = ['Angry', 'Disgust', 'Fear', 'Happy', 'Neutral', 'Sad', 'Surprise'];
                                const value = context.raw;
                                return `Mood: ${moodLabels[value]}`;
                            }
                        }
                    }
                }
            }
        });
    }
    
    // Update chart with mood history data
    function updateMoodChart() {
        if (!moodChart) return;
        const list = filteredMoodHistory && filteredMoodHistory.length ? filteredMoodHistory : [];
        if (list.length === 0) {
            moodChart.data.labels = [];
            moodChart.data.datasets[0].data = [];
            moodChart.data.datasets[0].pointBackgroundColor = [];
            moodChart.update();
            return;
        }
        
        // Only last 10 data points, most recent first, but chart expects oldest first
        const chartData = list.slice(0, 10).reverse();
        
        const labels = chartData.map(entry => {
            const date = new Date(entry.createdAt);
            // Format date to be more readable
            return date.toLocaleDateString(undefined, { 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        });
        
        const data = chartData.map(entry => entry.value);
        
        // Set point color for each mood
        const pointColors = chartData.map(entry => getMoodColor(entry.label));
        moodChart.data.labels = labels;
        moodChart.data.datasets[0].data = data;
        moodChart.data.datasets[0].pointBackgroundColor = pointColors;
        
        // Add tooltips to show more info
        moodChart.options.plugins.tooltip.callbacks.title = function(tooltipItems) {
            const index = tooltipItems[0].dataIndex;
            const entry = chartData[index];
            const date = new Date(entry.createdAt);
            return date.toLocaleString();
        };
        
        moodChart.options.plugins.tooltip.callbacks.afterLabel = function(context) {
            const index = context.dataIndex;
            const entry = chartData[index];
            let result = [];
            
            if (entry.notes) {
                result.push(`Note: ${entry.notes.substring(0, 30)}${entry.notes.length > 30 ? '...' : ''}`);
            }
            
            result.push(`Captured via: ${entry.capturedVia === 'ai' ? 'AI Detection' : 'Manual Selection'}`);
            
            return result;
        };
        
        moodChart.update();
    }
    
    // Function to save mood data (common function for both AI and manual)
    async function saveMoodData(value, label, notes, captureMethod) {
        // Always define originalText at the top
        const targetBtn = captureMethod === 'ai' ? captureBtn : saveManualMoodBtn;
        const originalText = targetBtn.textContent;
        try {
            // Show saving indicator
            targetBtn.disabled = true;
            targetBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            
            // Use backend API URL from config
            const apiUrl = `${apiConfig.backendApiUrl}/api/mood`;
            console.log('Sending mood data to:', apiUrl);
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    value,
                    label,
                    notes: notes || '',
                    capturedVia: captureMethod
                })
            });
            
            // Check if response is ok before parsing JSON
            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Reset button state
            targetBtn.disabled = false;
            targetBtn.textContent = originalText;
            
            if (data.success) {
                showSuccess(`Your mood has been ${captureMethod === 'ai' ? 'detected' : 'recorded'} as ${label}!`);
                
                // Reset form if this was a manual entry
                if (captureMethod === 'manual') {
                    moodOptions.forEach(opt => opt.classList.remove('selected'));
                    moodNotes.value = '';
                    selectedMood = null;
                }
                
                // Reload mood history to show the new entry
                await loadMoodHistory();
                
                // Update mood tracker button
                updateMoodTrackerButton({ value, label });
                
                // Load recommendations for the detected mood
                await loadRecommendations(label);
                
                return true;
            } else {
                showError('Failed to save your mood. Please try again.');
                return false;
            }
        } catch (error) {
            console.error('Error saving mood:', error);
            showError(`Failed to save your mood: ${error.message}`);
            // Reset button state
            targetBtn.disabled = false;
            targetBtn.textContent = originalText || (captureMethod === 'ai' ? 'Capture Mood with AI' : 'Save Manual Mood');
            return false;
        }
    }
    
    // Replace existing saveManualMood function with this improved version
    async function saveManualMood(value, label, notes) {
        return await saveMoodData(value, label, notes, 'manual');
    }
    
    // Function to start the mood capture process with AI
    // Function to start the mood capture process with AI
    async function startMoodCapture() {
        try {
            captureBtn.disabled = true;
            result.innerHTML = '<div class="result-content">Preparing camera...</div>';
            
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("Your browser doesn't support camera access");
            }

            mediaStream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: 640, height: 480 } 
            });
            
            video.srcObject = mediaStream;
            video.style.transform = 'scaleX(-1)'; // Mirror view
            
            await new Promise((resolve, reject) => {
                video.onloadedmetadata = resolve;
                setTimeout(() => reject(new Error("Video loading timed out")), 5000);
            });
            
            await video.play();
            result.innerHTML = '<div class="result-content">Get ready for mood detection...</div>';
            startCountdown();
            
        } catch (error) {
            console.error('Error accessing camera:', error);
            // KANDIPA UI LA RED COLOR ERROR KAATANUM CAMERA ILLANA
            result.innerHTML = `
                <div class="result-content" style="color: #e74c3c;">
                    <span>⚠️ Cannot access camera: Please enable camera permissions.</span>
                </div>
            `;
            result.style.backgroundColor = '#fdeded';
            result.style.border = '2px solid #e74c3c';
            captureBtn.disabled = false;
        }
    }
    
    // Function to start the countdown
    function startCountdown() {
        let count = 3;
        countdown.textContent = count;
        countdown.style.display = 'flex';
        
        const countdownInterval = setInterval(() => {
            count--;
            countdown.textContent = count;
            
            if (count <= 0) {
                clearInterval(countdownInterval);
                countdown.style.display = 'none';
                captureMoodImage();
            }
        }, 1000);
    }
    
    // Function to capture the mood image
// Function to capture the mood image
    function captureMoodImage() {
        try {
            // PUDHU CODE: Check if camera is actually playing and providing frames
            if (!video.srcObject || video.videoWidth === 0 || video.videoHeight === 0) {
                result.innerHTML = `
                    <div class="result-content" style="color: #e74c3c;">
                        <span>⚠️ Camera on aagala! Please enable your camera and try again.</span>
                    </div>
                `;
                result.style.backgroundColor = '#fdeded';
                result.style.border = '2px solid #e74c3c';
                captureBtn.disabled = false;
                
                // Stop whatever stream is there
                if (mediaStream) {
                    mediaStream.getTracks().forEach(track => track.stop());
                }
                return; // Stop execution here
            }

            // Draw video to canvas for capture
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // PUDHU CODE: Check if the captured image is completely black (camera blocked)
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let isAllBlack = true;
            for (let i = 0; i < imageData.length; i += 4) {
                if (imageData[i] > 10 || imageData[i+1] > 10 || imageData[i+2] > 10) {
                    isAllBlack = false;
                    break;
                }
            }
            
            if (isAllBlack) {
                result.innerHTML = `
                    <div class="result-content" style="color: #e74c3c;">
                        <span>⚠️ Image romba dark ah iruku. Camera cover aagi irukka nu check pannunga.</span>
                    </div>
                `;
                result.style.backgroundColor = '#fdeded';
                result.style.border = '2px solid #e74c3c';
                captureBtn.disabled = false;
                if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
                return;
            }

            console.log('Image captured from camera to canvas');
            
            // Stop webcam stream
            if (mediaStream) {
                mediaStream.getTracks().forEach(track => track.stop());
                video.srcObject = null;
            }
            
            // Show analyzing message
            result.innerHTML = '<div class="result-content">Analyzing your mood...</div>';
            
            // Convert canvas to blob and send to server
            canvas.toBlob(blob => {
                const formData = new FormData();
                const file = new File([blob], 'mood-capture.jpg', {
                    type: 'image/jpeg',
                    lastModified: Date.now()
                });
                formData.append('image', file);
                
                analyzeMoodImage(formData);
            }, 'image/jpeg', 0.9);
            
        } catch (error) {
            console.error('Error in captureMoodImage:', error);
            result.innerHTML = `
                <div class="result-content">
                    <span>Error capturing image: ${error.message}. Please try again.</span>
                </div>
            `;
            result.style.backgroundColor = '#fdeded';
            captureBtn.disabled = false;
        }
    }
    
    // Update the analyzeMoodImage function to send directly to Flask ML service
  // Update the analyzeMoodImage function to send directly to Flask ML service
    // Update the analyzeMoodImage function to send directly to Flask ML service
    async function analyzeMoodImage(formData) {
        try {
            const apiUrl = apiConfig.mlServiceUrl;
            console.log('Sending image directly to Flask ML service at:', apiUrl);
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            // Backend-la (Python) irunthu error vantha atha theliva catch panrom
            if (!response.ok) {
                throw new Error(data.error || `Server error: ${response.status}`);
            }
            
            // Correct-a mood detect aana mattum thaan save aaganum
            if (data && data.mood !== undefined && data.moodLabel) {
                const moodValue = data.mood;
                const moodLabel = data.moodLabel;
                
                // Save the mood to our MongoDB database via Node.js backend
                const saveSuccess = await saveMoodData(moodValue, moodLabel, '', 'ai');
                
                if (saveSuccess) {
                    const emoji = moodEmojis[moodLabel] || '🤔';
                    
                    // Nalla Modern Green UI styling
                    result.innerHTML = `
                        <div class="result-content">
                            <span class="mood-emoji">${emoji}</span>
                            <span>You seem to be feeling <strong>${moodLabel}</strong></span>
                        </div>
                    `;
                    result.style.backgroundColor = '#d1fae5';
                    result.style.border = '2px solid #10b981';
                    result.style.color = '#047857';
                    result.style.borderRadius = '12px';
                    result.style.boxShadow = '0 4px 6px -1px rgba(16, 185, 129, 0.1)';
                    
                    await loadMoodHistory();
                    updateMoodTrackerButton({ value: moodValue, label: moodLabel });
                } else {
                    throw new Error('Failed to save mood data.');
                }
            } else {
                throw new Error('Failed to detect mood from image');
            }
        } catch (error) {
            console.error('Error connecting to ML service:', error);
            
            // PUDHU FIX: Dummy Node.js fallback-a azhichitom!
            // Ipo camera sariya illana/mugam theriyalana theliva red color error varum.
            result.innerHTML = `
                <div class="result-content" style="color: #e74c3c;">
                    <span>⚠️ Detection Failed: ${error.message}</span>
                </div>
            `;
            result.style.backgroundColor = '#fdeded';
            result.style.border = '2px solid #e74c3c';
            result.style.borderRadius = '12px';
        } finally {
            captureBtn.disabled = false;
        }
    }
    // Helper: get color for each mood
    function getMoodColor(label) {
        switch(label) {
            case 'Angry': return '#e74c3c';
            case 'Disgust': return '#27ae60';
            case 'Fear': return '#8e44ad';
            case 'Happy': return '#f1c40f';
            case 'Neutral': return '#95a5a6';
            case 'Sad': return '#3498db';
            case 'Surprise': return '#e67e22';
            default: return '#888';
        }
    }
    
    // Fix profile dropdown toggle and outside click
    function setupProfileDropdown() {
        const profileTrigger = document.getElementById('profile-trigger');
        const profileDropdown = document.getElementById('profile-dropdown');
        if (!profileTrigger || !profileDropdown) return;
        // Remove any previous event listeners
        profileTrigger.onclick = null;
        document.removeEventListener('click', closeDropdownOnClickOutside, true);
        // Toggle dropdown on trigger click
        profileTrigger.addEventListener('click', function(e) {
            e.stopPropagation();
            profileDropdown.classList.toggle('active');
        });
        // Close dropdown when clicking outside
        document.addEventListener('click', closeDropdownOnClickOutside, true);
        function closeDropdownOnClickOutside(event) {
            if (!profileTrigger.contains(event.target) && !profileDropdown.contains(event.target)) {
                profileDropdown.classList.remove('active');
            }
        }
    }
    // Call setupProfileDropdown after DOM ready
    setupProfileDropdown();
    
    // Function to load and display recommendations based on mood
    async function loadRecommendations(moodLabel) {
        try {
            // Load resources from resources.json
            const response = await fetch('resource/resources.json');
            const resources = await response.json();
            
            // Filter resources based on mood
            const filteredResources = filterResourcesByMood(resources, moodLabel.toLowerCase());
            
            // Display recommendations
            displayRecommendations(filteredResources, moodLabel);
            
            // Show the recommendations section
            const recommendationsSection = document.getElementById('mood-recommendations');
            recommendationsSection.style.display = 'block';
            
        } catch (error) {
            console.error('Error loading recommendations:', error);
            showError('Failed to load recommendations. Please try again later.');
        }
    }
    
    // Function to filter resources by mood
    function filterResourcesByMood(resources, mood) {
        const filtered = {
            quotes: [],
            videos: [],
            audio: [],
            posters: [],
            guides: [],
            books: []
        };
        
        // Filter each resource type
        Object.keys(resources).forEach(resourceType => {
            if (Array.isArray(resources[resourceType])) {
                resources[resourceType].forEach(resource => {
                    if (resource.tags && resource.tags.includes(mood)) {
                        filtered[resourceType].push(resource);
                    }
                });
            }
        });
        
        return filtered;
    }
    
    // Function to display recommendations in masonry layout
    function displayRecommendations(resources, moodLabel) {
        const recommendationContent = document.getElementById('recommendation-content');
        
        // Create masonry container
        let html = `
            <div class="recommendations-header">
                <h4>Recommended for your ${moodLabel} mood</h4>
                <p>Here are some resources that might help you feel better:</p>
            </div>
            <div class="masonry-container">
        `;
        
        // Add quotes
        if (resources.quotes && resources.quotes.length > 0) {
            resources.quotes.forEach(quoteGroup => {
                if (quoteGroup.quotes && quoteGroup.quotes.length > 0) {
                    const randomQuote = quoteGroup.quotes[Math.floor(Math.random() * quoteGroup.quotes.length)];
                    html += `
                        <div class="masonry-item quote-item">
                            <h5>Inspirational Quote</h5>
                            <p class="quote-text">"${randomQuote}"</p>
                        </div>
                    `;
                }
            });
        }
        
        // Add videos
        if (resources.videos && resources.videos.length > 0) {
            resources.videos.slice(0, 2).forEach((video, index) => {
                const videoId = `video-${index}`;
                html += `
                    <div class="masonry-item video-item">
                        <h5>${video.title}</h5>
                        <p>${video.description}</p>
                        <div class="video-container-inline">
                            <video id="${videoId}" controls style="width: 100%; border-radius: 8px;">
                                <source src="${video.file}" type="video/mp4">
                                Your browser does not support the video tag.
                            </video>
                            <button class="fullscreen-btn" onclick="toggleFullscreen('${videoId}')">
                                <i class="fas fa-expand"></i>
                            </button>
                        </div>
                        <div class="resource-meta">
                            <span class="duration">${video.duration}</span>
                        </div>
                    </div>
                `;
            });
        }
        
        // Add audio
        if (resources.audio && resources.audio.length > 0) {
            resources.audio.slice(0, 2).forEach(audio => {
                html += `
                    <div class="masonry-item audio-item">
                        <h5>${audio.title}</h5>
                        <p>${audio.description}</p>
                        <div class="audio-container-inline">
                            <audio controls style="width: 100%;">
                                <source src="${audio.file}" type="audio/mpeg">
                                Your browser does not support the audio tag.
                            </audio>
                        </div>
                        <div class="resource-meta">
                            <span class="duration">${audio.duration}</span>
                        </div>
                    </div>
                `;
            });
        }
        
        // Add posters
        if (resources.posters && resources.posters.length > 0) {
            resources.posters.slice(0, 2).forEach(poster => {
                html += `
                    <div class="masonry-item poster-item">
                        <h5>${poster.title}</h5>
                        <p>${poster.description}</p>
                        <div class="poster-preview">
                            <img src="${poster.file}" alt="${poster.title}" style="width: 100%; aspect-ratio: 1/1; object-fit: cover; border-radius: 8px;">
                        </div>
                    </div>
                `;
            });
        }
        
        // Add guides
        if (resources.guides && resources.guides.length > 0) {
            resources.guides.slice(0, 1).forEach(guide => {
                html += `
                    <div class="masonry-item guide-item">
                        <h5>${guide.title}</h5>
                        <p>${guide.description}</p>
                        <button class="btn-small" onclick="openPDF('${guide.file}')">Read Guide</button>
                    </div>
                `;
            });
        }
        
        // Add books
        if (resources.books && resources.books.length > 0) {
            resources.books.slice(0, 1).forEach(book => {
                html += `
                    <div class="masonry-item book-item">
                        <h5>${book.title}</h5>
                        <p>${book.description}</p>
                        <button class="btn-small" onclick="openPDF('${book.file}')">Read Book</button>
                    </div>
                `;
            });
        }
        
        html += '</div>';
        
        recommendationContent.innerHTML = html;
    }
    
    // Function to toggle fullscreen for videos
    window.toggleFullscreen = function(videoId) {
        const video = document.getElementById(videoId);
        if (video) {
            if (video.requestFullscreen) {
                video.requestFullscreen();
            } else if (video.webkitRequestFullscreen) {
                video.webkitRequestFullscreen();
            } else if (video.msRequestFullscreen) {
                video.msRequestFullscreen();
            }
        }
    };
    
    // Function to open PDF files
    window.openPDF = function(file) {
        window.open(file, '_blank');
    };
});