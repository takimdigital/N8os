// chatbot/chatbot.js

// Force isN8nPage to true for development purposes
let isN8nPage = true;

// Chat memory to maintain conversation context
let chatMemory = [];
let settings = null;

// For accessing Chrome extension resources safely
const getExtensionURL = (path) => {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
    return chrome.runtime.getURL(path);
  }
  console.error('Unable to access chrome.runtime.getURL');
  return path;
};

// Listen for events from the content script
window.addEventListener('n8nCopilotContentEvent', (event) => {
  const data = event.detail;
  console.log('Event from content script:', data);
  
  if (data.type === 'showChat') {
    toggleChat();
  }
  
  if (data.type === 'isN8nPageResponse') {
    isN8nPage = data.isN8nPage;
  }
  
  if (data.type === 'resourceURLs') {
    window.extensionResources = data.resources;
    injectChatStyles();
    injectChatIcon();
  }
  
  if (data.type === 'resourceURL') {
    if (data.path === 'chatbot/chatbot.css') {
      applyChatStyles(data.url);
    }
  }
  
  if (data.type === 'chatHtml') {
    if (window.processChatHtml) {
      window.processChatHtml(data.html);
    }
  }
  
  // Handle settings updates
  if (data.type === 'settingsUpdated') {
    console.log('Settings updated in chatbot');
    if (data.settings) {
      settings = data.settings;
      console.log('Settings updated:', settings);
    }
  }
});

// Function to communicate with content script
function sendToContentScript(data) {
  window.dispatchEvent(new CustomEvent('n8nCopilotInjectedEvent', {
    detail: data
  }));
}

// Initialize
function initialize() {
  sendToContentScript({ type: 'getIsN8nPage' });
  sendToContentScript({ type: 'getResourceURLs' });
  sendToContentScript({ type: 'getSettings' });
}

// Inject chat CSS if not already present
function injectChatStyles() {
  if (document.getElementById('n8n-builder-styles')) return;
  sendToContentScript({ type: 'getResourceURL', path: 'chatbot/chatbot.css' });
}

function applyChatStyles(cssUrl) {
  const style = document.createElement('link');
  style.id = 'n8n-builder-styles';
  style.rel = 'stylesheet';
  style.type = 'text/css';
  style.href = cssUrl;
  document.head.appendChild(style);
}

// Inject the chat icon bubble
function injectChatIcon() {
  if (!window.extensionResources) {
    sendToContentScript({ type: 'getResourceURLs' });
    return;
  }
  
  const existingIcon = document.getElementById('n8n-builder-icon');
  if (existingIcon) existingIcon.remove();
  
  const iconUrl = getResourceURL('icons/chat-icon-48.png');
  
  const iconDiv = document.createElement('div');
  iconDiv.id = 'n8n-builder-icon';
  iconDiv.className = 'n8n-builder-chat-icon';
  iconDiv.innerHTML = `<img src="${iconUrl}" alt="n8n Co Pilot" />`;
  document.body.appendChild(iconDiv);
  
  iconDiv.addEventListener('click', () => {
    toggleChat();
  });
}

// Create a mini toast notification
function showMiniToast(message) {
  const toast = document.createElement('div');
  toast.className = 'n8n-builder-mini-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }, 10);
}

// Toggle chat visibility
function toggleChat() {
  const existingChat = document.getElementById('n8n-builder-chat');
  if (existingChat) {
    existingChat.remove();
  } else {
    initChatbot();
  }
}

// Add a message to the chat
function addMessage(sender, text) {
  const messagesArea = document.getElementById('n8n-builder-messages');
  if (!messagesArea) return;
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `n8n-builder-message ${sender}-message`;
  messageDiv.innerHTML = `
    <div class="message-avatar ${sender}-avatar"></div>
    <div class="message-content">${text}</div>
  `;
  messagesArea.appendChild(messageDiv);
  messagesArea.scrollTop = messagesArea.scrollHeight;
  
  chatMemory.push({
    role: sender === 'user' ? 'user' : 'assistant',
    content: text
  });
}

