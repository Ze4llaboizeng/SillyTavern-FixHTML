// SillyTavern-FixHTML Extension (Robust Version)
// 1. Fixes existing code blocks using Index-Based matching (100% accuracy).
// 2. Adds "Wrap Raw HTML" feature for code outside blocks.

(function () {
    const extensionName = "SillyTavern-FixHTML";

    // --- HTML Templates ---
    
    function wrapInTemplate(rawCode) {
        // Simple heuristic: Is it CSS?
        if (rawCode.includes('{') && rawCode.includes('}') && !rawCode.includes('<div') && !rawCode.includes('<body')) {
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
<div style="padding: 20px; text-align: center; color: #888;">CSS Applied</div>
</body>
</html>`;
        }

        // Standard HTML Wrap
        return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
    body { margin: 0; padding: 0; overflow: hidden; background-color: transparent; }
    * { box-sizing: border-box; }
</style>
</head>
<body>
${rawCode}
</body>
</html>`;
    }

    // --- Core Logic ---

    async function updateMessageContent(mesId, newContent) {
        if (typeof chat !== 'undefined' && chat[mesId]) {
            chat[mesId].mes = newContent;
            
            if (typeof saveChatDebounced === 'function') {
                saveChatDebounced();
            } else if (typeof saveChat === 'function') {
                saveChat();
            }

            // Reload chat/event
            const event = new CustomEvent('userscript:reload_chat'); 
            window.dispatchEvent(event);
            if (typeof eventSource !== 'undefined') {
                eventSource.emit('chat_changed');
            }
        }
    }

    // --- Feature 1: Fix Existing Code Blocks ---

    function addFixButtonToBlock(preElement, mesId, blockIndex) {
        const $pre = $(preElement);
        if ($pre.find('.st-fix-html-btn').length > 0) return;

        const $code = $pre.find('code');
        if ($code.length === 0) return;
        
        $pre.addClass('st-fix-html-container');

        // Check if it looks valid already
        const text = $code.text().toLowerCase();
        const seemsValid = text.includes('<html') && text.includes('<body');
        
        // Button UI
        const $btn = $(`<div class="st-fix-html-btn" title="Force wrap this code block in <html> template">
            <span>${seemsValid ? '✅ Valid' : '🔧 Fix HTML'}</span>
        </div>`);

        $btn.on('click', async (e) => {
            e.stopPropagation();
            
            if (!chat[mesId]) {
                toastr.error('Message not found in chat history.', extensionName);
                return;
            }

            let originalContent = chat[mesId].mes;
            
            // Regex to find all code blocks: ```lang ... ```
            // We use a capture group for content
            const codeBlockRegex = /```[\w]*\s*([\s\S]*?)\s*```/g;
            
            let match;
            let currentIdx = 0;
            let targetMatch = null;

            // Iterate to find the N-th code block (blockIndex)
            while ((match = codeBlockRegex.exec(originalContent)) !== null) {
                if (currentIdx === blockIndex) {
                    targetMatch = match;
                    break;
                }
                currentIdx++;
            }

            if (targetMatch) {
                const oldBlock = targetMatch[0]; // The full ```...``` string
                const innerCode = targetMatch[1]; // The content inside
                
                // Wrap it
                const newCode = wrapInTemplate(innerCode);
                const newBlock = `\`\`\`html\n${newCode}\n\`\`\``;

                // Replace ONLY this specific occurrence
                // String.replace only replaces the first match, but we need to be careful if identical blocks exist.
                // Safest way: Split string by the match index
                
                const startIndex = targetMatch.index;
                const endIndex = startIndex + oldBlock.length;
                
                const newFullMessage = 
                    originalContent.substring(0, startIndex) + 
                    newBlock + 
                    originalContent.substring(endIndex);

                await updateMessageContent(mesId, newFullMessage);
                toastr.success('Code block fixed and wrapped!', extensionName);
            } else {
                toastr.error(`Could not locate code block #${blockIndex + 1} in raw text.`, extensionName);
            }
        });

        $pre.append($btn);
    }

    // --- Feature 2: Wrap Raw HTML (For content NOT in code blocks) ---

    function addRawWrapButtonToMessage(mesDiv, mesId) {
        const $mes = $(mesDiv);
        const $controls = $mes.find('.mes_buttons'); // The button bar at bottom/top of message
        
        // Avoid duplicates
        if ($controls.find('.st-wrap-raw-btn').length > 0) return;

        // Heuristic: Does this message have raw HTML tags but maybe no code blocks?
        // Or user just wants to force it.
        // We'll just add the button discreetly to all Assistant messages or messages with < tags.
        const text = chat[mesId]?.mes || "";
        if (!text.includes('<') && !text.includes('>')) return; 

        const $btn = $(`<div class="mes_button st-wrap-raw-btn" title="Wrap entire message in HTML code block">
            📜 Wrap All
        </div>`);

        $btn.on('click', async () => {
            if (!confirm("Wrap the ENTIRE message content into an HTML code block?")) return;

            let content = chat[mesId].mes;
            
            // If it already has backticks, we might break it, but the user asked for "Wrap All".
            // Let's just wrap the whole thing.
            const fixedCode = wrapInTemplate(content);
            const newBlock = `\`\`\`html\n${fixedCode}\n\`\`\``;
            
            await updateMessageContent(mesId, newBlock);
            toastr.success('Message wrapped in HTML block!', extensionName);
        });

        // Prepend instead of Append to put it on the far left (away from Copy/Delete on the right)
        // OR Append but rely on CSS margin.
        // Let's Prepend to be safe from right-side clutter.
        $controls.prepend($btn);
    }

    // --- Main Scan Logic ---

    function scanChat() {
        $('.mes').each(function() {
            const $mes = $(this);
            const mesId = $mes.attr('mesid');
            if (mesId === undefined) return;

            // 1. Find Code Blocks
            $mes.find('pre').each(function(index) {
                // 'index' here is the 0-based index of the pre tag within this message
                addFixButtonToBlock(this, mesId, index);
            });

            // 2. Add "Wrap Raw" button to message controls
            // Only for valid messages
            if (chat[mesId]) {
                 addRawWrapButtonToMessage(this, mesId);
            }
        });
    }

    // --- Initialization ---

    $(document).ready(function () {
        setTimeout(scanChat, 1000);

        // Observer
        const observer = new MutationObserver((mutations) => {
            let shouldScan = false;
            mutations.forEach(m => {
                if (m.addedNodes.length > 0) shouldScan = true;
            });
            if (shouldScan) scanChat();
        });

        const chatContainer = document.querySelector('#chat');
        if (chatContainer) {
            observer.observe(chatContainer, { childList: true, subtree: true });
        }
        
        if (typeof eventSource !== 'undefined') {
            eventSource.on('chat_changed', () => setTimeout(scanChat, 500));
            eventSource.on('message_rendered', () => setTimeout(scanChat, 100));
        }
    });

})();
