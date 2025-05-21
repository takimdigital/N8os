// chatbot/chatbot.js

// Force isN8nPage to true for development purposes
let isN8nPage = true;

// Chat memory to maintain conversation context
let chatMemory = [];
let settings = null;
let hasChatBeenInitialized = false; // Flag to prevent multiple initializations

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
    hasChatBeenInitialized = false; // Allow re-initialization if removed
  } else {
    initChatbot(); // This will request HTML and set up
  }
}

// Add a message to the chat
function addMessage(sender, text) {
  const messagesArea = document.getElementById('n8n-builder-messages');
  if (!messagesArea) return;

  const messageDiv = document.createElement('div');
  messageDiv.className = `n8n-builder-message ${sender}-message`;

  let contentHtml = '';
  if (sender === 'assistant') {
    if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
      const rawHtml = marked.parse(text);
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = rawHtml;

      tempDiv.querySelectorAll('pre').forEach(preElement => {
        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative';

        const copyButton = document.createElement('button');
        copyButton.textContent = 'Copy';
        copyButton.className = 'copy-code-button';
        // Position the button at the top-right corner of the wrapper
        copyButton.style.position = 'absolute';
        copyButton.style.top = '5px'; // Adjust as needed
        copyButton.style.right = '5px'; // Adjust as needed
        copyButton.style.zIndex = '1'; // Ensure it's above the code block

        const codeElement = preElement.querySelector('code');
        // Fallback to preElement.textContent if codeElement is not found (less likely with marked.js)
        const textToCopy = codeElement ? codeElement.textContent : preElement.textContent;

        copyButton.addEventListener('click', () => {
          navigator.clipboard.writeText(textToCopy).then(() => {
            copyButton.textContent = 'Copied!';
            setTimeout(() => { copyButton.textContent = 'Copy'; }, 2000);
          }).catch(err => {
            console.error('Failed to copy text:', err);
            copyButton.textContent = 'Error';
            // Potentially show a small error message to the user or log it
            setTimeout(() => { copyButton.textContent = 'Copy'; }, 2000);
          });
        });
        
        wrapper.appendChild(copyButton); // Add button to wrapper first
        
        // Then, move the original preElement into the wrapper.
        // No need to clone if tempDiv is not part of the live DOM when this runs.
        // replaceChild will handle moving preElement correctly.
        wrapper.appendChild(preElement.cloneNode(true)); // Using cloneNode for safety as per prompt suggestion
        
        // Replace original pre element with the new wrapper in tempDiv
        if (preElement.parentNode) { // Check if preElement still has a parent in tempDiv
            preElement.parentNode.replaceChild(wrapper, preElement);
        } else {
            // This case should ideally not happen if tempDiv.innerHTML set correctly
            // and preElement was queried from tempDiv.
            // As a fallback, if preElement got detached, append wrapper to tempDiv.
            tempDiv.appendChild(wrapper); 
        }
      });
      contentHtml = tempDiv.innerHTML;
    } else {
      console.warn('marked.js library not found. Displaying raw text.');
      contentHtml = text.replace(/[&<>"']/g, function(match) { // Basic escaping as a fallback
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[match];
      });
    }
  } else {
    // For user messages, just escape HTML to prevent XSS from user input
     contentHtml = text.replace(/[&<>"']/g, function(match) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[match];
      });
  }

  messageDiv.innerHTML = `
    <div class="message-avatar ${sender}-avatar"></div>
    <div class="message-content">${contentHtml}</div>
  `;
  messagesArea.appendChild(messageDiv);
  messagesArea.scrollTop = messagesArea.scrollHeight;

  // Only add raw text to chatMemory for LLM context
  chatMemory.push({
    role: sender === 'user' ? 'user' : 'assistant',
    content: text // Store the original, unprocessed text
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

  const clearButton = document.getElementById('n8n-builder-clear');
  if (clearButton) {
    clearButton.addEventListener('click', () => {
      // 1. Clear chat memory
      chatMemory = [];
      console.log('Chat memory cleared.');

      // 2. Clear messages from DOM
      const messagesArea = document.getElementById('n8n-builder-messages');
      if (messagesArea) {
        messagesArea.innerHTML = '';
        console.log('Chat messages cleared from DOM.');
      }

      // 3. Optional: Add a welcome/cleared message
      addMessage('assistant', 'Chat cleared. How can I help you build your n8n workflow?');
    });
  }
}

// Initialize the chatbot
function processChatHtmlAndInitializeDOM(htmlContent) {
  if (document.getElementById('n8n-builder-chat')) {
    console.log('Chat HTML already injected. Skipping re-injection.');
    // If it's already injected, ensure event listeners are set up (might have been lost if script reloaded)
    // and display welcome message if chat is empty.
    if (!document.querySelector('.n8n-builder-message')) { // Check if messages area is empty
        if (!settings) {
            addMessage('assistant', 'Welcome! Please configure your AI provider settings in the extension popup.');
        } else {
            addMessage('assistant', 'Hello! I can help you build your n8n workflow. What would you like to add?');
        }
    }
    // Ensure event listeners are attached, as they might be lost if the script re-runs or DOM is altered.
    setupEventListeners();
    return; 
  }
  
  const chatContainer = document.createElement('div');
  chatContainer.innerHTML = htmlContent; 
  
  if (chatContainer.firstChild) {
    document.body.appendChild(chatContainer.firstChild);
    console.log('Chat HTML injected and DOM ready.');
  } else {
    console.error('Received empty HTML content for chat.');
    return;
  }

  setupEventListeners(); // Setup listeners for the new DOM elements

  if (!settings) {
    addMessage('assistant', 'Welcome! Please configure your AI provider settings in the extension popup.');
  } else {
    addMessage('assistant', 'Hello! I can help you build your n8n workflow. What would you like to add?');
  }
  hasChatBeenInitialized = true;
}

function initChatbot() {
  // Ensure CSS is requested
  if (!document.getElementById('n8n-builder-styles')) {
    sendToContentScript({ type: 'getResourceURL', path: 'chatbot/chatbot.css' });
  }

  // Assign the function that will process the HTML once received
  window.processChatHtml = processChatHtmlAndInitializeDOM;
  
  // Request the chat HTML from the content script
  // This will trigger the 'chatHtml' event, which then calls processChatHtmlAndInitializeDOM
  sendToContentScript({ type: 'getChatHtml' });
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
    console.log(`Attempting to connect to n8n API at ${settings.n8nApiUrl} with provided API key.`);
    // Make the API call
    (async () => { // Use an async IIFE to use await within the function
      try {
        const response = await fetch(`${settings.n8nApiUrl}/api/v1/me`, {
          method: 'GET',
          headers: {
            'X-N8N-API-KEY': settings.n8nApiKey,
            'Content-Type': 'application/json' 
          }
        });

        if (response.ok) {
          const data = await response.json();
          console.log('n8n API connection test successful. Status:', response.status, 'Response:', data);
          addMessage('assistant', `Successfully connected to n8n instance! User: ${data.email || 'N/A'}`);
          // Future: Here you would proceed to use `extractedJson` to add nodes to the canvas
          // For now, just confirming connection.
        } else {
          const errorText = await response.text();
          console.error(`n8n API connection test failed. Status: ${response.status}. Details: ${errorText}`);
          addMessage('assistant', `Failed to connect to n8n instance. Status: ${response.status}. Check console for error details.`);
        }
      } catch (error) {
        console.error('Error during n8n API connection test:', error);
        addMessage('assistant', `Error connecting to n8n instance: ${error.message}. Is the URL correct and the instance reachable?`);
      }
    })();
  } else {
    console.warn('n8n API settings (URL or Key) are not configured. Cannot test n8n connection.');
    // Optionally, add a message to the user if they try an action that implies n8n use without settings
    addMessage('assistant', 'Cannot perform n8n operation: n8n API URL or Key not set in extension settings.');
  }
}