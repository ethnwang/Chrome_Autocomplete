// State management
let isEnabled = false;
let activeElement = null;
let currentSuggestionElement = null;
let debounceTimer = null;
let lastSuggestionTime = 0;
let isTyping = false;
let typingTimer = null;
let suggestionTimer = null;

// Initialize enabled state from storage
chrome.storage.sync.get(['autocompleteEnabled'], function(result) {
    isEnabled = result.autocompleteEnabled || false;
    console.log('Autocomplete initialized:', isEnabled);
});

// Listen for toggle changes from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'toggleAutocomplete') {
        isEnabled = message.enabled;
        console.log('Autocomplete toggled:', isEnabled);
        
        // Clean up if being disabled
        if (!isEnabled) {
            cleanupAutocomplete();
        }
    }
});

// Add event listeners to frames (including main window)
function addListenersToFrame(frameElement) {
    const frameDoc = frameElement ? (frameElement.contentDocument || frameElement.contentWindow.document) : document;
    
    frameDoc.addEventListener('focusin', handleFocusIn);
    frameDoc.addEventListener('input', handleInput);
    frameDoc.addEventListener('keydown', handleKeyDown);
    frameDoc.addEventListener('scroll', handleScroll, true);
    frameDoc.addEventListener('mousedown', handleMouseDown);
}

// Event Handlers
function handleFocusIn(event) {
    if (!isEnabled) return;
    
    const element = event.target;
    if (isEditableElement(element)) {
        console.log('Editable element focused:', element);
        activeElement = element;
    }
}

function handleInput(event) {
    if (!isEnabled || !activeElement) return;

    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
        handleTextChange(event);
    }, 300);
}

function handleKeyDown(event) {
    if (!isEnabled || !activeElement || !currentSuggestionElement) return;

    if (event.key === 'Tab' && !event.shiftKey) {
        event.preventDefault();
        acceptSuggestion();
    }
}

function handleScroll(event) {
    if (currentSuggestionElement) {
        updateSuggestionPosition();
    }
}

function handleMouseDown(event) {
    if (currentSuggestionElement && event.target !== currentSuggestionElement) {
        removeSuggestion();
    }
}

// Enhanced check for editable elements
function isEditableElement(element) {
    // Handle Google Docs specific elements
    if (window.location.hostname === 'docs.google.com') {
        if (element.classList.contains('kix-lineview') ||
            element.classList.contains('docs-texteventtarget-iframe') ||
            element.closest('.docs-editor-container')) {
            return true;
        }
        
        const docsEditor = element.closest('[contenteditable="true"][role="textbox"]');
        if (docsEditor) {
            return true;
        }
    }

    // Standard form inputs
    if (element.tagName === 'INPUT') {
        const validTypes = ['text', 'email', 'search', 'url', 'tel', 'password'];
        return validTypes.includes(element.type);
    }
    
    if (element.tagName === 'TEXTAREA') {
        return true;
    }
    
    // Check for contenteditable attribute
    if (element.contentEditable === 'true' || element.isContentEditable) {
        return true;
    }

    // Check for common editor roles
    const editableRoles = ['textbox', 'searchbox', 'combobox'];
    if (editableRoles.includes(element.getAttribute('role'))) {
        return true;
    }

    // Check for common editor classes/attributes
    const editableClassPatterns = [
        /editor/i,
        /editable/i,
        /textarea/i,
        /input/i
    ];
    
    const elementClasses = Array.from(element.classList);
    if (elementClasses.some(className => 
        editableClassPatterns.some(pattern => pattern.test(className)))) {
        return true;
    }

    // Check if element is within an editable container
    if (hasEditableParent(element)) {
        return true;
    }

    // Check computed styles for typical editor characteristics
    const style = window.getComputedStyle(element);
    if (style.userSelect !== 'none' && 
        (style.cursor === 'text' || style.whiteSpace === 'pre-wrap')) {
        return true;
    }

    return false;
}

