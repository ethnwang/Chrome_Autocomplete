// Track enabled state and active element
let isEnabled = false;
let activeElement = null;

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

    let text, cursorPosition;

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

    handleTextChange(text, cursorPosition);
});

// Helper function to clean up when disabled
function cleanupAutocomplete() {
    activeElement = null;
    // Add any additional cleanup needed here
    // (like removing suggestion UI elements)
}

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

// Enhanced text change detection
document.addEventListener('input', (event) => {
    if (!activeElement) return;

    let text, cursorPosition;

    // Handle different types of editable elements
    if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') {
        text = activeElement.value;
        cursorPosition = activeElement.selectionStart;
    } else {
        // For contenteditable and other div-based editors
        text = activeElement.textContent;
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            cursorPosition = range.startOffset;
        }
    }

    console.log('Text changed:', {
        text: text,
        cursorPosition: cursorPosition,
        currentWord: getCurrentWord(text, cursorPosition)
    });

    handleTextChange(text, cursorPosition);
});

// Helper to get the current word being typed
function getCurrentWord(text, cursorPosition) {
    if (!text) return '';
    
    // Find the start of the current word
    let wordStart = cursorPosition;
    while (wordStart > 0 && /\w/.test(text[wordStart - 1])) {
        wordStart--;
    }
    
    // Find the end of the current word
    let wordEnd = cursorPosition;
    while (wordEnd < text.length && /\w/.test(text[wordEnd])) {
        wordEnd++;
    }
    
    return text.slice(wordStart, wordEnd);
}

// Handle text changes
function handleTextChange(text, cursorPosition) {
    // This will be where we implement autocomplete logic
    console.log('Processing text:', {
        text: text,
        cursorPosition: cursorPosition,
        currentWord: getCurrentWord(text, cursorPosition)
    });
}