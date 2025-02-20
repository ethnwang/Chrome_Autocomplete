document.addEventListener('DOMContentLoaded', function() {
    const toggleSwitch = document.getElementById('autocompleteToggle');
    const statusMessage = document.getElementById('statusMessage');
  
    // Load saved state
    chrome.storage.sync.get(['autocompleteEnabled'], function(result) {
      toggleSwitch.checked = result.autocompleteEnabled || false;
      updateStatus(result.autocompleteEnabled || false);
    });
  
    // Handle toggle changes
    toggleSwitch.addEventListener('change', function() {
      const isEnabled = toggleSwitch.checked;
      
      // Save state
      chrome.storage.sync.set({
        autocompleteEnabled: isEnabled
      });
  
      // Update status message
      updateStatus(isEnabled);
  
      // Notify content script
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'toggleAutocomplete',
          enabled: isEnabled
        });
      });
    });
  
    function updateStatus(enabled) {
      statusMessage.textContent = `Autocomplete is ${enabled ? 'enabled' : 'disabled'}`;
      statusMessage.style.color = enabled ? '#1a73e8' : '#666';
    }
  });