// Check if element has an editable parent
function hasEditableParent(element) {
    let parent = element.parentElement;
    while (parent) {
        if (parent.isContentEditable || parent.contentEditable === 'true') {
            return true;
        }
        parent = parent.parentElement;
    }
    return false;
}

// Get text content based on element type
function getTextContent(element) {
    if (window.location.hostname === 'docs.google.com') {
        const activeLine = element.closest('.kix-lineview');
        if (activeLine) {
            return activeLine.textContent;
        }
        
        const editorContainer = element.closest('.docs-editor-container');
        if (editorContainer) {
            return editorContainer.textContent;
        }
    }

    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        return element.value;
    }

    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(element);
        return preCaretRange.toString();
    }

    return element.textContent;
}

// Get cursor position
function getCursorPosition(element) {
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        return element.selectionStart;
    }

    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        return range.startOffset;
    }

    return 0;
}

async function handleTextChange(event) {
    console.log('handleTextChange triggered');
    let text, cursorPosition;

    // Clear any existing suggestion timer
    if (suggestionTimer) {
        clearTimeout(suggestionTimer);
        console.log('Cleared existing suggestion timer');
    }

    // Mark that user is typing
    isTyping = true;
    console.log('User is typing:', isTyping);
    
    // Clear any existing typing timer
    if (typingTimer) {
        clearTimeout(typingTimer);
    }

    // Get text and cursor position for Google Docs
    if (window.location.hostname === 'docs.google.com') {
        console.log('Getting text from Google Docs editor');
        const element = activeElement;
        
        // Try to get text from different possible elements
        if (element.classList.contains('kix-lineview')) {
            text = element.textContent;
            console.log('Got text from kix-lineview:', text);
        } else if (element.closest('.docs-editor-container')) {
            const editorContainer = element.closest('.docs-editor-container');
            text = editorContainer.textContent;
            console.log('Got text from editor container:', text);
        }
        
        // Get cursor position from selection
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            cursorPosition = range.startOffset;
            console.log('Cursor position:', cursorPosition);
        }
    } else {
        // Standard input handling
        text = activeElement.value || activeElement.textContent;
        cursorPosition = activeElement.selectionStart || 0;
        console.log('Standard input - Text:', text, 'Cursor:', cursorPosition);
    }

    const textBeforeCursor = text ? text.slice(0, cursorPosition) : '';
    console.log('Text before cursor:', textBeforeCursor);
    
    // Remove suggestion if not enough context
    if (textBeforeCursor.trim().length < 3) {
        console.log('Not enough context for suggestion');
        removeSuggestion();
        return;
    }

    const currentTime = Date.now();
    const timeSinceLastSuggestion = currentTime - lastSuggestionTime;
    console.log('Time since last suggestion:', timeSinceLastSuggestion);
    
    // Reduced wait time to 2000ms
    if (timeSinceLastSuggestion < 4000) {
        console.log('Waiting for cooldown period');
        suggestionTimer = setTimeout(() => {
            if (!isTyping) {
                console.log('Cooldown complete, getting suggestion');
                getSuggestionAndDisplay(textBeforeCursor);
            }
        }, 4000 - timeSinceLastSuggestion);
        return;
    }

    // If we're here, it's been more than 2 seconds
    suggestionTimer = setTimeout(() => {
        if (!isTyping) {
            console.log('Getting suggestion after typing stopped');
            getSuggestionAndDisplay(textBeforeCursor);
        } else {
            console.log('Still typing, not getting suggestion');
        }
    }, 1000);
}

