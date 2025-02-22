document.addEventListener('DOMContentLoaded', function() {
  // Tab switching
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  const toggleSwitch = document.getElementById('autocompleteToggle');
  const statusMessage = document.getElementById('statusMessage');

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
      });
  });

  // Load saved state
  chrome.storage.sync.get(['autocompleteEnabled', 'groqApiKey'], function(result) {
      const hasApiKey = result.groqApiKey && result.groqApiKey.trim().length > 0;
      
      // If no API key, force toggle to off and disable it
      if (!hasApiKey) {
          toggleSwitch.checked = false;
          toggleSwitch.disabled = true;
          updateStatus(false, 'Please add your API key in Settings first');
      } else {
          toggleSwitch.disabled = false;
          toggleSwitch.checked = result.autocompleteEnabled || false;
          updateStatus(result.autocompleteEnabled || false);
      }
      
      // Load API key if exists
      if (result.groqApiKey) {
          document.getElementById('apiKey').value = result.groqApiKey;
      }
  });

  // Handle toggle changes
  toggleSwitch.addEventListener('change', function() {
      chrome.storage.sync.get(['groqApiKey'], function(result) {
          const hasApiKey = result.groqApiKey && result.groqApiKey.trim().length > 0;
          
          if (!hasApiKey) {
              toggleSwitch.checked = false;
              updateStatus(false, 'Please add your API key in Settings first');
              return;
          }

          const isEnabled = toggleSwitch.checked;
          
          chrome.storage.sync.set({
              autocompleteEnabled: isEnabled
          });

          updateStatus(isEnabled);

          // Notify content script
          chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
              chrome.tabs.sendMessage(tabs[0].id, {
                  action: 'toggleAutocomplete',
                  enabled: isEnabled
              });
          });
      });
  });

  // Handle settings save
  document.getElementById('saveSettings').addEventListener('click', function() {
    const apiKey = document.getElementById('apiKey').value.trim();
    
    if (!apiKey) {
        const button = document.getElementById('saveSettings');
        button.textContent = 'API Key Required!';
        button.style.backgroundColor = '#dc3545';
        
        setTimeout(() => {
            button.textContent = 'Save';
            button.style.backgroundColor = '#1a73e8';
        }, 2000);
        return;
    }

    if (!apiKey.startsWith('gsk_')) {
        const button = document.getElementById('saveSettings');
        button.textContent = 'Invalid API Key Format!';
        button.style.backgroundColor = '#dc3545';
        
        setTimeout(() => {
            button.textContent = 'Save';
            button.style.backgroundColor = '#1a73e8';
        }, 2000);
        return;
    }

    chrome.storage.sync.set({
        groqApiKey: apiKey
    }, function() {
        // Show success message
        const button = document.getElementById('saveSettings');
        button.textContent = 'Saved!';
        button.style.backgroundColor = '#28a745';
        toggleSwitch.disabled = false;
        
        setTimeout(() => {
            button.textContent = 'Save';
            button.style.backgroundColor = '#1a73e8';
        }, 2000);
    });
});

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