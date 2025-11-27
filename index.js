const extensionName = "html-healer";
const defaultDepth = 1;

/**
 * 1. The Core Logic
 * Handles <think> tags specifically, then cleans standard HTML.
 */
function healHtml(dirtyHtml) {
    if (!dirtyHtml) return "";

    let patched = dirtyHtml;

    // --- STEP A: Fix "Close COT" hallucinations ---
    // If the AI types "Close COT" or "End Thought" instead of the tag, we fix it.
    // The 'gi' flag makes it case-insensitive (detects "close cot", "CLOSE COT", etc.)
    patched = patched.replace(/Close COT/gi, '</think>');
    patched = patched.replace(/End Thought/gi, '</think>');

    // --- STEP B: Force Close <think> tags ---
    // We count how many times <think> appears versus </think>
    const openThinkCount = (patched.match(/<think>/g) || []).length;
    const closeThinkCount = (patched.match(/<\/think>/g) || []).length;

    // If there are more opens than closes, we append the missing closes to the end
    if (openThinkCount > closeThinkCount) {
        const missing = openThinkCount - closeThinkCount;
        // Add a newline to ensure it doesn't merge with the last word
        patched += "\n" + "</think>".repeat(missing);
    }

    // --- STEP C: Standard HTML Fixing (Divs, Spans, Colors) ---
    const parser = new DOMParser();
    const doc = parser.parseFromString(patched, 'text/html');
    
    // Safety: Remove script tags
    const scripts = doc.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
        scripts[i].parentNode.removeChild(scripts[i]);
    }

    return doc.body.innerHTML;
}

/**
 * 2. The Fix Action (Loop through messages)
 */
async function fixMessages() {
    const context = SillyTavern.getContext();
    const chat = context.chat;

    if (!chat || chat.length === 0) {
        toastr.warning("No messages to fix.");
        return;
    }

    // Get depth from input box
    let depth = parseInt($('#html-healer-depth').val());
    if (isNaN(depth) || depth < 1) depth = 1;

    let fixCount = 0;
    
    // Loop backwards
    for (let i = 0; i < depth; i++) {
        const targetIndex = chat.length - 1 - i;
        if (targetIndex < 0) break;

        const originalMes = chat[targetIndex].mes;
        const healedMes = healHtml(originalMes);

        // Update only if changed
        if (originalMes !== healedMes) {
            chat[targetIndex].mes = healedMes;
            fixCount++;
        }
    }

    if (fixCount === 0) {
        toastr.info(`Scanned ${depth} messages. No unclosed tags found.`);
    } else {
        await context.saveChat();
        await context.reloadCurrentChat();
        toastr.success(`Fixed ${fixCount} message(s)! <think> tags closed.`);
    }
}

/**
 * 3. The UI (Settings Menu)
 */
function loadSettings() {
    const settingsHtml = `
    <div class="html-healer-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>HTML Healer</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            
            <div class="inline-drawer-content">
                <div class="styled_description_block">
                    Fixes unclosed &lt;div&gt; and &lt;think&gt; tags. 
                    <br>Also converts "Close COT" text to tags.
                </div>
                
                <div class="healer-controls">
                    <label for="html-healer-depth">Scan Depth:</label>
                    <input id="html-healer-depth" type="number" class="text_pole" min="1" max="50" value="${defaultDepth}" />
                </div>

                <div id="html-healer-btn" class="menu_button">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Fix HTML & COT
                </div>
            </div>
        </div>
    </div>
    `;

    $('#extensions_settings').append(settingsHtml);

    $('#html-healer-btn').on('click', () => {
        fixMessages();
    });
}

jQuery(async () => {
    loadSettings();
    console.log(`[${extensionName}] Ready to fix <think> tags.`);
});
