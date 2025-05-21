// settings/settings.js

document.addEventListener('DOMContentLoaded', () => {
  // Existing elements
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  const showChatButton = document.getElementById('show-chat');
  const settingsButton = document.getElementById('settings-btn');
  const settingsPanel = document.getElementById('settings-panel');
  const saveSettingsButton = document.getElementById('save-settings');
  
  // New elements for providers
  const providerSelect = document.getElementById('provider-select');
  const modelSelect = document.getElementById('model-select');
  const openaiSection = document.getElementById('openai-section');
  const anthropicSection = document.getElementById('anthropic-section');
  const ollamaSection = document.getElementById('ollama-section');
  const lmstudioSection = document.getElementById('lmstudio-section');
  
  // Input elements
  const openaiKeyInput = document.getElementById('openai-key');
  const anthropicKeyInput = document.getElementById('anthropic-key');
  const ollamaUrlInput = document.getElementById('ollama-url');
  const lmstudioUrlInput = document.getElementById('lmstudio-url');
  const n8nApiUrlInput = document.getElementById('n8n-api-url');
  const n8nApiKeyInput = document.getElementById('n8n-api-key');
  const testN8nButton = document.getElementById('test-n8n-connection');
  const n8nStatusDisplay = document.getElementById('n8n-connection-status');

  if (testN8nButton && n8nApiUrlInput && n8nApiKeyInput && n8nStatusDisplay) {
    testN8nButton.addEventListener('click', async () => {
      const apiUrl = n8nApiUrlInput.value.trim();
      const apiKey = n8nApiKeyInput.value.trim();

      if (!apiUrl || !apiKey) {
        n8nStatusDisplay.textContent = 'n8n API URL and Key are required.';
        n8nStatusDisplay.className = 'connection-status-text status-error';
        setTimeout(() => {
          n8nStatusDisplay.textContent = '';
          n8nStatusDisplay.className = 'connection-status-text';
        }, 5000);
        return;
      }

      n8nStatusDisplay.textContent = 'Testing...';
      n8nStatusDisplay.className = 'connection-status-text status-testing';

      try {
        const response = await fetch(`${apiUrl}/api/v1/me`, {
          method: 'GET',
          headers: {
            'X-N8N-API-KEY': apiKey,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          n8nStatusDisplay.textContent = `Success! User: ${data.email || 'N/A'}`;
          n8nStatusDisplay.className = 'connection-status-text status-success';
        } else {
          const errorText = await response.text();
          console.error('n8n connection test error:', errorText);
          n8nStatusDisplay.textContent = `Failed: ${response.status}. Check console.`;
          n8nStatusDisplay.className = 'connection-status-text status-error';
        }
      } catch (error) {
        console.error('n8n connection fetch error:', error);
        n8nStatusDisplay.textContent = `Error: ${error.message.substring(0, 100)}`;
        n8nStatusDisplay.className = 'connection-status-text status-error';
      }
      
      setTimeout(() => {
        n8nStatusDisplay.textContent = '';
        n8nStatusDisplay.className = 'connection-status-text';
      }, 7000); // Clear message after 7 seconds
    });
  }

  // Function to fetch available models
  async function fetchModels(provider) {
    modelSelect.disabled = true;
    modelSelect.innerHTML = '<option value="">Loading models...</option>';

    try {
      let models = [];
      switch (provider) {
        case 'ollama':
          const ollamaUrl = ollamaUrlInput.value.trim();
          // Ensure ollamaUrl has a protocol, default to http if missing for robustness
          let finalOllamaUrl = ollamaUrl;
          if (!finalOllamaUrl.startsWith('http://') && !finalOllamaUrl.startsWith('https://')) {
              finalOllamaUrl = 'http://' + finalOllamaUrl;
          }
          // Check if the URL is valid before fetching
          try {
              new URL(finalOllamaUrl); // This will throw if the URL is malformed
          } catch (e) {
              console.error('Invalid Ollama URL:', finalOllamaUrl, e);
              modelSelect.innerHTML = '<option value="">Invalid Ollama URL</option>';
              modelSelect.disabled = false; // Re-enable to allow URL correction
              return;
          }
          const ollamaResponse = await fetch(`${finalOllamaUrl}/api/tags`);
          if (!ollamaResponse.ok) {
              throw new Error(`Ollama API request failed with status ${ollamaResponse.status}`);
          }
          const ollamaData = await ollamaResponse.json();
          // Ollama's /api/tags returns { models: [ { name: "model:tag", ... } ] }
          models = ollamaData.models || []; // This should be an array of objects
          break;

        case 'lmstudio':
          const lmstudioUrl = lmstudioUrlInput.value.trim();
          // Similar robustness for LM Studio URL
          let finalLmstudioUrl = lmstudioUrl;
          if (!finalLmstudioUrl.startsWith('http://') && !finalLmstudioUrl.startsWith('https://')) {
            finalLmstudioUrl = 'http://' + finalLmstudioUrl;
          }
          try {
            new URL(finalLmstudioUrl);
          } catch (e) {
            console.error('Invalid LM Studio URL:', finalLmstudioUrl, e);
            modelSelect.innerHTML = '<option value="">Invalid LM Studio URL</option>';
            modelSelect.disabled = false;
            return;
          }
          const lmstudioResponse = await fetch(`${finalLmstudioUrl}/v1/models`);
          if (!lmstudioResponse.ok) {
            throw new Error(`LM Studio API request failed with status ${lmstudioResponse.status}`);
          }
          const lmstudioData = await lmstudioResponse.json();
          models = lmstudioData.data || [];
          break;

        case 'openai':
          models = [
            { id: 'gpt-4', name: 'GPT-4' },
            { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
          ];
          break;

        case 'anthropic':
          models = [
            { id: 'claude-3-opus', name: 'Claude 3 Opus' },
            { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet' }
          ];
          break;
      }

      modelSelect.innerHTML = models.map(model => 
        `<option value="${model.id || model}">${model.name || model}</option>`
      ).join('');
      
      modelSelect.disabled = false;
    } catch (error) {
      console.error('Error fetching models:', error);
      modelSelect.innerHTML = '<option value="">Error loading models</option>';
    }
  }

  // Handle provider change
  providerSelect.addEventListener('change', () => {
    const provider = providerSelect.value;
    
    // Hide all sections
    [openaiSection, anthropicSection, ollamaSection, lmstudioSection].forEach(
      section => section.classList.add('hidden')
    );
    
    // Show selected provider section
    switch (provider) {
      case 'openai':
        openaiSection.classList.remove('hidden');
        break;
      case 'anthropic':
        anthropicSection.classList.remove('hidden');
        break;
      case 'ollama':
        ollamaSection.classList.remove('hidden');
        break;
      case 'lmstudio':
        lmstudioSection.classList.remove('hidden');
        break;
    }
    
    // Fetch models for the selected provider
    fetchModels(provider);
  });

  // Load saved settings
  chrome.storage.sync.get([
    'openaiKey',
    'anthropicKey',
    'activeProvider',
    'n8nApiUrl',
    'n8nApiKey',
    'ollamaUrl',
    'lmstudioUrl',
    'selectedModel'
  ], (result) => {
    if (result.openaiKey) openaiKeyInput.value = result.openaiKey;
    if (result.anthropicKey) anthropicKeyInput.value = result.anthropicKey;
    if (result.n8nApiUrl) n8nApiUrlInput.value = result.n8nApiUrl;
    if (result.n8nApiKey) n8nApiKeyInput.value = result.n8nApiKey;
    if (result.ollamaUrl) ollamaUrlInput.value = result.ollamaUrl;
    if (result.lmstudioUrl) lmstudioUrlInput.value = result.lmstudioUrl;
    
    if (result.activeProvider) {
      providerSelect.value = result.activeProvider;
      providerSelect.dispatchEvent(new Event('change'));
    }
    
    if (result.selectedModel) {
      setTimeout(() => {
        modelSelect.value = result.selectedModel;
      }, 500);
    }
  });

  // Save settings
  saveSettingsButton.addEventListener('click', async () => {
    const settings = {
      openaiKey: openaiKeyInput.value.trim(),
      anthropicKey: anthropicKeyInput.value.trim(),
      activeProvider: providerSelect.value,
      n8nApiUrl: n8nApiUrlInput.value.trim(),
      n8nApiKey: n8nApiKeyInput.value.trim(),
      ollamaUrl: ollamaUrlInput.value.trim(),
      lmstudioUrl: lmstudioUrlInput.value.trim(),
      selectedModel: modelSelect.value
    };

    chrome.storage.sync.set(settings, () => {
      saveSettingsButton.textContent = 'Saved!';
      
      // Send message to content script about updated settings
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: 'settingsUpdated',
          settings
        });
      });
      
      setTimeout(() => {
        saveSettingsButton.textContent = 'Save Settings';
      }, 2000);
    });
  });

  // Existing event listeners remain unchanged
  showChatButton.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'showChat' });
      window.close();
    });
  });

  settingsButton.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
  });

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
        showChatButton.disabled = true;
      }
    });
  });

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
});