// Add loading indicator
function showLoadingIndicator() {
  const messagesArea = document.getElementById('n8n-builder-messages');
  if (!messagesArea) return;
  
  const loadingDiv = document.createElement('div');
  loadingDiv.id = 'n8n-builder-loading';
  loadingDiv.className = 'n8n-builder-message assistant-message loading';
  loadingDiv.innerHTML = `
    <div class="message-avatar assistant-avatar"></div>
    <div class="message-content">
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  messagesArea.appendChild(loadingDiv);
  messagesArea.scrollTop = messagesArea.scrollHeight;
}

// Remove loading indicator
function removeLoadingIndicator() {
  const loadingIndicator = document.getElementById('n8n-builder-loading');
  if (loadingIndicator) {
    loadingIndicator.remove();
  }
}

// Call LLM API based on provider
async function callLLM(prompt) {
  if (!settings) {
    addMessage('assistant', 'Error: Please configure your AI provider settings.');
    return;
  }

  showLoadingIndicator();

  try {
    let baseUrl;
    let headers = { 'Content-Type': 'application/json' };
    
    switch (settings.activeProvider) {
      case 'openai':
        if (!settings.openaiKey) {
          throw new Error('OpenAI API key not configured');
        }
        baseUrl = 'https://api.openai.com/v1';
        headers.Authorization = `Bearer ${settings.openaiKey}`;
        break;

      case 'ollama':
        if (!settings.ollamaUrl) {
          throw new Error('Ollama URL not configured');
        }
        baseUrl = settings.ollamaUrl;
        break;

      case 'lmstudio':
        if (!settings.lmstudioUrl) {
          throw new Error('LM Studio URL not configured');
        }
        baseUrl = settings.lmstudioUrl;
        break;

      default:
        throw new Error('Invalid AI provider selected');
    }

    const messages = [
      {
        role: 'system',
        content: `You are n8n Co Pilot, an AI assistant specializing in n8n workflow automation.`
      },
      ...chatMemory
    ];

    let requestBody;
    let endpointUrl;

    if (settings.activeProvider === 'ollama') {
      endpointUrl = `${baseUrl}/api/chat`;
      requestBody = JSON.stringify({
        model: settings.selectedModel, // Expects only model name, e.g., "llama3"
        messages,
        stream: false
      });
    } else {
      // For openai and lmstudio
      endpointUrl = `${baseUrl}/v1/chat/completions`;
      requestBody = JSON.stringify({
        model: settings.selectedModel || 'gpt-4', // Default for OpenAI-compatible
        messages,
        temperature: 0.7
      });
    }

    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: requestBody
    });

    const data = await response.json();
    removeLoadingIndicator();

    if (data.error) {
      // Handles cases like {"error": "message"} or {"error": {"message": "details"}}
      const errorMessage = typeof data.error === 'object' ? data.error.message : data.error;
      console.error('API error:', data.error);
      addMessage('assistant', `Error: ${errorMessage}`);
      return;
    }

    let aiResponse;
    if (settings.activeProvider === 'ollama') {
      if (data.message && data.message.content) {
        aiResponse = data.message.content;
      } else {
        addMessage('assistant', 'Received an unexpected response structure from Ollama.');
        return;
      }
    } else {
      // For openai and lmstudio
      if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
        aiResponse = data.choices[0].message.content;
      } else {
        addMessage('assistant', 'Received an unexpected response structure from the AI provider.');
        return;
      }
    }
    
    addMessage('assistant', aiResponse);
    
    const extractedJson = extractJsonFromResponse(aiResponse);
    if (extractedJson) {
      processWorkflowJson(extractedJson);
    }

  } catch (error) {
    console.error('Error calling LLM:', error);
    removeLoadingIndicator();
    addMessage('assistant', `Error: ${error.message}`);
  }
}

// Handle sending a message
function handleSendMessage() {
  const inputElement = document.getElementById('n8n-builder-input');
  if (!inputElement) return;
  
  const userMessage = inputElement.value.trim();
  if (userMessage) {
    addMessage('user', userMessage);
    inputElement.value = '';
    callLLM(userMessage);
  }
}

// Set up event listeners
function setupEventListeners() {
  const sendButton = document.getElementById('n8n-builder-send');
  if (sendButton) {
    sendButton.addEventListener('click', handleSendMessage);
  }
  
  const inputField = document.getElementById('n8n-builder-input');
  if (inputField) {
    inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    });
  }
  
  const closeButton = document.getElementById('n8n-builder-close');
  if (closeButton) {
    closeButton.addEventListener('click', () => {
      const chat = document.getElementById('n8n-builder-chat');
      if (chat) chat.remove();
    });
  }
  
  const minimizeButton = document.getElementById('n8n-builder-minimize');
  if (minimizeButton) {
    minimizeButton.addEventListener('click', () => {
      const chat = document.getElementById('n8n-builder-chat');
      if (chat) chat.remove();
      injectChatIcon();
    });
  }
}

// Initialize the chatbot
function initChatbot() {
  if (!document.getElementById('n8n-builder-styles')) {
    sendToContentScript({ type: 'getResourceURL', path: 'chatbot/chatbot.css' });
  }
  
  injectChatHtml(() => {
    setupEventListeners();
    
    if (!settings) {
      addMessage('assistant', 'Welcome! Please configure your AI provider settings in the extension popup.');
    } else {
      addMessage('assistant', 'Hello! I can help you build your n8n workflow. What would you like to add?');
    }
  });
}

// Initialize
console.log('Chatbot script initialized');
initialize();

// Function to extract JSON from AI response
function extractJsonFromResponse(aiResponse) {
  // Logic to find and parse JSON from the AI's text response
  // For example, looking for ```json ... ``` code blocks
  const match = aiResponse.match(/```json\s*([\s\S]*?)\s*```/);
  if (match && match[1]) {
    try {
      return JSON.parse(match[1]);
    } catch (e) {
      console.error('Error parsing JSON from response:', e);
      return null;
    }
  }
  return null;
}

// Function to process extracted workflow JSON
function processWorkflowJson(extractedJson) {
  console.log('Extracted JSON for workflow:', extractedJson);

  if (settings && settings.n8nApiUrl && settings.n8nApiKey) {
    console.log(`Ready to add to canvas using n8n API. URL: ${settings.n8nApiUrl}, Key: ${settings.n8nApiKey ? 'provided' : 'missing'}`);
    // Future: Implement actual API call to n8n instance here
    // addMessage('assistant', 'Workflow JSON received. n8n integration is configured.');
  } else {
    console.warn('n8n API settings (URL or Key) are not configured. Cannot add to canvas. Please configure them in the extension settings.');
    // Future: Maybe add a message to the chat interface about this
    // addMessage('assistant', 'Workflow JSON received, but n8n integration is not fully configured for direct canvas updates.');
  }
}