// Update getAISuggestion to add debugging
async function getAISuggestion(text) {
    console.log('Getting AI suggestion for text:', text);
    try {
        const result = await chrome.storage.sync.get(['encryptedGroqKey']);
        
        if (!result.encryptedGroqKey) {
            console.error('No API key found in storage');
            return null;
        }

        console.log('Decrypting API key');
        const apiKey = await window.encryptionUtils.decryptApiKey(result.encryptedGroqKey);
        
        if (!apiKey || !apiKey.startsWith('gsk_')) {
            console.error('Invalid API key format');
            return null;
        }

        console.log('Making API request to Groq');
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: [
                    {
                        role: "system",
                        content: "You are an autocomplete assistant. Complete the user's text naturally and briefly. Only provide the completion, no other text."
                    },
                    {
                        role: "user",
                        content: `Complete this text naturally: "${text}"`
                    }
                ],
                model: "llama-3.3-70b-versatile",
                max_tokens: 20,
                temperature: 0.3,
                top_p: 1,
                stop: ["\n", ".", "!", "?"]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API request failed:', {
                status: response.status,
                statusText: response.statusText,
                error: errorText
            });
            return null;
        }

        const data = await response.json();
        console.log('Received suggestion from API:', data.choices[0].message.content);
        return data.choices[0].message.content.trim();
    } catch (error) {
        console.error('Error in getAISuggestion:', error);
        return null;
    }
}

// Update showSuggestion to add debugging
function showSuggestion(suggestion) {
    console.log('Showing suggestion:', suggestion);
    if (!activeElement) {
        console.log('No active element, cannot show suggestion');
        return;
    }

    removeSuggestion();

    // Create suggestion element
    const suggestionElement = document.createElement('div');
    suggestionElement.className = 'ai-autocomplete-suggestion';
    suggestionElement.textContent = suggestion;

    // Get computed styles from active element
    const computedStyle = window.getComputedStyle(activeElement);
    console.log('Copying styles from active element');
    
    // Copy styles
    const stylesToCopy = [
        'fontSize',
        'fontFamily',
        'fontWeight',
        'fontStyle',
        'letterSpacing',
        'lineHeight',
        'textTransform',
        'wordSpacing',
        'padding',
        'border',
        'color'
    ];

    stylesToCopy.forEach(style => {
        suggestionElement.style[style] = computedStyle[style];
    });

    // Position the suggestion
    const rect = activeElement.getBoundingClientRect();
    console.log('Active element rect:', rect);
    const cursorCoords = getCursorCoordinates();
    console.log('Cursor coordinates:', cursorCoords);

    suggestionElement.style.position = 'fixed';
    suggestionElement.style.top = `${cursorCoords.top}px`;
    suggestionElement.style.left = `${cursorCoords.left}px`;
    suggestionElement.style.opacity = '0.7';
    suggestionElement.style.zIndex = '999999'; // Ensure it's on top
    
    // Match background color
    const parentBg = computedStyle.backgroundColor;
    if (parentBg !== 'rgba(0, 0, 0, 0)' && parentBg !== 'transparent') {
        suggestionElement.style.backgroundColor = parentBg;
    }

    // Add to appropriate document
    const targetDoc = activeElement.ownerDocument;
    targetDoc.body.appendChild(suggestionElement);
    currentSuggestionElement = suggestionElement;
    console.log('Suggestion element added to document');
}

// Helper function to get and display suggestion
async function getSuggestionAndDisplay(text) {
    try {
        const suggestion = await getAISuggestion(text);
        if (suggestion) {
            showSuggestion(suggestion);
            lastSuggestionTime = Date.now();
        } else {
            removeSuggestion();
        }
    } catch (error) {
        console.error('Error getting suggestion:', error);
        removeSuggestion();
    }
}

async function getAISuggestion(text) {
    try {
        const result = await chrome.storage.sync.get(['encryptedGroqKey']);
        
        if (!result.encryptedGroqKey) {
            throw new Error('No API key found');
        }

        const apiKey = await window.encryptionUtils.decryptApiKey(result.encryptedGroqKey);
        
        if (!apiKey || !apiKey.startsWith('gsk_')) {
            throw new Error('Invalid API key format');
        }

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: [
                    {
                        role: "system",
                        content: "You are an autocomplete assistant. Complete the user's text naturally and briefly. Only provide the completion, no other text."
                    },
                    {
                        role: "user",
                        content: `Complete this text naturally: "${text}"`
                    }
                ],
                model: "llama-3.3-70b-versatile",
                max_tokens: 20,
                temperature: 0.3,
                top_p: 1,
                stop: ["\n", ".", "!", "?"]
            })
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0].message.content.trim();
    } catch (error) {
        console.error('Error in getAISuggestion:', error);
        return null;
    }
}

