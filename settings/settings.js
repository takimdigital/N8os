// settings/settings.js

document.addEventListener('DOMContentLoaded', () => {
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  const showChatButton = document.getElementById('show-chat');
  const settingsButton = document.getElementById('settings-btn');
  const settingsPanel = document.getElementById('settings-panel');
  const saveSettingsButton = document.getElementById('save-settings');
  const toggleContainer = document.querySelector('.toggle-container');
  const toggleOptions = document.querySelectorAll('.toggle-option');
  const openaiSection = document.getElementById('openai-section');
  const anthropicSection = document.getElementById('anthropic-section');
  const openaiKeyInput = document.getElementById('openai-key');
  const anthropicKeyInput = document.getElementById('anthropic-key');
  const n8nApiUrlInput = document.getElementById('n8n-api-url');
  const n8nApiKeyInput = document.getElementById('n8n-api-key');
  
  // Centralized n8n page detection
  function isN8nPage(url) {
    return url.includes('n8n') || 
           url.includes('workflow') || 
           url.includes('execution') ||
           url.includes('localhost');
  }
  
  // Check if current tab is an n8n page
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0].url;
    const isN8nDetected = isN8nPage(url);
    
    // Store the detection result for other scripts to use
    chrome.storage.local.set({ isN8nPage: isN8nDetected }, () => {
      console.log('n8n page status set in storage:', isN8nDetected);
      
      // Update UI based on detection
      if (isN8nDetected) {
        statusIndicator.classList.add('active');
        statusIndicator.classList.remove('inactive');
        statusText.textContent = 'On an n8n page';
        showChatButton.disabled = false;
      } else {
        statusIndicator.classList.add('inactive');
        statusIndicator.classList.remove('active');
        statusText.textContent = 'Not an n8n page';
        showChatButton.disabled = true; // Disable button on non-n8n pages
      }
    });
  });
  
  // Load saved settings
  chrome.storage.sync.get([
    'openaiKey', 
    'anthropicKey', 
    'activeProvider',
    'n8nApiUrl',
    'n8nApiKey'
  ], (result) => {
    if (result.openaiKey) {
      openaiKeyInput.value = result.openaiKey;
    }
    
    if (result.anthropicKey) {
      anthropicKeyInput.value = result.anthropicKey;
    }
    
    if (result.n8nApiUrl) {
      n8nApiUrlInput.value = result.n8nApiUrl;
    }
    
    if (result.n8nApiKey) {
      n8nApiKeyInput.value = result.n8nApiKey;
    }
    
    // Set active provider
    if (result.activeProvider) {
      toggleContainer.setAttribute('data-selected', result.activeProvider);
      updateApiSections(result.activeProvider);
    }
  });
  
  // Show chat button click handler
  showChatButton.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'showChat' });
      window.close(); // Close the popup after clicking
    });
  });
  
  // Toggle settings panel
  settingsButton.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
  });
  
  // Handle provider toggle selection
  toggleOptions.forEach(option => {
    option.addEventListener('click', () => {
      const provider = option.getAttribute('data-value');
      toggleContainer.setAttribute('data-selected', provider);
      updateApiSections(provider);
    });
  });
  
  // Function to update API sections based on selected provider
  function updateApiSections(provider) {
    if (provider === 'openai') {
      openaiSection.classList.remove('hidden');
      anthropicSection.classList.add('hidden');
    } else {
      openaiSection.classList.add('hidden');
      anthropicSection.classList.remove('hidden');
    }
  }
  
  // Validate n8n API URL
  function validateN8nApiUrl(url) {
    if (!url) return false;
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch (e) {
      return false;
    }
  }
  
  // Test n8n API connection
  async function testN8nApiConnection(url, apiKey) {
    try {
      const response = await fetch(`${url}/api/v1/me`, {
        method: 'GET',
        headers: {
          'X-N8N-API-KEY': apiKey
        }
      });
      
      return response.ok;
    } catch (error) {
      console.error('n8n API connection test failed:', error);
      return false;
    }
  }
  
  // Save settings
  saveSettingsButton.addEventListener('click', async () => {
    const openaiKey = openaiKeyInput.value.trim();
    const anthropicKey = anthropicKeyInput.value.trim();
    const activeProvider = toggleContainer.getAttribute('data-selected');
    const n8nApiUrl = n8nApiUrlInput.value.trim();
    const n8nApiKey = n8nApiKeyInput.value.trim();
    
    // Validate n8n API URL if provided
    let n8nApiValid = true;
    if (n8nApiUrl && n8nApiKey) {
      if (!validateN8nApiUrl(n8nApiUrl)) {
        alert('Please enter a valid n8n API URL (e.g., https://your-n8n-instance.com)');
        n8nApiValid = false;
      }
    }
    
    if (!n8nApiValid) return;
    
    // Save settings
    chrome.storage.sync.set({ 
      openaiKey, 
      anthropicKey, 
      activeProvider,
      n8nApiUrl,
      n8nApiKey
    }, () => {
      // Show save confirmation
      saveSettingsButton.textContent = 'Saved!';
      
      // Send message to content script about updated settings
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: 'settingsUpdated',
          settings: {
            openaiKey,
            anthropicKey,
            activeProvider,
            n8nApiUrl,
            n8nApiKey
          }
        });
      });
      
      // Test n8n API connection if provided
      if (n8nApiUrl && n8nApiKey) {
        testN8nApiConnection(n8nApiUrl, n8nApiKey)
          .then(isConnected => {
            if (isConnected) {
              statusText.textContent += ' (n8n API connected)';
            }
          });
      }
      
      setTimeout(() => {
        saveSettingsButton.textContent = 'Save Settings';
      }, 2000);
    });
  });
});