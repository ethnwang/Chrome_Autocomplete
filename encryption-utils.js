// Create a namespace for our encryption utilities
window.encryptionUtils = (function() {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    // Function to convert ArrayBuffer to base64 string
    function arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    // Function to convert base64 string to ArrayBuffer
    function base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    async function generateEncryptionKey() {
        const key = await crypto.subtle.generateKey(
            {
                name: "AES-GCM",
                length: 256
            },
            true, // extractable
            ["encrypt", "decrypt"]
        );
        
        // Export the key
        const exportedKey = await crypto.subtle.exportKey("raw", key);
        const keyBase64 = arrayBufferToBase64(exportedKey);
        
        // Store the key
        await chrome.storage.local.set({ 'encryptionKey': keyBase64 });
        
        return key;
    }

    async function getOrCreateEncryptionKey() {
        try {
            // Try to get existing key from storage
            const result = await chrome.storage.local.get(['encryptionKey']);
            
            if (result.encryptionKey) {
                // Convert stored base64 key back to CryptoKey
                const keyBuffer = base64ToArrayBuffer(result.encryptionKey);
                return await crypto.subtle.importKey(
                    "raw",
                    keyBuffer,
                    { name: "AES-GCM", length: 256 },
                    true,
                    ["encrypt", "decrypt"]
                );
            } else {
                // No key exists, create a new one
                return await generateEncryptionKey();
            }
        } catch (error) {
            console.error('Error getting/creating encryption key:', error);
            throw error;
        }
    }

    async function encryptApiKey(apiKey) {
        try {
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const key = await getOrCreateEncryptionKey();
            
            const encodedApiKey = encoder.encode(apiKey);
            const ciphertext = await crypto.subtle.encrypt(
                {
                    name: "AES-GCM",
                    iv: iv
                },
                key,
                encodedApiKey
            );
            
            // Combine IV and ciphertext
            const encryptedData = new Uint8Array([...iv, ...new Uint8Array(ciphertext)]);
            return Array.from(encryptedData);
        } catch (error) {
            console.error('Encryption error:', error);
            throw error;
        }
    }

    async function decryptApiKey(encryptedData) {
        try {
            const data = new Uint8Array(encryptedData);
            const iv = data.slice(0, 12);
            const ciphertext = data.slice(12);
            
            const key = await getOrCreateEncryptionKey();
            
            const decryptedData = await crypto.subtle.decrypt(
                {
                    name: "AES-GCM",
                    iv: iv
                },
                key,
                ciphertext
            );
            
            return decoder.decode(decryptedData);
        } catch (error) {
            console.error('Decryption error:', error);
            throw error;
        }
    }

    // Return public methods
    return {
        encryptApiKey,
        decryptApiKey
    };
})();