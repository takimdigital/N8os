console.log('page.js loaded');

// Cache for extension resource URLs
const resourceURLCache = {};

// Inject the chatbot icon script on all pages
function injectChatbotScript() {
  // Check if chatbot scripts are already loaded
  if (!document.getElementById('n8n-builder-chatbot-script')) {
    // Inject chatbot script
    const script = document.createElement('script');
    script.id = 'n8n-builder-chatbot-script';
    script.src = chrome.runtime.getURL('chatbot/chatbot.js');
    document.head.appendChild(script);
    console.log('Chatbot script injected');
  }
}

// Get all required resource URLs
function getResourceURLs() {
  return {
    'chatbot/chatbot.css': chrome.runtime.getURL('chatbot/chatbot.css'),
    'chatbot/chatbot.html': chrome.runtime.getURL('chatbot/chatbot.html'),
    'icons/chat-icon-48.png': chrome.runtime.getURL('icons/chat-icon-48.png')
  };
}

// Fetch content of a file
function fetchResource(path) {
  return fetch(chrome.runtime.getURL(path))
    .then(response => response.text());
}

// Setup communication bridge between content script and injected script
function setupCommunicationBridge() {
  // Listen for events from the injected script
  window.addEventListener('n8nCopilotInjectedEvent', async (event) => {
    const data = event.detail;
    console.log('Event from injected script:', data);
    
    // Handle various requests from the injected script
    switch (data.type) {
      case 'getIsN8nPage':
        chrome.storage.local.get(['isN8nPage'], (result) => {
          window.dispatchEvent(new CustomEvent('n8nCopilotContentEvent', {
            detail: {
              type: 'isN8nPageResponse',
              isN8nPage: result.isN8nPage || false
            }
          }));
        });
        break;
        
      case 'getResourceURLs':
        window.dispatchEvent(new CustomEvent('n8nCopilotContentEvent', {
          detail: {
            type: 'resourceURLs',
            resources: getResourceURLs()
          }
        }));
        break;
        
      case 'getResourceURL':
        const url = chrome.runtime.getURL(data.path);
        resourceURLCache[data.path] = url;
        window.dispatchEvent(new CustomEvent('n8nCopilotContentEvent', {
          detail: {
            type: 'resourceURL',
            path: data.path,
            url: url
          }
        }));
        break;
        
      case 'getChatHtml':
        const html = await fetchResource('chatbot/chatbot.html');
        window.dispatchEvent(new CustomEvent('n8nCopilotContentEvent', {
          detail: {
            type: 'chatHtml',
            html: html
          }
        }));
        // If a callback was specified, call it with the HTML
        if (data.callback && window[data.callback]) {
          window[data.callback](html);
        }
        break;
        
      case 'getSettings':
        chrome.storage.sync.get(['openaiKey', 'anthropicKey', 'activeProvider'], (result) => {
          window.dispatchEvent(new CustomEvent('n8nCopilotContentEvent', {
            detail: {
              type: 'settingsUpdated',
              settings: {
                openaiKey: result.openaiKey || '',
                anthropicKey: result.anthropicKey || '',
                activeProvider: result.activeProvider || 'openai'
              }
            }
          }));
        });
        break;
    }
  });
}

// Listen for messages from extension.js or settings
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received in content script:', request);
  
  // Handle the showChat action from settings
  if (request.action === 'showChat') {
    console.log('Show chat action received');
    
    // Make sure the chatbot script is injected
    injectChatbotScript();
    
    // Send a custom event to the injected script to show chat
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('n8nCopilotContentEvent', {
        detail: {
          type: 'showChat'
        }
      }));
    }, 200); // Longer delay to ensure script is loaded
  }
  
  // Pass settings updates to the injected script
  if (request.action === 'settingsUpdated') {
    window.dispatchEvent(new CustomEvent('n8nCopilotContentEvent', {
      detail: {
        type: 'settingsUpdated',
        settings: request.settings
      }
    }));
  }
  
  sendResponse({ status: 'received' });
  return true;
});

// Initialize
injectChatbotScript();
setupCommunicationBridge();

// Check if we're on an n8n page from storage
chrome.storage.local.get(['isN8nPage'], (result) => {
  console.log('Retrieved isN8nPage from storage:', result.isN8nPage);
});