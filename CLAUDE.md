# CorrectIt - Chrome Extension

## What This Is
AI-powered Chrome extension that corrects and rewrites text. Users select text on any webpage or in input fields, and a floating toolbar appears with correction options.

## Architecture

### Manifest V3
- Service worker (`js/background.js`) — handles all AI API calls, context menus
- Content script (`js/content.js`) — injected on all pages, shows floating toolbar on text selection
- Popup (`popup.html` + `js/popup.js`) — extension popup UI with text input, mode selection, settings
- No `scripting` permission — content script is auto-injected via manifest `content_scripts` field

### File Structure
```
CorrectIt/
├── manifest.json
├── popup.html
├── privacy-policy.html
├── js/
│   ├── background.js      # Service worker: API calls, context menus, message handling
│   ├── content.js          # Content script: floating toolbar, text selection, inline results
│   └── popup.js            # Popup: UI logic, settings management
├── css/
│   ├── popup.css           # Popup styling (dark purple theme)
│   └── content.css         # Floating toolbar & popup styling
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### AI Provider
- **Groq** (default & only enabled) — free tier, fast inference, no credit card needed
- Gemini and OpenAI code exists but is hidden from UI (commented out in popup.html dropdown)
- Groq uses OpenAI-compatible API at `https://api.groq.com/openai/v1/chat/completions`
- Models: Llama 3.3 70B (default), Llama 3.1 8B, Mixtral 8x7B
- API key stored in `chrome.storage.local`

### Correction Modes
1. **Fix Grammar** — corrects spelling/grammar only
2. **Professional** — formal business tone
3. **Casual** — relaxed conversational tone
4. **Concise** — shorter, removes fluff
5. **Friendly** — warm and approachable
6. **Custom** — user-defined instruction (popup only)

### Key Technical Decisions

**Content script text selection in input fields:**
- `window.getSelection()` does NOT work inside `<input>` and `<textarea>`
- Must use `document.activeElement.selectionStart/selectionEnd` for form fields
- Selection positions are saved (`savedSelStart`/`savedSelEnd`) because they reset when input loses focus on toolbar click

**Message passing (MV3):**
- Content script uses Promise-based `await chrome.runtime.sendMessage()` (NOT callback-based)
- Callback-based `sendMessage` from content scripts was unreliable in MV3 — responses never arrived
- Popup uses callback-based `sendMessage` (works fine since popup is in extension context)
- Background uses `return true` in listener + async handler function pattern

**Error handling:**
- `fetchWithTimeout()` wraps all API calls with 20s AbortController timeout
- `safeJson()` uses `response.text()` then `JSON.parse()` instead of `response.json()` (which can hang)
- `friendlyError()` converts raw API errors to user-friendly messages
- Popup shows errors in a separate red toast (not in the result box)
- Content script shows errors in a styled popup overlay

**Service worker crashes:**
- `chrome.scripting.executeScript` was removed — it required `scripting` permission and `host_permissions`, caused crashes
- Content script is solely injected via manifest's `content_scripts` field
- Context menu handler gracefully skips if content script isn't available on the tab

### Design
- Dark theme matching other extensions (QuickTranslate, CustomNewTab)
- Primary color: `#6C63FF` (purple)
- Font: system fonts (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto`)
- Inline SVG icons throughout (no icon font dependencies)
- z-index `2147483647` for floating toolbar (max possible)

## Publishing
- GitHub: https://github.com/umairnawaz333/correctit.git
- Privacy policy repo: https://github.com/umairnawaz333/correctit-privacy.git
- Privacy policy hosted via GitHub Pages
- Chrome Web Store: pending submission

## Development Notes
- After making changes to background.js: reload extension in chrome://extensions
- After making changes to content.js/content.css: reload extension AND refresh the webpage
- Test inline toolbar on pages with text inputs, textareas, and contenteditable elements
- Groq free tier has rate limits — if quota error appears, wait ~60s
