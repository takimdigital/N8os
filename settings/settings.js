// settings/settings.js
/**
 * Manages the settings UI for the n8n Co Pilot Chrome Extension.
 * This includes:
 * - Loading and saving general extension settings (AI provider, API keys, model selection).
 * - Loading and saving RAG (Retrieval Augmented Generation) settings (Qdrant, embedding provider).
 * - Dynamic UI updates based on selected settings.
 * - Handling "Test Connection" for n8n API.
 * - Orchestrating the RAG document processing pipeline:
 *   - File reading (.txt, .md, .docx).
 *   - Text chunking.
 *   - Generating embeddings via various providers (Ollama, LM Studio, OpenAI).
 *   - Storing embeddings and metadata in Qdrant.
 * - Displaying status and logs for RAG processing.
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Element References ---
  // General UI elements
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  const showChatButton = document.getElementById('show-chat');
  const settingsButton = document.getElementById('settings-btn');
  const settingsPanel = document.getElementById('settings-panel');
  const saveSettingsButton = document.getElementById('save-settings');
  
  // AI Provider selection elements
  const providerSelect = document.getElementById('provider-select');
  const modelSelect = document.getElementById('model-select');
  const openaiSection = document.getElementById('openai-section');
  const anthropicSection = document.getElementById('anthropic-section');
  const ollamaSection = document.getElementById('ollama-section');
  const lmstudioSection = document.getElementById('lmstudio-section');
  
  // AI Provider input elements
  const openaiKeyInput = document.getElementById('openai-key');
  const anthropicKeyInput = document.getElementById('anthropic-key');
  const ollamaUrlInput = document.getElementById('ollama-url');
  const lmstudioUrlInput = document.getElementById('lmstudio-url');

  // n8n Integration elements
  const n8nApiUrlInput = document.getElementById('n8n-api-url');
  const n8nApiKeyInput = document.getElementById('n8n-api-key');
  const testN8nButton = document.getElementById('test-n8n-connection');
  const n8nStatusDisplay = document.getElementById('n8n-connection-status');

  // RAG Settings Elements
  const qdrantUrlInput = document.getElementById('qdrant-url');
  const qdrantCollectionInput = document.getElementById('qdrant-collection');
  const ragFileInput = document.getElementById('rag-file-input');
  const ragStartProcessingButton = document.getElementById('rag-start-processing');
  const ragStatusArea = document.getElementById('rag-status-area'); // For main status updates
  const toggleLogButton = document.getElementById('toggle-rag-log'); // Button to show/hide detailed logs
  const logAreaDiv = document.getElementById('rag-log-area'); // The div where logs are displayed

  // RAG Embedding Provider UI elements
  const ragEmbeddingProviderSelect = document.getElementById('rag-embedding-provider');
  const ragEmbeddingProviderUrlInput = document.getElementById('rag-embedding-provider-url');
  const ragEmbeddingModelInput = document.getElementById('rag-embedding-model');
  const qdrantVectorSizeInput = document.getElementById('qdrant-vector-size');

  // --- Global-like State Variables for RAG Processing ---
  let currentFileTextContent = ''; // Stores the raw text content of the currently selected file.
  let currentFileChunks = [];      // Stores the array of text chunks generated from currentFileTextContent.
  let currentEmbeddedChunks = [];  // Stores objects containing { text, embedding, source } for processed chunks.

  // --- RAG Log Functionality ---
  /**
   * Adds a log message to the RAG processing log area.
   * @param {string} message - The message to log.
   * @param {string} [type='info'] - The type of log message ('info', 'success', 'error', 'warn', 'progress', 'system').
   */
  function addRagLog(message, type = 'info') {
    if (!logAreaDiv) return;

    const logEntry = document.createElement('div');
    const timestamp = new Date().toLocaleTimeString();
    logEntry.textContent = `[${timestamp}] [${type.toUpperCase()}]: ${message}`;
    logEntry.className = `log-entry log-${type}`; 
    
    // Prepend new log to show latest on top
    if (logAreaDiv.firstChild) {
      logAreaDiv.insertBefore(logEntry, logAreaDiv.firstChild);
    } else {
      logAreaDiv.appendChild(logEntry);
    }
    // Optional: Limit the number of log entries to prevent performance issues
    const maxLogEntries = 100; 
    while (logAreaDiv.childNodes.length > maxLogEntries) {
        logAreaDiv.removeChild(logAreaDiv.lastChild);
    }
    logAreaDiv.scrollTop = 0; // Scroll to top to see the latest log
  }

  // Setup for the log area toggle button
  if (toggleLogButton && logAreaDiv) {
    // Clear initial placeholder comment if present
    if (logAreaDiv.innerHTML.includes("<!--")) {
        logAreaDiv.innerHTML = ''; 
    }
    toggleLogButton.addEventListener('click', () => {
      const isHidden = logAreaDiv.style.display === 'none';
      logAreaDiv.style.display = isHidden ? 'block' : 'none';
      toggleLogButton.textContent = isHidden ? 'Hide Logs' : 'Show Logs';
      if (isHidden && logAreaDiv.childNodes.length === 0) {
        addRagLog('Log area opened. No messages yet.', 'system');
      } else if (isHidden) {
        addRagLog('Log area shown.', 'system'); 
      }
    });
  }
  // --- End RAG Log Functionality ---
  
  /**
   * Updates the main status message area for RAG processing.
   * @param {string} message - The status message to display.
   * @param {string} [type='info'] - The type of message ('info', 'success', 'error', 'progress').
   * @param {boolean} [isLoading=false] - If true, appends "..." to the message.
   */
  function updateRagStatus(message, type = 'info', isLoading = false) {
    if (!ragStatusArea) return; 
    let statusClass = 'connection-status-text'; // Base class for consistent styling with n8n connection status
    switch (type) {
      case 'success': statusClass += ' status-success'; break;
      case 'error': statusClass += ' status-error'; break;
      case 'progress': statusClass += ' status-progress'; break;
      case 'info': default: statusClass += ' status-info'; break;
    }
    ragStatusArea.className = statusClass;
    ragStatusArea.textContent = message + (isLoading ? '...' : '');
  }

  // --- Dynamic UI for RAG Embedding Provider ---
  /**
   * Enables or disables the OpenAI option in the RAG embedding provider dropdown
   * based on the presence of an OpenAI API key.
   */
  function updateOpenAiEmbeddingOptionState() {
    const openAiOption = ragEmbeddingProviderSelect.querySelector('option[value="openai"]');
    if (!openAiOption) return; // Guard against missing element
    if (openaiKeyInput.value.trim() !== '') {
      openAiOption.disabled = false;
    } else {
      openAiOption.disabled = true;
      // If OpenAI was selected and key is removed, default back to Ollama
      if (ragEmbeddingProviderSelect.value === 'openai') {
        ragEmbeddingProviderSelect.value = 'ollama'; 
        handleRagEmbeddingProviderChange(); // Update dependent UI
      }
    }
  }

  /**
   * Handles changes to the RAG embedding provider selection.
   * Manages the visibility and pre-filling of the Embedding Provider URL input.
   */
  function handleRagEmbeddingProviderChange() {
    const selectedProvider = ragEmbeddingProviderSelect.value;
    if (selectedProvider === 'openai') {
      ragEmbeddingProviderUrlInput.value = ''; 
      ragEmbeddingProviderUrlInput.disabled = true;
      ragEmbeddingProviderUrlInput.placeholder = 'Not required for OpenAI';
    } else {
      ragEmbeddingProviderUrlInput.disabled = false;
      ragEmbeddingProviderUrlInput.placeholder = 'e.g., http://localhost:11434 for Ollama';
      // Pre-fill with main provider URL if it matches and RAG URL field is empty
      if (ragEmbeddingProviderUrlInput.value.trim() === '') {
        if (selectedProvider === 'ollama' && ollamaUrlInput.value.trim() !== '') {
          ragEmbeddingProviderUrlInput.value = ollamaUrlInput.value.trim();
        } else if (selectedProvider === 'lmstudio' && lmstudioUrlInput.value.trim() !== '') {
          ragEmbeddingProviderUrlInput.value = lmstudioUrlInput.value.trim();
        }
      }
    }
  }
  // --- End Dynamic UI for RAG Embedding Provider ---

  // Event listener for n8n API connection test button
  if (testN8nButton && n8nApiUrlInput && n8nApiKeyInput && n8nStatusDisplay) {
    testN8nButton.addEventListener('click', async () => {
      const apiUrl = n8nApiUrlInput.value.trim();
      const apiKey = n8nApiKeyInput.value.trim();
      if (!apiUrl || !apiKey) {
        n8nStatusDisplay.textContent = 'n8n API URL and Key are required.';
        n8nStatusDisplay.className = 'connection-status-text status-error';
        setTimeout(() => { n8nStatusDisplay.textContent = ''; n8nStatusDisplay.className = 'connection-status-text'; }, 5000);
        return;
      }
      n8nStatusDisplay.textContent = 'Testing...';
      n8nStatusDisplay.className = 'connection-status-text status-testing';
      try {
        const response = await fetch(`${apiUrl}/api/v1/me`, { method: 'GET', headers: { 'X-N8N-API-KEY': apiKey } });
        const contentType = response.headers.get('content-type');
        if (response.ok) {
          if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            n8nStatusDisplay.textContent = `Success! User: ${data.email || 'N/A'}`;
            n8nStatusDisplay.className = 'connection-status-text status-success';
          } else {
            const textResponse = await response.text();
            console.warn('n8n connection test received OK response but non-JSON content:', textResponse.substring(0, 500));
            n8nStatusDisplay.textContent = 'OK response, but not JSON. Check console for actual content.';
            n8nStatusDisplay.className = 'connection-status-text status-error'; 
          }
        } else { 
          const errorText = await response.text(); 
          console.error(`n8n connection test failed. Status: ${response.status}. Details:`, errorText.substring(0, 500));
          if (contentType && contentType.includes('application/json')) {
            try { const errorJson = JSON.parse(errorText); n8nStatusDisplay.textContent = `Failed: ${response.status} - ${errorJson.message || 'Error from n8n. Check console.'}`; }
            catch (e) { n8nStatusDisplay.textContent = `Failed: ${response.status} - Malformed JSON error. Check console.`; }
          } else { n8nStatusDisplay.textContent = `Failed: ${response.status} - HTML or non-JSON response. Check console.`; }
          n8nStatusDisplay.className = 'connection-status-text status-error';
        }
      } catch (error) {
        console.error('n8n connection fetch error:', error);
        n8nStatusDisplay.textContent = `Network Error: ${error.message.substring(0, 100)}. Check URL & connectivity.`;
        n8nStatusDisplay.className = 'connection-status-text status-error';
      }
      setTimeout(() => { n8nStatusDisplay.textContent = ''; n8nStatusDisplay.className = 'connection-status-text'; }, 7000); 
    });
  }

  /**
   * Fetches available models for the selected AI provider.
   * @param {string} provider - The selected AI provider (e.g., 'ollama', 'lmstudio', 'openai').
   */
  async function fetchModels(provider) {
    modelSelect.disabled = true; modelSelect.innerHTML = '<option value="">Loading models...</option>';
    try {
      let models = [];
      switch (provider) {
        case 'ollama':
          const ollamaUrl = ollamaUrlInput.value.trim(); let finalOllamaUrl = ollamaUrl;
          if (!finalOllamaUrl.startsWith('http://') && !finalOllamaUrl.startsWith('https://')) finalOllamaUrl = 'http://' + finalOllamaUrl;
          try { new URL(finalOllamaUrl); } catch (e) { console.error('Invalid Ollama URL:', finalOllamaUrl, e); modelSelect.innerHTML = '<option value="">Invalid Ollama URL</option>'; modelSelect.disabled = false; return; }
          const ollamaResponse = await fetch(`${finalOllamaUrl}/api/tags`);
          if (!ollamaResponse.ok) throw new Error(`Ollama API request failed with status ${ollamaResponse.status}`);
          const ollamaData = await ollamaResponse.json(); models = ollamaData.models || []; 
          break;
        case 'lmstudio':
          const lmstudioUrl = lmstudioUrlInput.value.trim(); let finalLmstudioUrl = lmstudioUrl;
          if (!finalLmstudioUrl.startsWith('http://') && !finalLmstudioUrl.startsWith('https://')) finalLmstudioUrl = 'http://' + finalLmstudioUrl;
          try { new URL(finalLmstudioUrl); } catch (e) { console.error('Invalid LM Studio URL:', finalLmstudioUrl, e); modelSelect.innerHTML = '<option value="">Invalid LM Studio URL</option>'; modelSelect.disabled = false; return; }
          const lmstudioResponse = await fetch(`${finalLmstudioUrl}/v1/models`);
          if (!lmstudioResponse.ok) throw new Error(`LM Studio API request failed with status ${lmstudioResponse.status}`);
          const lmstudioData = await lmstudioResponse.json(); let rawLmstudioModels = lmstudioData.data || [];
          models = rawLmstudioModels.map(model => ({ id: model.id, name: typeof model.name === 'string' ? model.name : model.id }));
          break;
        case 'openai': models = [{ id: 'gpt-4', name: 'GPT-4' }, { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }]; break;
        case 'anthropic': models = [{ id: 'claude-3-opus', name: 'Claude 3 Opus' }, { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet' }]; break;
      }
      if (models.length > 0) modelSelect.innerHTML = models.map(model => `<option value="${String(model.id)}">${String(model.name)}</option>`).join('');
      else modelSelect.innerHTML = '<option value="">No models found</option>';
      modelSelect.disabled = false;
    } catch (error) { console.error('Error fetching models:', error); modelSelect.innerHTML = '<option value="">Error loading models</option>'; }
  }

  // Event listener for AI provider selection change
  providerSelect.addEventListener('change', () => {
    const provider = providerSelect.value;
    [openaiSection, anthropicSection, ollamaSection, lmstudioSection].forEach(s => s.classList.add('hidden'));
    switch (provider) {
      case 'openai': openaiSection.classList.remove('hidden'); break;
      case 'anthropic': anthropicSection.classList.remove('hidden'); break;
      case 'ollama': ollamaSection.classList.remove('hidden'); break;
      case 'lmstudio': lmstudioSection.classList.remove('hidden'); break;
    }
    fetchModels(provider); // Fetch models for the newly selected provider
  });

  // Load saved settings from chrome.storage.sync
  chrome.storage.sync.get([
    'openaiKey', 'anthropicKey', 'activeProvider', 'n8nApiUrl', 'n8nApiKey',
    'ollamaUrl', 'lmstudioUrl', 'selectedModel', 'qdrantUrl', 'qdrantCollection',
    'ragEmbeddingProvider', 'ragEmbeddingProviderUrl', 'ragEmbeddingModel', 'qdrantVectorSize'
  ], (result) => {
    // Populate standard AI provider settings
    if (result.openaiKey) openaiKeyInput.value = result.openaiKey;
    if (result.anthropicKey) anthropicKeyInput.value = result.anthropicKey;
    if (result.n8nApiUrl) n8nApiUrlInput.value = result.n8nApiUrl;
    if (result.n8nApiKey) n8nApiKeyInput.value = result.n8nApiKey;
    if (result.ollamaUrl) ollamaUrlInput.value = result.ollamaUrl;
    if (result.lmstudioUrl) lmstudioUrlInput.value = result.lmstudioUrl;
    
    // Populate RAG settings
    if (result.qdrantUrl) qdrantUrlInput.value = result.qdrantUrl;
    if (result.qdrantCollection) qdrantCollectionInput.value = result.qdrantCollection;
    if (result.ragEmbeddingProvider) ragEmbeddingProviderSelect.value = result.ragEmbeddingProvider;
    if (result.ragEmbeddingProviderUrl) ragEmbeddingProviderUrlInput.value = result.ragEmbeddingProviderUrl;
    if (result.ragEmbeddingModel) ragEmbeddingModelInput.value = result.ragEmbeddingModel;
    if (result.qdrantVectorSize) qdrantVectorSizeInput.value = result.qdrantVectorSize;
    
    // Set active provider and trigger model fetching
    if (result.activeProvider) { 
      providerSelect.value = result.activeProvider; 
      providerSelect.dispatchEvent(new Event('change')); // This will also call fetchModels
    }
    // Set selected model after models have been potentially loaded
    if (result.selectedModel) { 
      // Using setTimeout to allow model list to populate from fetchModels if activeProvider was set
      setTimeout(() => { modelSelect.value = result.selectedModel; }, 500); 
    }
    
    // Initialize RAG provider UI states after loading all relevant settings
    updateOpenAiEmbeddingOptionState();
    handleRagEmbeddingProviderChange(); 
  });

  // Event listener for saving all settings
  saveSettingsButton.addEventListener('click', async () => {
    const settings = {
      openaiKey: openaiKeyInput.value.trim(),
      anthropicKey: anthropicKeyInput.value.trim(),
      activeProvider: providerSelect.value,
      n8nApiUrl: n8nApiUrlInput.value.trim(),
      n8nApiKey: n8nApiKeyInput.value.trim(),
      ollamaUrl: ollamaUrlInput.value.trim(),
      lmstudioUrl: lmstudioUrlInput.value.trim(),
      selectedModel: modelSelect.value,
      qdrantUrl: qdrantUrlInput.value.trim(),
      qdrantCollection: qdrantCollectionInput.value.trim(),
      ragEmbeddingProvider: ragEmbeddingProviderSelect.value,
      ragEmbeddingProviderUrl: ragEmbeddingProviderUrlInput.value.trim(),
      ragEmbeddingModel: ragEmbeddingModelInput.value.trim(),
      qdrantVectorSize: parseInt(qdrantVectorSizeInput.value, 10) || 768 // Default if parsing fails or empty
    };
    chrome.storage.sync.set(settings, () => {
      saveSettingsButton.textContent = 'Saved!';
      // Notify content script (page.js) about settings update
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].id) { // Ensure tab exists and has an ID
            chrome.tabs.sendMessage(tabs[0].id, { action: 'settingsUpdated', settings });
        }
      });
      setTimeout(() => { saveSettingsButton.textContent = 'Save Settings'; }, 2000);
    });
  });

  // Link main OpenAI API key input to RAG OpenAI option state
  openaiKeyInput.addEventListener('input', updateOpenAiEmbeddingOptionState);
  // Link RAG embedding provider select to its URL field state
  ragEmbeddingProviderSelect.addEventListener('change', handleRagEmbeddingProviderChange);

  // Event listener to show chat interface (sends message to content script)
  showChatButton.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'showChat' });
        window.close(); // Close the popup
      }
    });
  });

  // Event listener to toggle settings panel visibility
  settingsButton.addEventListener('click', () => { settingsPanel.classList.toggle('hidden'); });

  /**
   * Checks if the current URL is likely an n8n page.
   * @param {string} url - The URL to check.
   * @returns {boolean} True if it's likely an n8n page, false otherwise.
   */
  function isN8nPage(url) { 
    return url.includes('n8n') || url.includes('workflow') || url.includes('execution') || url.includes('localhost'); 
  }
  
  // Check current tab URL to determine if it's an n8n page and update UI/storage
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url) {
        const url = tabs[0].url; const isN8nDetected = isN8nPage(url);
        chrome.storage.local.set({ isN8nPage: isN8nDetected }, () => {
          console.log('n8n page status set in storage:', isN8nDetected);
          if (isN8nDetected) { statusIndicator.classList.add('active'); statusText.textContent = 'On an n8n page'; showChatButton.disabled = false; }
          else { statusIndicator.classList.add('inactive'); statusText.textContent = 'Not an n8n page'; showChatButton.disabled = true; }
        });
    }
  });

  /**
   * Fetches an embedding for a given text chunk from the specified provider.
   * @param {string} textChunk - The text chunk to embed.
   * @param {string} providerName - The name of the embedding provider ('ollama', 'lmstudio', 'openai').
   * @param {string} providerUrl - The base URL for the embedding provider (for Ollama/LM Studio).
   * @param {string} modelName - The name of the embedding model to use.
   * @param {string|null} [openAIApiKey=null] - The OpenAI API key, if 'openai' provider is used.
   * @returns {Promise<Array<number>|null>} A promise that resolves to the embedding vector array, or null/throws if an error occurs.
   */
  async function getEmbeddingFromProvider(textChunk, providerName, providerUrl, modelName, openAIApiKey = null) {
    let finalProviderUrl = providerUrl; // Used for Ollama/LMStudio
    
    // Validate and prefix URL for Ollama and LMStudio
    if (providerName === 'ollama' || providerName === 'lmstudio') {
        if (!finalProviderUrl) {
            const errorMsg = `URL for ${providerName} is missing.`;
            console.error(errorMsg); addRagLog(errorMsg, 'error');
            throw new Error(errorMsg);
        }
        if (!finalProviderUrl.startsWith('http://') && !finalProviderUrl.startsWith('https://')) {
            finalProviderUrl = 'http://' + finalProviderUrl;
        }
    }

    let endpoint = '';
    let bodyParams = {}; // Use 'bodyParams' to avoid conflict with 'body' variable name
    let headers = { 'Content-Type': 'application/json' };

    switch (providerName) {
        case 'ollama':
            endpoint = `${finalProviderUrl}/api/embeddings`;
            bodyParams = { model: modelName, prompt: textChunk };
            break;
        case 'lmstudio':
            endpoint = `${finalProviderUrl}/v1/embeddings`; // Standard OpenAI-compatible endpoint
            bodyParams = { model: modelName, input: textChunk }; // Uses "input" like OpenAI
            break;
        case 'openai':
            endpoint = 'https://api.openai.com/v1/embeddings'; // Official OpenAI endpoint
            bodyParams = { model: modelName, input: textChunk };
            if (!openAIApiKey) {
                const errorMsg = 'OpenAI API Key is missing for OpenAI embedding provider.';
                console.error(errorMsg); addRagLog(errorMsg, 'error');
                throw new Error(errorMsg);
            }
            headers['Authorization'] = `Bearer ${openAIApiKey}`;
            break;
        default:
            const errorMsgUnsupported = `Unsupported embedding provider: ${providerName}`;
            console.error(errorMsgUnsupported); addRagLog(errorMsgUnsupported, 'error');
            throw new Error(errorMsgUnsupported);
    }

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(bodyParams),
        });

        if (!response.ok) {
            const errorBodyText = await response.text();
            const errorMsgApi = `${providerName} embedding API error (${response.status}): ${errorBodyText.substring(0, 200)}`;
            console.error(errorMsgApi); addRagLog(errorMsgApi, 'error');
            throw new Error(`${providerName} API request failed with status ${response.status}`);
        }
        const data = await response.json();

        // Parse response based on provider
        switch (providerName) {
            case 'ollama':
                return data.embedding; // Ollama returns embedding directly
            case 'lmstudio': // Assuming LM Studio follows OpenAI structure for this endpoint
            case 'openai':
                if (data.data && data.data[0] && data.data[0].embedding) {
                    return data.data[0].embedding; // OpenAI structure
                } else {
                    const errorMsgStructure = `Unexpected response structure from ${providerName}.`;
                    console.error(errorMsgStructure, data); addRagLog(errorMsgStructure, 'error');
                    throw new Error(errorMsgStructure);
                }
            default: // Should not be reached
                return null;
        }
    } catch (error) {
        // Catch both network errors and errors thrown from response.ok check
        const errorMsgFetch = `Error getting embedding from ${providerName}: ${error.message}`;
        console.error(errorMsgFetch); addRagLog(errorMsgFetch, 'error');
        throw error; // Re-throw to be caught by the caller (processEmbeddingsAndStore)
    }
  }

  // --- Qdrant Interaction Functions ---
  /** Generates a UUID. */
  function generateUUID() { return crypto.randomUUID(); }

  /**
   * Checks if a Qdrant collection exists, creates it if not.
   * @param {string} qdrantUrl - Base URL of Qdrant server.
   * @param {string} collectionName - Name of the collection.
   * @param {number} vectorSize - Size of the vectors to be stored.
   * @param {string} [distanceMetric='Cosine'] - Distance metric for vector comparison.
   * @returns {Promise<boolean>} True if collection exists or was created, false otherwise.
   */
  async function checkOrCreateQdrantCollection(qdrantUrl, collectionName, vectorSize, distanceMetric = 'Cosine') {
    let finalQdrantUrl = qdrantUrl;
    if (!finalQdrantUrl.startsWith('http://') && !finalQdrantUrl.startsWith('https://')) {
        finalQdrantUrl = 'http://' + finalQdrantUrl;
    }
    updateRagStatus(`Checking Qdrant collection '${collectionName}'`, 'progress', true);
    addRagLog(`Checking Qdrant collection '${collectionName}' at ${finalQdrantUrl}...`, 'progress');
    try {
      let response = await fetch(`${finalQdrantUrl}/collections/${collectionName}`);
      if (response.ok) {
        updateRagStatus(`Using existing Qdrant collection: '${collectionName}'.`, 'info');
        addRagLog(`Collection '${collectionName}' exists. Using it.`, 'info');
        return true;
      } else if (response.status === 404) {
        updateRagStatus(`Collection '${collectionName}' not found. Attempting to create`, 'progress', true);
        addRagLog(`Collection '${collectionName}' not found. Attempting to create...`, 'progress');
        response = await fetch(`${finalQdrantUrl}/collections/${collectionName}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vectors: { size: vectorSize, distance: distanceMetric }})
        });
        if (response.ok) {
          updateRagStatus(`Qdrant collection '${collectionName}' created.`, 'success');
          addRagLog(`Collection '${collectionName}' created successfully.`, 'success');
          return true;
        } else {
          const errorBody = await response.text();
          updateRagStatus(`Error: Could not create Qdrant collection. Status: ${response.status}. Check console.`, 'error');
          addRagLog(`Failed to create Qdrant collection '${collectionName}'. Status: ${response.status}. Details: ${errorBody.substring(0,100)}`, 'error');
          console.error(`Failed to create Qdrant collection '${collectionName}' (${response.status}):`, errorBody.substring(0, 500));
          return false;
        }
      } else {
        const errorBody = await response.text();
        updateRagStatus(`Error checking Qdrant collection. Status: ${response.status}. Check console.`, 'error');
        addRagLog(`Error checking Qdrant collection '${collectionName}'. Status: ${response.status}. Details: ${errorBody.substring(0,100)}`, 'error');
        console.error(`Error checking Qdrant collection '${collectionName}' (${response.status}):`, errorBody.substring(0, 500));
        return false;
      }
    } catch (error) {
      updateRagStatus(`Network error or Qdrant unresponsive: ${error.message.substring(0,100)}.`, 'error');
      addRagLog(`Network error or Qdrant unresponsive: ${error.message}`, 'error');
      console.error('Error interacting with Qdrant collection:', error);
      return false;
    }
  }

  /**
   * Upserts points (vectors and payloads) to a Qdrant collection.
   * @param {string} qdrantUrl - Base URL of Qdrant server.
   * @param {string} collectionName - Name of the collection.
   * @param {Array<object>} points - Array of points to upsert.
   * @returns {Promise<boolean>} True if upsert was successful, false otherwise.
   */
  async function upsertPointsToQdrant(qdrantUrl, collectionName, points) {
    if (points.length === 0) {
      updateRagStatus("No points to upsert.", 'info'); addRagLog("No points to upsert.", 'info'); return false; 
    }
    updateRagStatus(`Upserting ${points.length} points to Qdrant collection '${collectionName}'`, 'progress', true);
    addRagLog(`Upserting ${points.length} points to Qdrant collection '${collectionName}'...`, 'progress');
    let finalQdrantUrl = qdrantUrl;
    if (!finalQdrantUrl.startsWith('http://') && !finalQdrantUrl.startsWith('https://')) {
        finalQdrantUrl = 'http://' + finalQdrantUrl;
    }
    try {
      const response = await fetch(`${finalQdrantUrl}/collections/${collectionName}/points?wait=true`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: points })
      });
      if (response.ok) {
        const result = await response.json();
        if (result.status === "ok" && result.result && result.result.status === "ok") {
            updateRagStatus(`Successfully upserted ${points.length} points to '${collectionName}'.`, 'success');
            addRagLog(`Successfully upserted ${points.length} points to '${collectionName}'.`, 'success');
            return true;
        } else {
            updateRagStatus(`Error during Qdrant upsert: ${result.result ? result.result.status : 'Unknown error, check console.'}`, 'error');
            addRagLog(`Error during Qdrant upsert: ${result.result ? result.result.status : JSON.stringify(result)}`, 'error');
            console.error('Qdrant upsert reported an error in the response body:', result); return false;
        }
      } else {
        const errorBody = await response.text();
        updateRagStatus(`Error: Could not upsert points to Qdrant. Status: ${response.status}. Check console.`, 'error');
        addRagLog(`Failed to upsert points to Qdrant. Status: ${response.status}. Details: ${errorBody.substring(0,100)}`, 'error');
        console.error(`Failed to upsert points to Qdrant (${response.status}):`, errorBody.substring(0, 500)); return false;
      }
    } catch (error) {
      updateRagStatus(`Network error or Qdrant unresponsive during upsert: ${error.message.substring(0,100)}.`, 'error');
      addRagLog(`Network error or Qdrant unresponsive during upsert: ${error.message}`, 'error');
      console.error('Error upserting points to Qdrant:', error); return false;
    }
  }
  // --- End Qdrant Interaction Functions ---

  /**
   * Orchestrates the process of embedding text chunks and storing them in Qdrant.
   * @param {Array<string>} chunks - Array of text chunks to process.
   * @param {string} sourceFilename - The name of the source file for metadata.
   */
  async function processEmbeddingsAndStore(chunks, sourceFilename) {
    currentEmbeddedChunks = []; 
    
    // Retrieve RAG settings from DOM elements
    const selectedEmbeddingProvider = ragEmbeddingProviderSelect.value;
    const embeddingProviderUrl = ragEmbeddingProviderUrlInput.value.trim();
    const embeddingModelName = ragEmbeddingModelInput.value.trim();
    const mainOpenAIApiKey = openaiKeyInput.value.trim(); // Main OpenAI key
    const qdrantUrl = qdrantUrlInput.value.trim();
    const qdrantCollectionName = qdrantCollectionInput.value.trim();
    const vectorSize = parseInt(qdrantVectorSizeInput.value, 10) || 768; // Get from UI

    // Validation for necessary RAG settings
    if (!embeddingModelName) {
        updateRagStatus('Error: Embedding Model Name is not configured.', 'error');
        addRagLog('Embedding Model Name not configured. Aborting RAG process.', 'error');
        return;
    }
    if (selectedEmbeddingProvider === 'openai' && !mainOpenAIApiKey) {
        updateRagStatus('Error: OpenAI API Key is not configured for OpenAI embeddings.', 'error');
        addRagLog('OpenAI API Key not configured. Aborting RAG process.', 'error');
        return;
    }
    // For Ollama and LMStudio, provider URL is taken from ragEmbeddingProviderUrlInput
    if ((selectedEmbeddingProvider === 'ollama' || selectedEmbeddingProvider === 'lmstudio') && !embeddingProviderUrl) {
        updateRagStatus(`Error: Embedding Provider URL for ${selectedEmbeddingProvider} is not configured.`, 'error');
        addRagLog(`Embedding Provider URL for ${selectedEmbeddingProvider} not configured. Aborting.`, 'error');
        return;
    }
    if (!qdrantUrl || !qdrantCollectionName) {
        updateRagStatus('Error: Qdrant URL or Collection Name not configured.', 'error');
        addRagLog('Qdrant URL or Collection Name not configured. Aborting RAG process.', 'error');
        return;
    }

    updateRagStatus(`Starting embedding process for ${chunks.length} chunks`, 'progress', true);
    addRagLog(`Starting embedding process for ${chunks.length} chunks from file: ${sourceFilename}. Using ${selectedEmbeddingProvider}.`, 'progress');
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      updateRagStatus(`Embedding chunk ${i + 1} of ${chunks.length}`, 'progress', true);
      addRagLog(`Embedding chunk ${i + 1} of ${chunks.length}...`, 'progress');
      try {
        // Pass the correct provider URL (embeddingProviderUrl) and model name
        const embedding = await getEmbeddingFromProvider(chunk, selectedEmbeddingProvider, embeddingProviderUrl, embeddingModelName, mainOpenAIApiKey);
        if (embedding) {
          currentEmbeddedChunks.push({ text: chunk, embedding: embedding, source: sourceFilename });
        } else {
          console.warn(`Embedding for chunk ${i+1} was null. Skipping this chunk.`);
          addRagLog(`Embedding for chunk ${i+1} returned null. Skipping.`, 'warn');
        }
      } catch (error) {
        updateRagStatus(`Error embedding chunk ${i + 1}: ${error.message}. Check console.`, 'error');
        addRagLog(`Error embedding chunk ${i + 1}: ${error.message}`, 'error');
        return; 
      }
    }
    if (currentEmbeddedChunks.length === 0 && chunks.length > 0) {
        updateRagStatus('Embedding process failed for all chunks. Nothing to store.', 'error');
        addRagLog('Embedding process failed for all chunks. Nothing to store.', 'error');
        return;
    }
    if (currentEmbeddedChunks.length < chunks.length) {
        updateRagStatus(`Processed ${chunks.length} chunks, but only ${currentEmbeddedChunks.length} were successfully embedded. Proceeding.`, 'info');
        addRagLog(`Partial embedding success: ${currentEmbeddedChunks.length} of ${chunks.length} chunks embedded.`, 'warn');
        await new Promise(resolve => setTimeout(resolve, 2000)); 
    } else {
        updateRagStatus(`All ${chunks.length} chunks embedded successfully. Proceeding to Qdrant storage...`, 'success');
        addRagLog(`All ${chunks.length} chunks embedded successfully.`, 'success');
    }
    const collectionReady = await checkOrCreateQdrantCollection(qdrantUrl, qdrantCollectionName, vectorSize);
    if (!collectionReady) { return; }
    const pointsToUpsert = currentEmbeddedChunks.map(item => ({
      id: generateUUID(), vector: item.embedding, payload: { text: item.text, source: item.source }
    }));
    await upsertPointsToQdrant(qdrantUrl, qdrantCollectionName, pointsToUpsert);
  }

  /**
   * Chunks text into smaller pieces with optional overlap.
   * @param {string} text - The text to chunk.
   * @param {number} [chunkSize=750] - The maximum size of each chunk.
   * @param {number} [overlap=100] - The number of characters to overlap between chunks.
   * @returns {Array<string>} An array of text chunks.
   */
  function chunkText(text, chunkSize = 750, overlap = 100) {
    if (!text) return [];
    const chunks = []; let startIndex = 0;
    while (startIndex < text.length) {
      const endIndex = Math.min(startIndex + chunkSize, text.length);
      chunks.push(text.substring(startIndex, endIndex));
      if (endIndex === text.length) break;
      startIndex += (chunkSize - overlap);
    }
    return chunks;
  }
  
  /**
   * Handles the text content extracted from a file, initiates chunking and embedding.
   * @param {string} textContent - The extracted text content.
   * @param {string} fileName - The name of the source file.
   */
  function handleTextExtracted(textContent, fileName) {
    currentFileTextContent = textContent; 
    addRagLog(`Successfully extracted text from "${fileName}".`, 'info');
    const chunks = chunkText(currentFileTextContent); 
    currentFileChunks = chunks;
    updateRagStatus(`Successfully read "${fileName}". Created ${chunks.length} text chunks.`, 'info');
    addRagLog(`Created ${chunks.length} text chunks from "${fileName}".`, 'info');
    
    // processEmbeddingsAndStore will now get its config from DOM elements
    processEmbeddingsAndStore(currentFileChunks, fileName);
  }

  // Event listener for the RAG "Start Processing" button
  if (ragStartProcessingButton && ragFileInput && ragStatusArea) {
    ragStartProcessingButton.addEventListener('click', () => {
      const file = ragFileInput.files[0];
      if (!file) {
        updateRagStatus('Error: No file selected.', 'error');
        addRagLog('No file selected for RAG processing.', 'error');
        return;
      }
      const fileName = file.name;
      const fileExt = fileName.split('.').pop().toLowerCase();
      if (fileExt !== 'txt' && fileExt !== 'md' && fileExt !== 'docx') {
        updateRagStatus(`Error: Only .txt, .md, and .docx files are supported. You selected: .${fileExt}`, 'error');
        addRagLog(`Unsupported file type: .${fileExt}. Only .txt, .md, .docx are allowed.`, 'error');
        return;
      }
      updateRagStatus(`Reading file: ${fileName}`, 'progress', true);
      addRagLog(`Starting to read file: "${fileName}"`, 'progress');
      const reader = new FileReader();
      reader.onload = function(e) {
        if (fileExt === 'txt' || fileExt === 'md') {
            addRagLog(`File "${fileName}" read as text.`, 'info');
            handleTextExtracted(e.target.result, fileName);
        } else if (fileExt === 'docx') {
            addRagLog(`File "${fileName}" read as ArrayBuffer for DOCX parsing.`, 'info');
            const arrayBuffer = e.target.result;
            if (typeof mammoth === 'undefined') {
                updateRagStatus('Error: DOCX parsing library not loaded.', 'error');
                addRagLog('mammoth.js library for DOCX parsing not loaded.', 'error');
                return;
            }
            updateRagStatus('Extracting text from DOCX...', 'progress', true);
            addRagLog('Extracting text from DOCX using mammoth.js...', 'progress');
            mammoth.extractRawText({ arrayBuffer: arrayBuffer })
              .then(result => handleTextExtracted(result.value, fileName))
              .catch(err => {
                updateRagStatus('Error extracting text from .docx. See console.', 'error');
                addRagLog(`Error extracting text from .docx: ${err.message}`, 'error');
                console.error('Error extracting text from .docx:', err);
              });
        }
      };
      reader.onerror = function(e) {
        updateRagStatus('Error reading file. See console for details.', 'error');
        addRagLog(`File reading error: ${reader.error.message}`, 'error');
        console.error('File reading error:', reader.error);
      };
      if (fileExt === 'txt' || fileExt === 'md') {
        reader.readAsText(file);
      } else if (fileExt === 'docx') {
        reader.readAsArrayBuffer(file);
      }
    });
  }
});