// Context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'correctit-grammar',
    title: 'CorrectIt: Fix Grammar',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'correctit-professional',
    title: 'CorrectIt: Make Professional',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'correctit-casual',
    title: 'CorrectIt: Make Casual',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'correctit-concise',
    title: 'CorrectIt: Make Concise',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'correctit-friendly',
    title: 'CorrectIt: Make Friendly',
    contexts: ['selection']
  });
});

// Context menu click handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.selectionText || !tab.id) return;

  const modeMap = {
    'correctit-grammar': 'grammar',
    'correctit-professional': 'professional',
    'correctit-casual': 'casual',
    'correctit-concise': 'concise',
    'correctit-friendly': 'friendly'
  };

  const mode = modeMap[info.menuItemId];
  if (!mode) return;

  // Content script is auto-injected via manifest — just send the message
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'show-loading' });
  } catch (e) {
    // Content script not ready on this page — skip
    console.warn('CorrectIt: Content script not available on this tab');
    return;
  }

  try {
    const result = await processText(info.selectionText, mode);
    chrome.tabs.sendMessage(tab.id, {
      action: 'show-result',
      original: info.selectionText,
      result: result,
      mode: mode
    });
  } catch (err) {
    chrome.tabs.sendMessage(tab.id, {
      action: 'show-error',
      error: err.message
    });
  }
});

// Message handler from popup & content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'correct-text' || message.action === 'correct-inline') {
    handleCorrection(message.text, message.mode, message.extra || '', sendResponse);
    return true; // Keep channel open for async response
  }
});

async function handleCorrection(text, mode, extra, sendResponse) {
  try {
    const result = await processText(text, mode, extra);
    sendResponse({ success: true, result });
  } catch (err) {
    try {
      sendResponse({ success: false, error: err.message || 'Something went wrong. Please try again.' });
    } catch (e) {
      // sendResponse port closed — nothing we can do
      console.error('CorrectIt: Port closed before response', e);
    }
  }
}

// Build the prompt for the AI
function buildPrompt(text, mode, extra) {
  const prompts = {
    grammar: `Fix the grammar and spelling errors in the following text. Only correct errors — do not change the tone or style.`,
    professional: `Rewrite the following text to sound professional and formal, suitable for business communication. Keep the same meaning.`,
    casual: `Rewrite the following text to sound casual and relaxed, like a friendly conversation. Keep the same meaning.`,
    concise: `Rewrite the following text to be shorter and more concise while keeping the same meaning. Remove unnecessary words.`,
    friendly: `Rewrite the following text to sound warm and friendly. Keep the same meaning but make it more approachable.`
  };

  let instruction = prompts[mode] || mode;

  // Append user's custom instruction if provided
  if (extra) {
    instruction += ` Also: ${extra}`;
  }

  return `${instruction}\n\nReturn ONLY the modified text, nothing else.\n\nText: "${text}"`;
}

// Process text with AI
async function processText(text, mode, extra) {
  const data = await chrome.storage.local.get(['provider', 'apiKey', 'model']);

  if (!data.apiKey) {
    throw new Error('No API key configured. Open CorrectIt settings to add your key.');
  }

  const provider = data.provider || 'groq';
  const prompt = buildPrompt(text, mode, extra || '');

  if (provider === 'groq') {
    return await callGroq(data.apiKey, data.model || 'llama-3.3-70b-versatile', prompt);
  } else if (provider === 'gemini') {
    return await callGemini(data.apiKey, data.model || 'gemini-2.0-flash', prompt);
  } else {
    return await callOpenAI(data.apiKey, data.model || 'gpt-4o-mini', prompt);
  }
}

// Fetch with timeout
async function fetchWithTimeout(url, options, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    throw err;
  }
}

// Friendly error messages
function friendlyError(rawMessage, status, provider) {
  const msg = (rawMessage || '').toLowerCase();

  if (msg.includes('quota') || msg.includes('rate') || msg.includes('limit') || status === 429) {
    return 'You\'ve hit the free usage limit. Try again in a minute, or switch to a different model in Settings.';
  }
  if (msg.includes('api key') || msg.includes('invalid') || msg.includes('unauthorized') || status === 401) {
    return 'Your API key is invalid. Please check it in Settings.';
  }
  if (status === 403) {
    return 'Access denied. Your API key may not have permission for this model. Check Settings.';
  }
  if (msg.includes('not found') || status === 404) {
    return 'The selected model is not available. Try a different model in Settings.';
  }
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('timeout') || msg.includes('abort')) {
    return 'Could not connect to the AI service. Check your internet connection and try again.';
  }
  if (msg.includes('safety') || msg.includes('blocked') || msg.includes('content filter')) {
    return 'The text was flagged by the AI\'s safety filter. Try rephrasing your text.';
  }
  if (status >= 500) {
    return `The ${provider === 'gemini' ? 'Gemini' : 'OpenAI'} service is temporarily down. Try again in a moment.`;
  }

  return 'Something went wrong. Please try again or check Settings.';
}

// Safely parse JSON response
async function safeJson(response) {
  try {
    const text = await response.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Gemini API
async function callGemini(apiKey, model, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  let response;
  try {
    response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2048
        }
      })
    });
  } catch (err) {
    throw new Error(friendlyError(err.message, 0, 'gemini'));
  }

  if (!response.ok) {
    const errBody = await safeJson(response);
    throw new Error(friendlyError(errBody?.error?.message, response.status, 'gemini'));
  }

  const result = await safeJson(response);
  if (!result) throw new Error('Invalid response from Gemini. Please try again.');

  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No response received. Please try again.');

  return text.replace(/^["']|["']$/g, '').trim();
}

// OpenAI API
async function callOpenAI(apiKey, model, prompt) {
  let response;
  try {
    response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a text correction assistant. Return only the corrected/modified text with no explanations, labels, or quotes.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 2048
      })
    });
  } catch (err) {
    throw new Error(friendlyError(err.message, 0, 'openai'));
  }

  if (!response.ok) {
    const errBody = await safeJson(response);
    throw new Error(friendlyError(errBody?.error?.message, response.status, 'openai'));
  }

  const result = await safeJson(response);
  if (!result) throw new Error('Invalid response from OpenAI. Please try again.');

  const text = result.choices?.[0]?.message?.content;
  if (!text) throw new Error('No response received. Please try again.');

  return text.replace(/^["']|["']$/g, '').trim();
}

// Groq API (OpenAI-compatible)
async function callGroq(apiKey, model, prompt) {
  let response;
  try {
    response = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a text correction assistant. Return only the corrected/modified text with no explanations, labels, or quotes.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 2048
      })
    });
  } catch (err) {
    throw new Error(friendlyError(err.message, 0, 'groq'));
  }

  if (!response.ok) {
    const errBody = await safeJson(response);
    throw new Error(friendlyError(errBody?.error?.message, response.status, 'groq'));
  }

  const result = await safeJson(response);
  if (!result) throw new Error('Invalid response from Groq. Please try again.');

  const groqText = result.choices?.[0]?.message?.content;
  if (!groqText) throw new Error('No response received. Please try again.');

  return groqText.replace(/^["']|["']$/g, '').trim();
}
