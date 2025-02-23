document.addEventListener('DOMContentLoaded', function() {
    // Tab switching
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const toggleSwitch = document.getElementById('autocompleteToggle');
    const statusMessage = document.getElementById('statusMessage');
    const apiKeyInput = document.getElementById('apiKey');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Update active tab button
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Show corresponding content
            const tabName = button.getAttribute('data-tab');
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `${tabName}-tab`) {
                    content.classList.add('active');
                }
            });

            // Clear API key input when switching tabs
            if (tabName === 'settings') {
                apiKeyInput.value = '';
                apiKeyInput.placeholder = 'Enter your API key';
            }
        });
    });

    // Load saved state with decryption
    chrome.storage.sync.get(['autocompleteEnabled', 'encryptedGroqKey'], async function(result) {
        let hasApiKey = false;
        
        if (result.encryptedGroqKey) {
            try {
                const decryptedKey = await window.encryptionUtils.decryptApiKey(result.encryptedGroqKey);
                hasApiKey = decryptedKey && decryptedKey.trim().length > 0;
            } catch (error) {
                console.error('Error decrypting API key:', error);
            }
        }
        
        if (!hasApiKey) {
            toggleSwitch.checked = false;
            toggleSwitch.disabled = true;
            updateStatus(false, 'Please add your API key in Settings first');
        } else {
            toggleSwitch.disabled = false;
            toggleSwitch.checked = result.autocompleteEnabled || false;
            updateStatus(result.autocompleteEnabled || false);
            apiKeyInput.placeholder = '********';
        }
    });

    // Handle toggle changes with decryption
    toggleSwitch.addEventListener('change', function() {
        chrome.storage.sync.get(['encryptedGroqKey'], async function(result) {
            let hasApiKey = false;
            
            if (result.encryptedGroqKey) {
                try {
                    const decryptedKey = await window.encryptionUtils.decryptApiKey(result.encryptedGroqKey);
                    hasApiKey = decryptedKey && decryptedKey.trim().length > 0;
                } catch (error) {
                    console.error('Error decrypting API key:', error);
                }
            }
            
            if (!hasApiKey) {
                toggleSwitch.checked = false;
                updateStatus(false, 'Please add your API key in Settings first');
                return;
            }

            const isEnabled = toggleSwitch.checked;
            chrome.storage.sync.set({ autocompleteEnabled: isEnabled });
            updateStatus(isEnabled);

            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'toggleAutocomplete',
                    enabled: isEnabled
                });
            });
        });
    });

    // Handle settings save with encryption
    document.getElementById('saveSettings').addEventListener('click', async function() {
        const apiKey = apiKeyInput.value.trim();
        
        if (!apiKey) {
            showButtonMessage('API Key Required!', 'error');
            return;
        }

        if (!apiKey.startsWith('gsk_')) {
            showButtonMessage('Invalid API Key Format!', 'error');
            return;
        }

        try {
            const encryptedKey = await window.encryptionUtils.encryptApiKey(apiKey);
            
            chrome.storage.sync.set({
                encryptedGroqKey: encryptedKey
            }, function() {
                showButtonMessage('Saved!', 'success');
                toggleSwitch.disabled = false;
                apiKeyInput.value = '';
                apiKeyInput.placeholder = '********';
            });
        } catch (error) {
            console.error('Error encrypting API key:', error);
            showButtonMessage('Error Saving Key', 'error');
        }
    });

    function showButtonMessage(message, type) {
        const button = document.getElementById('saveSettings');
        const originalText = button.textContent;
        const originalColor = button.style.backgroundColor;

        button.textContent = message;
        button.style.backgroundColor = type === 'error' ? '#dc3545' : '#28a745';
        
        setTimeout(() => {
            button.textContent = originalText;
            button.style.backgroundColor = '#1a73e8';
        }, 2000);
    }

    function updateStatus(enabled, customMessage = null) {
        if (customMessage) {
            statusMessage.textContent = customMessage;
            statusMessage.style.color = '#dc3545';
        } else {
            statusMessage.textContent = `Autocomplete is ${enabled ? 'enabled' : 'disabled'}`;
            statusMessage.style.color = enabled ? '#1a73e8' : '#666';
        }
    }
});