function showSuggestion(suggestion) {
    if (!activeElement) return;

    removeSuggestion();

    // Create suggestion element
    const suggestionElement = document.createElement('div');
    suggestionElement.className = 'ai-autocomplete-suggestion';
    suggestionElement.textContent = suggestion;

    // Get computed styles from active element
    const computedStyle = window.getComputedStyle(activeElement);
    
    // Copy styles
    const stylesToCopy = [
        'fontSize',
        'fontFamily',
        'fontWeight',
        'fontStyle',
        'letterSpacing',
        'lineHeight',
        'textTransform',
        'wordSpacing',
        'padding',
        'border',
        'color'
    ];

    stylesToCopy.forEach(style => {
        suggestionElement.style[style] = computedStyle[style];
    });

    // Position the suggestion
    const rect = activeElement.getBoundingClientRect();
    const cursorCoords = getCursorCoordinates();

    suggestionElement.style.position = 'fixed';
    suggestionElement.style.top = `${cursorCoords.top}px`;
    suggestionElement.style.left = `${cursorCoords.left}px`;
    suggestionElement.style.opacity = '0.7';
    
    // Match background color
    const parentBg = computedStyle.backgroundColor;
    if (parentBg !== 'rgba(0, 0, 0, 0)' && parentBg !== 'transparent') {
        suggestionElement.style.backgroundColor = parentBg;
    }

    // Add to appropriate document
    const targetDoc = activeElement.ownerDocument;
    targetDoc.body.appendChild(suggestionElement);
    currentSuggestionElement = suggestionElement;
}

function getCursorCoordinates() {
    const element = activeElement;
    let rect = element.getBoundingClientRect();
    let cursorPosition;

    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        const text = element.value.substring(0, element.selectionStart);
        cursorPosition = measureText(text, window.getComputedStyle(element));
    } else {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const preCaretRange = range.cloneRange();
            preCaretRange.selectNodeContents(element);
            preCaretRange.setEnd(range.endContainer, range.endOffset);
            cursorPosition = measureText(preCaretRange.toString(), window.getComputedStyle(element));
        }
    }

    return {
        top: rect.top + (cursorPosition ? cursorPosition.height : 0),
        left: rect.left + (cursorPosition ? cursorPosition.width : 0)
    };
}

function measureText(text, style) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    
    return {
        width: context.measureText(text).width,
        height: parseInt(style.fontSize)
    };
}

function removeSuggestion() {
    if (currentSuggestionElement) {
        currentSuggestionElement.remove();
        currentSuggestionElement = null;
    }
}

function acceptSuggestion() {
    if (!currentSuggestionElement || !activeElement) return;

    const suggestion = currentSuggestionElement.textContent;
    insertTextIntoEditor(activeElement, suggestion);
    removeSuggestion();
}

function insertTextIntoEditor(element, text) {
    if (window.location.hostname === 'docs.google.com') {
        // Create and dispatch custom events for Google Docs
        const inputEvent = new InputEvent('input', {
            data: text,
            inputType: 'insertText',
            isComposing: false
        });
        
        element.dispatchEvent(new InputEvent('beforeinput', {
            data: text,
            inputType: 'insertText',
            isComposing: false
        }));
        element.dispatchEvent(inputEvent);
        
        // Try to update visible content
        if (element.textContent !== undefined) {
            element.textContent += text;
        }
        return;
    }
    
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        const cursorPosition = element.selectionStart;
        element.value = element.value.slice(0, cursorPosition) + 
                       text + 
                       element.value.slice(cursorPosition);
        element.selectionStart = element.selectionEnd = cursorPosition + text.length;
    } else {
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        const textNode = document.createTextNode(text);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
    }
}

