// SillyTavern-FixHTML Extension
// Adds a button to code blocks to wrap them in a valid HTML structure for rendering.

(function () {
    const extensionName = "SillyTavern-FixHTML";

    /**
     * Checks if the code needs fixing (missing html/head/body tags)
     * @param {string} code 
     * @returns {boolean}
     */
    function needsFixing(code) {
        const lowerCode = code.toLowerCase().trim();
        // If it already has html tag or doctype, it might be fine (or handled by the runner already)
        if (lowerCode.includes('<html') || lowerCode.includes('<!doctype html')) {
            return false;
        }
        // If it's empty, don't fix
        if (!code) return false;
        
        return true;
    }

    /**
     * Wraps the raw code in a standard HTML5 template
     * @param {string} rawCode 
     * @returns {string} Fixed HTML code
     */
    function wrapInTemplate(rawCode) {
        // Detect if it's likely just CSS
        if (rawCode.includes('{') && rawCode.includes('}') && !rawCode.includes('<')) {
            return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
${rawCode}
</style>
</head>
<body>
<!-- CSS Applied -->
<div style="padding: 20px; text-align: center; color: #888;">
    Styling applied to this page.
</div>
</body>
</html>`;
        }

        // Default wrapping for HTML fragments
        return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
    body { margin: 0; padding: 0; overflow: hidden; background-color: transparent; }
    /* Basic reset for better compatibility */
    * { box-sizing: border-box; }
</style>
</head>
<body>
${rawCode}
</body>
</html>`;
    }

    /**
     * Updates the message content in SillyTavern
     * @param {number} mesId Message ID
     * @param {string} newContent New full message content
     */
    async function updateMessage(mesId, newContent) {
        // Update the internal chat array
        if (typeof chat !== 'undefined' && chat[mesId]) {
            chat[mesId].mes = newContent;
            
            // Save the chat (debounced/standard save)
            if (typeof saveChatDebounced === 'function') {
                saveChatDebounced();
            } else if (typeof saveChat === 'function') {
                saveChat();
            }

            // Force a refresh of the message to trigger the Runner extension
            // We use jQuery to replace the message content directly or reload the chat
            // The cleanest way is often to emit an event or let ST re-render
            const event = new CustomEvent('userscript:reload_chat'); 
            window.dispatchEvent(event);
            
            // Fallback: Manually re-render the specific message if possible (Extension specific)
            // But reloading chat usually works best to trigger other extensions' observers
            // Or try standard re-render event
            if (typeof eventSource !== 'undefined') {
                eventSource.emit('chat_changed');
            }
        }
    }

    /**
     * Adds the "Fix HTML" button to a code block
     * @param {HTMLElement} preElement The <pre> element
     * @param {number} mesId The message ID belonging to this block
     */
    function addFixButtonToBlock(preElement, mesId) {
        const $pre = $(preElement);
        
        // Check if button already exists
        if ($pre.find('.st-fix-html-btn').length > 0) return;

        // Check content
        const $code = $pre.find('code');
        if ($code.length === 0) return;
        
        const rawCode = $code.text();

        // Add class for positioning
        $pre.addClass('st-fix-html-container');

        // Create Button
        const $btn = $(`<div class="st-fix-html-btn" title="Click to wrap code in <html> tags for rendering">
            <span>🔧 Fix HTML</span>
        </div>`);

        // Click Handler
        $btn.on('click', async (e) => {
            e.stopPropagation(); // Prevent triggering other listeners
            
            if (!needsFixing(rawCode)) {
                toastr.info('Code block already appears to be valid HTML.', 'SillyTavern FixHTML');
                return;
            }

            const fixedCode = wrapInTemplate(rawCode);
            
            // We need to replace the content in the original message text
            // This is tricky because there might be multiple code blocks.
            // For safety, we rely on the fact that we are clicking THIS specific block.
            // But updating `chat[mesId].mes` requires string replacement.
            
            if (chat && chat[mesId]) {
                let originalMessage = chat[mesId].mes;
                
                // Simple string replace might replace the wrong block if duplicates exist.
                // A more robust way involves rebuilding the message, but simple replace is usually "good enough" for unique code blocks.
                // Or we can try to find the index.
                
                // Escape regex special characters from the raw code to find it safely
                const escapedCode = rawCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                
                // Regex to match the code block containing this code
                // Matches ```...code...```
                const regex = new RegExp(`\`\`\`[\\w]*\\s*${escapedCode}\\s*\`\`\``, 'i');
                
                if (regex.test(originalMessage)) {
                    const newBlock = `\`\`\`html\n${fixedCode}\n\`\`\``;
                    const newMessage = originalMessage.replace(regex, newBlock);
                    
                    await updateMessage(mesId, newMessage);
                    toastr.success('Code block fixed! Reloading...', 'SillyTavern FixHTML');
                } else {
                    toastr.error('Could not safely locate code block in original message.', 'Error');
                }
            }
        });

        // Append button to <pre>
        $pre.append($btn);
    }

    /**
     * Scans the chat for code blocks and adds buttons
     */
    function scanAndAddButtons() {
        // Find all message elements
        $('.mes').each(function() {
            const $mes = $(this);
            const mesId = $mes.attr('mesid');
            
            if (mesId === undefined) return;

            // Find all pre elements inside
            $mes.find('pre').each(function() {
                addFixButtonToBlock(this, mesId);
            });
        });
    }

    // --- Initialization ---

    $(document).ready(function () {
        // Initial scan
        setTimeout(scanAndAddButtons, 1000);

        // Observer for new messages or chat reload
        const observer = new MutationObserver((mutations) => {
            let shouldScan = false;
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length > 0) {
                    shouldScan = true;
                }
            });
            if (shouldScan) {
                scanAndAddButtons();
            }
        });

        // Observe the chat container
        const chatContainer = document.querySelector('#chat');
        if (chatContainer) {
            observer.observe(chatContainer, { childList: true, subtree: true });
        }

        // Also listen to ST events if available (backup)
        if (typeof eventSource !== 'undefined') {
            eventSource.on('chat_changed', () => setTimeout(scanAndAddButtons, 500));
            eventSource.on('message_rendered', () => setTimeout(scanAndAddButtons, 100));
        }
    });

})();
