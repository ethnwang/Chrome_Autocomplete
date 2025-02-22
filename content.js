// import Groq from "groq-sdk";

// Track enabled state and active element
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

// Only run event listeners if enabled
document.addEventListener('focusin', (event) => {
    if (!isEnabled) return;
    
    const element = event.target;
    if (isEditableElement(element)) {
        console.log('Editable element focused:', element);
        activeElement = element;
    }
});

document.addEventListener('input', (event) => {
    if (!isEnabled || !activeElement) return;

    // Clear previous timer
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }

    // Set new timer
    debounceTimer = setTimeout(() => {
        handleTextChange(event);
    }, 300); // Wait 300ms after user stops typing
});

// Handle tab key for completion
document.addEventListener('keydown', (event) => {
    if (!isEnabled || !activeElement || !currentSuggestionElement) return;

    if (event.key === 'Tab' && !event.shiftKey) {
        event.preventDefault();
        acceptSuggestion();
    }
});

// Enhanced check for editable elements
function isEditableElement(element) {
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

async function handleTextChange(event) {
    let text, cursorPosition;

    // Clear any existing suggestion timer
    if (suggestionTimer) {
        clearTimeout(suggestionTimer);
    }

    // Mark that user is typing
    isTyping = true;
    
    // Clear any existing typing timer
    if (typingTimer) {
        clearTimeout(typingTimer);
    }

    // Set a timer to mark when user stops typing
    typingTimer = setTimeout(() => {
        isTyping = false;
    }, 1000); // Consider user stopped typing after 1 second of no input

    // Handle different types of editable elements
    if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') {
        text = activeElement.value;
        cursorPosition = activeElement.selectionStart;
    } else {
        text = activeElement.textContent;
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            cursorPosition = range.startOffset;
        }
    }

    const textBeforeCursor = text.slice(0, cursorPosition);
    
    // Remove suggestion if not enough context
    if (textBeforeCursor.trim().length < 3) {
        removeSuggestion();
        return;
    }

    const currentTime = Date.now();
    const timeSinceLastSuggestion = currentTime - lastSuggestionTime;
    
    // Only proceed if it's been 4 seconds since last suggestion
    if (timeSinceLastSuggestion < 4000) {
        // Set a timer for the remaining time
        suggestionTimer = setTimeout(() => {
            if (!isTyping) { // Only make suggestion if user has stopped typing
                getSuggestionAndDisplay(textBeforeCursor);
            }
        }, 4000 - timeSinceLastSuggestion);
        return;
    }

    // If we're here, it's been more than 4 seconds
    // Wait for user to stop typing before making suggestion
    suggestionTimer = setTimeout(() => {
        if (!isTyping) {
            getSuggestionAndDisplay(textBeforeCursor);
        }
    }, 1000); // Wait 1 second after user stops typing
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

// const groq = new Groq({ apiKey: apiKey });

// response = groq.chat.completions.create({
//     messages: [
//         {
//             role: "system",
//             content: "You are an autocomplete assistant. Complete the user's text naturally and briefly. Only provide the completion, no other text."
//         },
//         {
//             role: "user",
//             content: `Complete this text naturally: "${text}"`
//         }
//     ],
//     model: "llama-3.3-70b-versatile",
//     max_tokens: 20,
//     temperature: 0.3,
//     top_p: 1,
//     stop: ["\n", ".", "!", "?"] // Stop at natural breaks
// });
// return response

async function getAISuggestion(text) {
    try {
        // Get API key from storage
        const result = await chrome.storage.sync.get(['groqApiKey']).catch(err => {
            console.warn('Failed to access chrome storage:', err);
            return { groqApiKey: null };
        });
        
        const apiKey = result.groqApiKey;
        
        if (!apiKey) {
            throw new Error('No API key found');
        }

        if (!apiKey.startsWith('gsk_')) {
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
                stop: ["\n", ".", "!", "?"] // Stop at natural breaks
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Groq API error:', {
                status: response.status,
                statusText: response.statusText,
                error: errorText
            });
            throw new Error(`API request failed: ${response.status} - ${errorText}`);
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

    // Remove any existing suggestion
    removeSuggestion();

    // Create suggestion element
    const suggestionElement = document.createElement('div');
    suggestionElement.className = 'ai-autocomplete-suggestion';
    suggestionElement.textContent = suggestion;

    // Get all computed styles from the active element
    const computedStyle = window.getComputedStyle(activeElement);
    
    // Copy relevant text styles
    const stylesToCopy = [
        'fontSize',
        'fontFamily',
        'fontWeight',
        'fontStyle',
        'letterSpacing',
        'lineHeight',
        'textTransform',
        'wordSpacing',
        'paddingLeft',
        'paddingTop',
        'paddingRight',
        'paddingBottom',
        'borderWidth',
        'color'
    ];

    stylesToCopy.forEach(style => {
        suggestionElement.style[style] = computedStyle[style];
    });

    // Calculate the position of the cursor
    const rect = activeElement.getBoundingClientRect();
    let cursorPosition;
    
    if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') {
        // For regular input elements
        const text = activeElement.value.substring(0, activeElement.selectionStart);
        cursorPosition = measureText(text, computedStyle);
    } else {
        // For contenteditable elements
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const preCaretRange = range.cloneRange();
            preCaretRange.selectNodeContents(activeElement);
            preCaretRange.setEnd(range.endContainer, range.endOffset);
            cursorPosition = measureText(preCaretRange.toString(), computedStyle);
        }
    }

    // Position the suggestion element
    suggestionElement.style.position = 'absolute';
    suggestionElement.style.top = `${rect.top + window.scrollY}px`;
    suggestionElement.style.left = `${rect.left + cursorPosition.width}px`;
    suggestionElement.style.opacity = '0.7';
    
    // Match the background color of the parent
    const parentBg = computedStyle.backgroundColor;
    if (parentBg !== 'rgba(0, 0, 0, 0)' && parentBg !== 'transparent') {
        suggestionElement.style.backgroundColor = parentBg;
    }

    document.body.appendChild(suggestionElement);
    currentSuggestionElement = suggestionElement;
}

// Helper function to measure text width
function measureText(text, computedStyle) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = `${computedStyle.fontWeight} ${computedStyle.fontSize} ${computedStyle.fontFamily}`;
    
    return {
        width: context.measureText(text).width,
        height: parseInt(computedStyle.fontSize)
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
    
    if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') {
        const cursorPosition = activeElement.selectionStart;
        const currentValue = activeElement.value;
        
        activeElement.value = currentValue.slice(0, cursorPosition) + 
                             suggestion + 
                             currentValue.slice(cursorPosition);
        
        // Move cursor to end of suggestion
        activeElement.selectionStart = activeElement.selectionEnd = 
            cursorPosition + suggestion.length;
    } else {
        // Handle contenteditable elements
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        const textNode = document.createTextNode(suggestion);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
    }

    removeSuggestion();
}

// Helper function to clean up when disabled
function cleanupAutocomplete() {
    activeElement = null;
    removeSuggestion();
    if (typingTimer) clearTimeout(typingTimer);
    if (suggestionTimer) clearTimeout(suggestionTimer);
    isTyping = false;
}

// Enhanced mutation observer to track dynamic changes
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (mutation.type === 'childList' && activeElement) {
            // Check if our activeElement was removed
            if (!document.contains(activeElement)) {
                activeElement = null;
            }
        }
    }
});

// Start observing the document
observer.observe(document.body, {
    childList: true,
    subtree: true
});