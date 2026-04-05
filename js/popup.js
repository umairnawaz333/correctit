document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const mainView = document.getElementById('main-view');
  const settingsView = document.getElementById('settings-view');
  const settingsBtn = document.getElementById('settings-btn');
  const backBtn = document.getElementById('back-btn');
  const bannerSettingsLink = document.getElementById('banner-settings-link');

  const inputText = document.getElementById('input-text');
  const charCount = document.getElementById('char-count');
  const pasteBtn = document.getElementById('paste-btn');
  const clearBtn = document.getElementById('clear-btn');
  const correctBtn = document.getElementById('correct-btn');
  const btnText = correctBtn.querySelector('.btn-text');
  const spinner = correctBtn.querySelector('.spinner');

  const modeBtns = document.querySelectorAll('.mode-btn');
  const customPromptWrap = document.getElementById('custom-prompt-wrap');
  const customPrompt = document.getElementById('custom-prompt');

  const resultSection = document.getElementById('result-section');
  const resultText = document.getElementById('result-text');
  const copyBtn = document.getElementById('copy-btn');
  const replaceBtn = document.getElementById('replace-btn');
  const noKeyBanner = document.getElementById('no-key-banner');
  const errorToast = document.getElementById('error-toast');
  const errorToastText = document.getElementById('error-toast-text');
  const errorToastClose = document.getElementById('error-toast-close');

  // Settings elements
  const providerSelect = document.getElementById('provider-select');
  const apiKeyInput = document.getElementById('api-key-input');
  const apiKeyLabel = document.getElementById('api-key-label');
  const apiHelp = document.getElementById('api-help');
  const modelSelect = document.getElementById('model-select');
  const toggleKey = document.getElementById('toggle-key');
  const saveSettingsBtn = document.getElementById('save-settings');
  const saveStatus = document.getElementById('save-status');
  const apiKeyGroup = document.getElementById('api-key-group');

  let selectedMode = 'grammar';

  const openrouterModels = [
    { value: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (Best)' },
    { value: 'qwen/qwen3-30b-a3b:free', label: 'Qwen 3 30B (Fast)' },
    { value: 'google/gemma-3-27b-it:free', label: 'Gemma 3 27B' }
  ];

  const groqModels = [
    { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (Best)' },
    { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (Fastest)' },
    { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' }
  ];

  const geminiModels = [
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Fast)' },
    { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite (Fastest)' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' }
  ];

  const openaiModels = [
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Fast & Cheap)' },
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' }
  ];

  // Load settings
  chrome.storage.local.get(['provider', 'apiKey', 'model'], (data) => {
    const provider = data.provider || 'openrouter';
    providerSelect.value = provider;
    if (data.apiKey) {
      apiKeyInput.value = data.apiKey;
    }
    updateProviderUI(provider);
    if (data.model) modelSelect.value = data.model;
    updateCorrectBtn();
  });

  // Navigation
  settingsBtn.addEventListener('click', () => {
    mainView.classList.add('hidden');
    settingsView.classList.remove('hidden');
  });

  backBtn.addEventListener('click', () => {
    settingsView.classList.add('hidden');
    mainView.classList.remove('hidden');
  });

  bannerSettingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    mainView.classList.add('hidden');
    settingsView.classList.remove('hidden');
  });

  // Text input
  inputText.addEventListener('input', () => {
    charCount.textContent = `${inputText.value.length} / 5000`;
    updateCorrectBtn();
  });

  // Keyboard shortcut
  inputText.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (!correctBtn.disabled) correctBtn.click();
    }
  });

  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      inputText.value = text;
      inputText.dispatchEvent(new Event('input'));
    } catch (err) {
      // Clipboard access denied
    }
  });

  clearBtn.addEventListener('click', () => {
    inputText.value = '';
    inputText.dispatchEvent(new Event('input'));
    resultSection.classList.add('hidden');
  });

  // Mode selection
  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedMode = btn.dataset.mode;

      if (selectedMode === 'custom') {
        customPromptWrap.classList.remove('hidden');
        customPrompt.focus();
      } else {
        customPromptWrap.classList.add('hidden');
      }
    });
  });

  // Correct button
  correctBtn.addEventListener('click', async () => {
    const text = inputText.value.trim();
    if (!text) return;

    setLoading(true);
    resultSection.classList.add('hidden');

    const mode = selectedMode === 'custom' ? customPrompt.value.trim() : selectedMode;

    hideError();

    try {
      chrome.runtime.sendMessage(
        { action: 'correct-text', text, mode },
        (response) => {
          setLoading(false);

          if (chrome.runtime.lastError) {
            showError('Connection error. Please try again.');
            return;
          }

          if (response && response.success) {
            resultText.textContent = response.result;
            resultSection.classList.remove('hidden');
          } else {
            showError(response?.error || 'Something went wrong. Please try again.');
          }
        }
      );
    } catch (err) {
      setLoading(false);
      showError('Could not connect. Please try again.');
    }
  });

  function setLoading(loading) {
    correctBtn.disabled = loading;
    btnText.textContent = loading ? 'Correcting...' : 'Correct Text';
    spinner.classList.toggle('hidden', !loading);
  }

  // Error toast
  let errorTimer = null;
  function showError(msg) {
    errorToastText.textContent = msg;
    errorToast.classList.remove('hidden');
    clearTimeout(errorTimer);
    errorTimer = setTimeout(() => hideError(), 8000);
  }

  function hideError() {
    errorToast.classList.add('hidden');
    clearTimeout(errorTimer);
  }

  errorToastClose.addEventListener('click', () => hideError());

  function updateCorrectBtn() {
    // OpenRouter works without a key (built-in default), so only check text
    const provider = providerSelect.value || 'openrouter';
    const needsKey = provider !== 'openrouter';
    const hasKey = !!apiKeyInput.value.trim();

    correctBtn.disabled = !inputText.value.trim() || (needsKey && !hasKey);

    // Show/hide no-key banner only for providers that need a key
    if (needsKey && !hasKey) {
      noKeyBanner.classList.remove('hidden');
    } else {
      noKeyBanner.classList.add('hidden');
    }
  }

  // Copy result
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(resultText.textContent).then(() => {
      const span = copyBtn.querySelector('span');
      span.textContent = 'Copied!';
      setTimeout(() => { span.textContent = 'Copy'; }, 1500);
    });
  });

  // Replace — sends corrected text back to the active tab's selected field
  replaceBtn.addEventListener('click', () => {
    const corrected = resultText.textContent;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'replace-text',
          text: corrected
        });
        const span = replaceBtn.querySelector('span');
        span.textContent = 'Replaced!';
        setTimeout(() => { span.textContent = 'Replace'; }, 1500);
      }
    });
  });

  // Settings - Provider change
  providerSelect.addEventListener('change', () => {
    updateProviderUI(providerSelect.value);
    updateCorrectBtn();
  });

  function updateProviderUI(provider) {
    modelSelect.innerHTML = '';
    const modelsMap = { openrouter: openrouterModels, groq: groqModels, gemini: geminiModels, openai: openaiModels };
    const models = modelsMap[provider] || openrouterModels;
    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.value;
      opt.textContent = m.label;
      modelSelect.appendChild(opt);
    });

    // Hide API key section for default OpenRouter (built-in key)
    if (provider === 'openrouter') {
      apiKeyGroup.classList.add('hidden');
    } else {
      apiKeyGroup.classList.remove('hidden');

      const providerInfo = {
        groq: { label: 'Groq API Key', helpText: 'Get a free key at', linkText: 'console.groq.com', url: 'https://console.groq.com/keys' },
        gemini: { label: 'Gemini API Key', helpText: 'Get a free key at', linkText: 'aistudio.google.com', url: 'https://aistudio.google.com/app/apikey' },
        openai: { label: 'OpenAI API Key', helpText: 'Get a key at', linkText: 'platform.openai.com', url: 'https://platform.openai.com/api-keys' }
      };

      const info = providerInfo[provider] || providerInfo.groq;
      apiKeyLabel.textContent = info.label;
      apiHelp.innerHTML = `${info.helpText} <a href="#" id="api-link-inner">${info.linkText}</a>`;

      const innerLink = document.getElementById('api-link-inner');
      if (innerLink) {
        innerLink.addEventListener('click', (e) => {
          e.preventDefault();
          chrome.tabs.create({ url: info.url });
        });
      }
    }
  }

  // Toggle API key visibility
  toggleKey.addEventListener('click', () => {
    apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
  });

  // Save settings
  saveSettingsBtn.addEventListener('click', () => {
    const provider = providerSelect.value;
    const apiKey = apiKeyInput.value.trim();
    const model = modelSelect.value;

    // OpenRouter doesn't need a key
    if (provider !== 'openrouter' && !apiKey) {
      showSaveStatus('Please enter an API key.', 'error');
      return;
    }

    chrome.storage.local.set({ provider, apiKey, model }, () => {
      noKeyBanner.classList.add('hidden');
      showSaveStatus('Settings saved!', 'success');
      updateCorrectBtn();
    });
  });

  function showSaveStatus(msg, type) {
    saveStatus.textContent = msg;
    saveStatus.className = type;
    saveStatus.classList.remove('hidden');
    setTimeout(() => saveStatus.classList.add('hidden'), 2500);
  }
});