// Helper function to update suggestion position
function updateSuggestionPosition() {
    if (!currentSuggestionElement || !activeElement) return;
    
    const cursorCoords = getCursorCoordinates();
    currentSuggestionElement.style.top = `${cursorCoords.top}px`;
    currentSuggestionElement.style.left = `${cursorCoords.left}px`;
}

// Helper function to clean up when disabled
function cleanupAutocomplete() {
    activeElement = null;
    removeSuggestion();
    if (typingTimer) clearTimeout(typingTimer);
    if (suggestionTimer) clearTimeout(suggestionTimer);
    isTyping = false;
}

// Initialize iframe observers
function initializeFrameObservers() {
    // Observer for the main document
    const mainObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                // Check for new iframes
                mutation.addedNodes.forEach(node => {
                    if (node.tagName === 'IFRAME') {
                        handleNewIframe(node);
                    }
                });
                
                // Check if activeElement was removed
                if (activeElement && !document.contains(activeElement)) {
                    activeElement = null;
                    removeSuggestion();
                }
            }
        }
    });

    // Start observing the main document
    mainObserver.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Handle existing iframes
    document.querySelectorAll('iframe').forEach(handleNewIframe);
}

// Helper function to handle new iframes
function handleNewIframe(iframe) {
    // Ignore if not a valid iframe element
    if (!iframe || !(iframe instanceof HTMLIFrameElement)) {
        return;
    }

    try {
        // For same-origin iframes that are already loaded
        if (iframe.contentDocument) {
            addListenersToFrame(iframe);
            observeIframeContent(iframe);
            return;
        }

        // For iframes that are not yet loaded or might be cross-origin
        iframe.addEventListener('load', () => {
            try {
                // After load, check if we can access the contentDocument
                if (iframe.contentDocument) {
                    addListenersToFrame(iframe);
                    observeIframeContent(iframe);
                }
            } catch (e) {
                // This is normal for cross-origin iframes
                if (e.name === 'SecurityError') {
                    console.log('Cross-origin iframe loaded:', iframe.src);
                } else {
                    console.warn('Error handling loaded iframe:', e);
                }
            }
        });
    } catch (e) {
        // Log but don't throw
        console.warn('Failed to handle iframe:', e);
    }
}

// Helper function to observe iframe content
function observeIframeContent(iframe) {
    // Check if we can access the iframe's document
    try {
        // First check if we can access the contentWindow
        if (!iframe.contentWindow) {
            console.log('Cannot access iframe contentWindow - likely cross-origin');
            return;
        }

        // Try to access the document - this will throw if cross-origin
        const frameDoc = iframe.contentDocument;
        if (!frameDoc) {
            console.log('Cannot access iframe contentDocument - likely cross-origin');
            return;
        }

        // Wait for body to be available
        if (!frameDoc.body) {
            const bodyCheckInterval = setInterval(() => {
                if (frameDoc.body) {
                    clearInterval(bodyCheckInterval);
                    setupFrameObserver(frameDoc);
                }
            }, 100);
            
            // Clear interval after 5 seconds to prevent infinite checking
            setTimeout(() => clearInterval(bodyCheckInterval), 5000);
            return;
        }

        setupFrameObserver(frameDoc);
    } catch (e) {
        // This is expected for cross-origin iframes
        if (e.name === 'SecurityError' || e.name === 'TypeError') {
            console.log('Cross-origin iframe detected:', iframe.src);
        } else {
            console.warn('Unexpected error observing iframe:', e);
        }
    }
}

function setupFrameObserver(frameDoc) {
    try {
        const frameObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && activeElement) {
                    if (!frameDoc.contains(activeElement)) {
                        activeElement = null;
                        removeSuggestion();
                    }
                }
            }
        });

        frameObserver.observe(frameDoc.body, {
            childList: true,
            subtree: true
        });
    } catch (e) {
        console.warn('Failed to setup frame observer:', e);
    }
}

// Initialize event listeners and observers
addListenersToFrame(null); // Add listeners to main window
initializeFrameObservers();