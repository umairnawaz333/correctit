(() => {
  if (window.__correctItInjected) return;
  window.__correctItInjected = true;

  let toolbar = null;
  let resultPopup = null;
  let lastActiveElement = null;
  let selectedText = '';
  let selectionRange = null;
  let savedSelStart = null;
  let savedSelEnd = null;

  // Track last focused input/textarea/contenteditable
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' ||
        el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
      lastActiveElement = el;
    }
  }, true);

  // Show floating toolbar on text selection
  document.addEventListener('mouseup', (e) => {
    // Don't trigger on our own UI
    if (e.target.closest('.correctit-toolbar') || e.target.closest('.correctit-popup')) return;

    setTimeout(() => {
      // Check for selection inside input/textarea first
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'TEXTAREA' || (activeEl.tagName === 'INPUT' && activeEl.type === 'text'))) {
        const start = activeEl.selectionStart;
        const end = activeEl.selectionEnd;
        if (start !== undefined && end !== undefined && start !== end) {
          const text = activeEl.value.substring(start, end).trim();
          if (text && text.length > 1) {
            selectedText = text;
            lastActiveElement = activeEl;
            savedSelStart = start;
            savedSelEnd = end;
            selectionRange = null; // No range for input fields
            // Use the input element's rect for positioning
            const rect = getInputSelectionRect(activeEl);
            showToolbar(rect);
            return;
          }
        }
      }

      // Regular page text selection
      const selection = window.getSelection();
      const text = selection?.toString().trim();

      if (text && text.length > 1) {
        selectedText = text;

        // Save the range for later replacement
        if (selection.rangeCount > 0) {
          selectionRange = selection.getRangeAt(0).cloneRange();
        }

        const rect = selection.getRangeAt(0).getBoundingClientRect();
        showToolbar(rect);
      } else {
        // Small delay so toolbar clicks register
        setTimeout(() => removeToolbar(), 100);
      }
    }, 10);
  });

  // Get approximate rect for selection inside an input/textarea
  function getInputSelectionRect(el) {
    const elRect = el.getBoundingClientRect();
    // Create a rough rect centered on the input element
    return {
      top: elRect.top,
      bottom: elRect.bottom,
      left: elRect.left,
      right: elRect.right,
      width: elRect.width,
      height: elRect.height
    };
  }

  // Hide toolbar on click elsewhere
  document.addEventListener('mousedown', (e) => {
    if (e.target.closest('.correctit-toolbar') || e.target.closest('.correctit-popup')) return;
    removeToolbar();
    removePopup();
  });

  function showToolbar(rect) {
    removeToolbar();

    toolbar = document.createElement('div');
    toolbar.className = 'correctit-toolbar';
    toolbar.innerHTML = `
      <button class="correctit-tb-btn correctit-main-btn" data-mode="grammar" title="Fix Grammar">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Fix
        </button>
        <div class="correctit-divider"></div>
        <button class="correctit-tb-btn" data-mode="professional" title="Make Professional">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
          </svg>
        </button>
        <button class="correctit-tb-btn" data-mode="casual" title="Make Casual">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
            <line x1="9" y1="9" x2="9.01" y2="9"/>
            <line x1="15" y1="9" x2="15.01" y2="9"/>
          </svg>
        </button>
        <button class="correctit-tb-btn" data-mode="concise" title="Make Concise">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="21" y1="10" x2="3" y2="10"/>
            <line x1="21" y1="6" x2="3" y2="6"/>
            <line x1="15" y1="14" x2="3" y2="14"/>
          </svg>
        </button>
        <button class="correctit-tb-btn" data-mode="friendly" title="Make Friendly">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
    `;

    document.body.appendChild(toolbar);

    // Position toolbar above selection
    const toolbarRect = toolbar.getBoundingClientRect();
    let top = rect.top + window.scrollY - toolbarRect.height - 8;
    let left = rect.left + window.scrollX + (rect.width / 2) - (toolbarRect.width / 2);

    // Keep within viewport
    if (top < window.scrollY + 4) {
      top = rect.bottom + window.scrollY + 8;
    }
    left = Math.max(4, Math.min(left, window.innerWidth - toolbarRect.width - 4));

    toolbar.style.top = `${top}px`;
    toolbar.style.left = `${left}px`;

    // Button click handlers
    toolbar.querySelectorAll('.correctit-tb-btn').forEach(btn => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const mode = btn.dataset.mode;
        handleCorrection(mode, '');
      });
    });
  }

  async function handleCorrection(mode, extraInstruction) {
    if (!selectedText) return;

    showLoadingPopup();

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'correct-inline',
        text: selectedText,
        mode: mode,
        extra: extraInstruction || ''
      });

      if (response && response.success) {
        showResultPopup(response.result);
      } else {
        showErrorPopup(response?.error || 'Something went wrong. Please try again.');
      }
    } catch (err) {
      showErrorPopup('Connection lost. Please refresh the page and try again.');
    }
  }

  function showLoadingPopup() {
    removeToolbar();
    removePopup();

    resultPopup = document.createElement('div');
    resultPopup.className = 'correctit-popup correctit-loading';
    resultPopup.innerHTML = `
      <div class="correctit-popup-content">
        <div class="correctit-spinner"></div>
        <span>Correcting...</span>
      </div>
    `;
    document.body.appendChild(resultPopup);
    positionPopup();
  }

  function showResultPopup(result) {
    removePopup();

    resultPopup = document.createElement('div');
    resultPopup.className = 'correctit-popup';
    resultPopup.innerHTML = `
      <div class="correctit-popup-content">
        <div class="correctit-result-text">${escapeHtml(result)}</div>
        <div class="correctit-popup-actions">
          <button class="correctit-action-btn correctit-copy-btn" title="Copy to clipboard">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            Copy
          </button>
          <button class="correctit-action-btn correctit-replace-btn" title="Replace selected text">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
            </svg>
            Replace
          </button>
          <button class="correctit-action-btn correctit-close-btn" title="Close">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(resultPopup);
    positionPopup();

    // Copy
    resultPopup.querySelector('.correctit-copy-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(result).then(() => {
        const btn = resultPopup.querySelector('.correctit-copy-btn');
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
        setTimeout(() => removePopup(), 800);
      });
    });

    // Replace
    resultPopup.querySelector('.correctit-replace-btn').addEventListener('click', () => {
      replaceSelectedText(result);
      removePopup();
    });

    // Close
    resultPopup.querySelector('.correctit-close-btn').addEventListener('click', () => {
      removePopup();
    });
  }

  function showErrorPopup(error) {
    removePopup();

    resultPopup = document.createElement('div');
    resultPopup.className = 'correctit-popup correctit-error';
    resultPopup.innerHTML = `
      <div class="correctit-popup-content">
        <span class="correctit-error-text">${escapeHtml(error)}</span>
        <button class="correctit-action-btn correctit-close-btn" title="Close">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    `;

    document.body.appendChild(resultPopup);
    positionPopup();

    resultPopup.querySelector('.correctit-close-btn').addEventListener('click', () => {
      removePopup();
    });

    setTimeout(() => removePopup(), 4000);
  }

  function positionPopup() {
    if (!resultPopup) return;

    let rect;
    if (selectionRange) {
      rect = selectionRange.getBoundingClientRect();
    } else if (lastActiveElement) {
      rect = lastActiveElement.getBoundingClientRect();
    } else {
      return;
    }
    const popupRect = resultPopup.getBoundingClientRect();

    let top = rect.bottom + window.scrollY + 8;
    let left = rect.left + window.scrollX;

    // Keep within viewport
    if (top + popupRect.height > window.scrollY + window.innerHeight) {
      top = rect.top + window.scrollY - popupRect.height - 8;
    }
    left = Math.max(8, Math.min(left, window.innerWidth - popupRect.width - 8));

    resultPopup.style.top = `${top}px`;
    resultPopup.style.left = `${left}px`;
  }

  function replaceSelectedText(newText) {
    // Try replacing in input/textarea using saved selection positions
    if (lastActiveElement && (lastActiveElement.tagName === 'TEXTAREA' || lastActiveElement.tagName === 'INPUT')) {
      const el = lastActiveElement;
      const start = savedSelStart;
      const end = savedSelEnd;
      if (start !== null && end !== null && start !== end) {
        el.focus();
        el.value = el.value.substring(0, start) + newText + el.value.substring(end);
        el.selectionStart = start;
        el.selectionEnd = start + newText.length;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
    }

    // Try replacing in contenteditable using saved range
    if (selectionRange) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(selectionRange);

      // Use execCommand for contenteditable (works with undo)
      document.execCommand('insertText', false, newText);
      return;
    }
  }

  function removeToolbar() {
    if (toolbar) {
      toolbar.remove();
      toolbar = null;
    }
  }

  function removePopup() {
    if (resultPopup) {
      resultPopup.remove();
      resultPopup = null;
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'replace-text') {
      replaceSelectedText(message.text);
      sendResponse({ success: true });
    }
    if (message.action === 'show-loading') {
      showLoadingPopup();
      sendResponse({ success: true });
    }
    if (message.action === 'show-result') {
      showResultPopup(message.result);
      sendResponse({ success: true });
    }
    if (message.action === 'show-error') {
      showErrorPopup(message.error);
      sendResponse({ success: true });
    }
  });
})();
