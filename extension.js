// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
    console.log('n8n Co Pilot Extension installed');
  });
  
  // Message handling between popup/settings and content script/chatbot
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Message received in background:', request);
  
    // No longer need to handle pageStatus since detection is in settings.js
    // Instead, we'll handle other message types
  
    // Pass through any settings updates from popup to content script
    if (request.action === 'settingsUpdated') {
      console.log('Settings updated, passing to tabs');
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, request).catch(err => {
            // Ignore errors for tabs that don't have listeners
            console.log(`Could not send to tab ${tab.id}`, err);
          });
        });
      });
    }
  
    // Handle showChat request from settings
    if (request.action === 'showChat') {
      console.log('Show chat request received in background');
      // We'll pass this to the content script of the active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, request);
        }
      });
    }
  
    sendResponse({ status: 'received' });
    return true;
  });