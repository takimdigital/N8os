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

  // RAG Settings Elements
  const qdrantUrlInput = document.getElementById('qdrant-url');
  const qdrantCollectionInput = document.getElementById('qdrant-collection');
  const ragFileInput = document.getElementById('rag-file-input');
  const ragStartProcessingButton = document.getElementById('rag-start-processing');
  const ragStatusArea = document.getElementById('rag-status-area');
  const toggleLogButton = document.getElementById('toggle-rag-log');
  const logAreaDiv = document.getElementById('rag-log-area');
  let currentFileTextContent = ''; // Temporary store for file content
  let currentFileChunks = []; // To store the text chunks
  let currentEmbeddedChunks = []; // To store chunks with their embeddings

  // --- RAG Log Functionality ---
  function addRagLog(message, type = 'info') {
    if (!logAreaDiv) return;

    const logEntry = document.createElement('div');
    const timestamp = new Date().toLocaleTimeString();
    logEntry.textContent = `[${timestamp}] [${type.toUpperCase()}]: ${message}`;
    logEntry.className = `log-entry log-${type}`; 
    
    if (logAreaDiv.firstChild) {
      logAreaDiv.insertBefore(logEntry, logAreaDiv.firstChild);
    } else {
      logAreaDiv.appendChild(logEntry);
    }
    const maxLogEntries = 100; 
    while (logAreaDiv.childNodes.length > maxLogEntries) {
        logAreaDiv.removeChild(logAreaDiv.lastChild);
    }
    logAreaDiv.scrollTop = 0; 
  }

  if (toggleLogButton && logAreaDiv) {
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
  
  // Centralized RAG Status Update Function
  function updateRagStatus(message, type = 'info', isLoading = false) {
    if (!ragStatusArea) return; 
    
    let statusClass = 'connection-status-text'; 
    switch (type) {
      case 'success': statusClass += ' status-success'; break;
      case 'error': statusClass += ' status-error'; break;
      case 'progress': statusClass += ' status-progress'; break;
      case 'info': default: statusClass += ' status-info'; break;
    }
    ragStatusArea.className = statusClass;
    ragStatusArea.textContent = message + (isLoading ? '...' : '');
  }

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
          headers: { 'X-N8N-API-KEY': apiKey }
        });
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
            try {
              const errorJson = JSON.parse(errorText); 
              n8nStatusDisplay.textContent = `Failed: ${response.status} - ${errorJson.message || 'Error from n8n. Check console.'}`;
            } catch (e) {
              n8nStatusDisplay.textContent = `Failed: ${response.status} - Malformed JSON error. Check console.`;
            }
          } else { 
            n8nStatusDisplay.textContent = `Failed: ${response.status} - HTML or non-JSON response. Check console.`;
          }
          n8nStatusDisplay.className = 'connection-status-text status-error';
        }
      } catch (error) {
        console.error('n8n connection fetch error:', error);
        n8nStatusDisplay.textContent = `Network Error: ${error.message.substring(0, 100)}. Check URL & connectivity.`;
        n8nStatusDisplay.className = 'connection-status-text status-error';
      }
      setTimeout(() => {
        n8nStatusDisplay.textContent = '';
        n8nStatusDisplay.className = 'connection-status-text';
      }, 7000); 
    });
  }

  async function fetchModels(provider) {
    modelSelect.disabled = true;
    modelSelect.innerHTML = '<option value="">Loading models...</option>';
    try {
      let models = [];
      switch (provider) {
        case 'ollama':
          const ollamaUrl = ollamaUrlInput.value.trim();
          let finalOllamaUrl = ollamaUrl;
          if (!finalOllamaUrl.startsWith('http://') && !finalOllamaUrl.startsWith('https://')) {
              finalOllamaUrl = 'http://' + finalOllamaUrl;
          }
          try { new URL(finalOllamaUrl); } catch (e) {
              console.error('Invalid Ollama URL:', finalOllamaUrl, e);
              modelSelect.innerHTML = '<option value="">Invalid Ollama URL</option>';
              modelSelect.disabled = false; return;
          }
          const ollamaResponse = await fetch(`${finalOllamaUrl}/api/tags`);
          if (!ollamaResponse.ok) throw new Error(`Ollama API request failed with status ${ollamaResponse.status}`);
          const ollamaData = await ollamaResponse.json();
          models = ollamaData.models || []; 
          break;
        case 'lmstudio':
          const lmstudioUrl = lmstudioUrlInput.value.trim();
          let finalLmstudioUrl = lmstudioUrl;
          if (!finalLmstudioUrl.startsWith('http://') && !finalLmstudioUrl.startsWith('https://')) {
            finalLmstudioUrl = 'http://' + finalLmstudioUrl;
          }
          try { new URL(finalLmstudioUrl); } catch (e) {
            console.error('Invalid LM Studio URL:', finalLmstudioUrl, e);
            modelSelect.innerHTML = '<option value="">Invalid LM Studio URL</option>';
            modelSelect.disabled = false; return;
          }
          const lmstudioResponse = await fetch(`${finalLmstudioUrl}/v1/models`);
          if (!lmstudioResponse.ok) throw new Error(`LM Studio API request failed with status ${lmstudioResponse.status}`);
          const lmstudioData = await lmstudioResponse.json();
          let rawLmstudioModels = lmstudioData.data || [];
          models = rawLmstudioModels.map(model => ({
            id: model.id,
            name: typeof model.name === 'string' ? model.name : model.id 
          }));
          break;
        case 'openai':
          models = [{ id: 'gpt-4', name: 'GPT-4' }, { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }];
          break;
        case 'anthropic':
          models = [{ id: 'claude-3-opus', name: 'Claude 3 Opus' }, { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet' }];
          break;
      }
      if (models.length > 0) {
        modelSelect.innerHTML = models.map(model => `<option value="${String(model.id)}">${String(model.name)}</option>`).join('');
      } else {
        modelSelect.innerHTML = '<option value="">No models found</option>';
      }
      modelSelect.disabled = false;
    } catch (error) {
      console.error('Error fetching models:', error);
      modelSelect.innerHTML = '<option value="">Error loading models</option>';
    }
  }

  providerSelect.addEventListener('change', () => {
    const provider = providerSelect.value;
    [openaiSection, anthropicSection, ollamaSection, lmstudioSection].forEach(s => s.classList.add('hidden'));
    switch (provider) {
      case 'openai': openaiSection.classList.remove('hidden'); break;
      case 'anthropic': anthropicSection.classList.remove('hidden'); break;
      case 'ollama': ollamaSection.classList.remove('hidden'); break;
      case 'lmstudio': lmstudioSection.classList.remove('hidden'); break;
    }
    fetchModels(provider);
  });

  chrome.storage.sync.get([
    'openaiKey', 'anthropicKey', 'activeProvider', 'n8nApiUrl', 'n8nApiKey',
    'ollamaUrl', 'lmstudioUrl', 'selectedModel', 'qdrantUrl', 'qdrantCollection'
  ], (result) => {
    if (result.openaiKey) openaiKeyInput.value = result.openaiKey;
    if (result.anthropicKey) anthropicKeyInput.value = result.anthropicKey;
    if (result.n8nApiUrl) n8nApiUrlInput.value = result.n8nApiUrl;
    if (result.n8nApiKey) n8nApiKeyInput.value = result.n8nApiKey;
    if (result.ollamaUrl) ollamaUrlInput.value = result.ollamaUrl;
    if (result.lmstudioUrl) lmstudioUrlInput.value = result.lmstudioUrl;
    if (result.qdrantUrl) qdrantUrlInput.value = result.qdrantUrl;
    if (result.qdrantCollection) qdrantCollectionInput.value = result.qdrantCollection;
    if (result.activeProvider) {
      providerSelect.value = result.activeProvider;
      providerSelect.dispatchEvent(new Event('change'));
    }
    if (result.selectedModel) {
      setTimeout(() => { modelSelect.value = result.selectedModel; }, 500);
    }
  });

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
      qdrantCollection: qdrantCollectionInput.value.trim()
    };
    chrome.storage.sync.set(settings, () => {
      saveSettingsButton.textContent = 'Saved!';
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'settingsUpdated', settings });
      });
      setTimeout(() => { saveSettingsButton.textContent = 'Save Settings'; }, 2000);
    });
  });

  showChatButton.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'showChat' });
      window.close();
    });
  });

  settingsButton.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
  });

  function isN8nPage(url) {
    return url.includes('n8n') || url.includes('workflow') || url.includes('execution') || url.includes('localhost');
  }
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0].url;
    const isN8nDetected = isN8nPage(url);
    chrome.storage.local.set({ isN8nPage: isN8nDetected }, () => {
      console.log('n8n page status set in storage:', isN8nDetected);
      if (isN8nDetected) {
        statusIndicator.classList.add('active'); statusText.textContent = 'On an n8n page'; showChatButton.disabled = false;
      } else {
        statusIndicator.classList.add('inactive'); statusText.textContent = 'Not an n8n page'; showChatButton.disabled = true;
      }
    });
  });

  async function getOllamaEmbedding(textChunk, ollamaUrl) {
    if (!textChunk || !ollamaUrl) { console.error('Text chunk or Ollama URL is missing for embedding.'); return null; }
    let finalOllamaUrl = ollamaUrl;
    if (!finalOllamaUrl.startsWith('http://') && !finalOllamaUrl.startsWith('https://')) {
        finalOllamaUrl = 'http://' + finalOllamaUrl;
    }
    try {
      const response = await fetch(`${finalOllamaUrl}/api/embeddings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'nomic-embed-text:latest', prompt: textChunk }),
      });
      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Ollama embedding API error (${response.status}):`, errorBody.substring(0, 500));
        throw new Error(`Ollama API request failed with status ${response.status}`);
      }
      const data = await response.json(); return data.embedding; 
    } catch (error) { console.error('Error getting Ollama embedding:', error); throw error; }
  }

  // --- Qdrant Interaction Functions ---
  function generateUUID() { return crypto.randomUUID(); }

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

  async function upsertPointsToQdrant(qdrantUrl, collectionName, points) {
    if (points.length === 0) {
      updateRagStatus("No points to upsert.", 'info');
      addRagLog("No points to upsert.", 'info');
      return false; 
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
            console.error('Qdrant upsert reported an error in the response body:', result);
            return false;
        }
      } else {
        const errorBody = await response.text();
        updateRagStatus(`Error: Could not upsert points to Qdrant. Status: ${response.status}. Check console.`, 'error');
        addRagLog(`Failed to upsert points to Qdrant. Status: ${response.status}. Details: ${errorBody.substring(0,100)}`, 'error');
        console.error(`Failed to upsert points to Qdrant (${response.status}):`, errorBody.substring(0, 500));
        return false;
      }
    } catch (error) {
      updateRagStatus(`Network error or Qdrant unresponsive during upsert: ${error.message.substring(0,100)}.`, 'error');
      addRagLog(`Network error or Qdrant unresponsive during upsert: ${error.message}`, 'error');
      console.error('Error upserting points to Qdrant:', error);
      return false;
    }
  }
  // --- End Qdrant Interaction Functions ---

  async function processEmbeddingsAndStore(chunks, ollamaUrl, qdrantUrl, qdrantCollectionName, sourceFilename) {
    currentEmbeddedChunks = []; 
    const vectorSize = 768; 
    if (!ollamaUrl) {
        updateRagStatus('Error: Ollama URL not configured in settings.', 'error');
        addRagLog('Ollama URL not configured. Aborting RAG process.', 'error');
        return;
    }
    if (!qdrantUrl || !qdrantCollectionName) {
        updateRagStatus('Error: Qdrant URL or Collection Name not configured.', 'error');
        addRagLog('Qdrant URL or Collection Name not configured. Aborting RAG process.', 'error');
        return;
    }
    updateRagStatus(`Starting embedding process for ${chunks.length} chunks`, 'progress', true);
    addRagLog(`Starting embedding process for ${chunks.length} chunks from file: ${sourceFilename}.`, 'progress');
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      updateRagStatus(`Embedding chunk ${i + 1} of ${chunks.length}`, 'progress', true);
      addRagLog(`Embedding chunk ${i + 1} of ${chunks.length}...`, 'progress');
      try {
        const embedding = await getOllamaEmbedding(chunk, ollamaUrl);
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
  
  function handleTextExtracted(textContent, fileName) {
    currentFileTextContent = textContent; 
    addRagLog(`Successfully extracted text from "${fileName}".`, 'info');
    const chunks = chunkText(currentFileTextContent); 
    currentFileChunks = chunks;
    updateRagStatus(`Successfully read "${fileName}". Created ${chunks.length} text chunks.`, 'info');
    addRagLog(`Created ${chunks.length} text chunks from "${fileName}".`, 'info');
    const ollamaUrlValue = ollamaUrlInput.value.trim();
    const qdrantUrlValue = qdrantUrlInput.value.trim();
    const qdrantCollectionValue = qdrantCollectionInput.value.trim();
    if (!ollamaUrlValue || !qdrantUrlValue || !qdrantCollectionValue) {
        updateRagStatus('Error: Ollama URL, Qdrant URL, or Collection Name is not configured.', 'error');
        addRagLog('Missing RAG configuration (Ollama URL, Qdrant URL, or Collection Name). Aborting.', 'error');
        return;
    }
    processEmbeddingsAndStore(currentFileChunks, ollamaUrlValue, qdrantUrlValue, qdrantCollectionValue, fileName);
  }

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