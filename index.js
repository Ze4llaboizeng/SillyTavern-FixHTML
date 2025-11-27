const extensionName = "html-healer";
const defaultDepth = 1;

/**
 * LOGIC 1: Fix <think> tags specifically
 * This runs BEFORE the standard HTML healer.
 */
function fixChainOfThought(text) {
    if (!text) return "";

    // 1. Check if we even have an opening <think>
    if (!text.includes("<think>")) return text;

    // 2. Check if it's already closed correctly
    if (text.includes("</think>")) return text;

    // 3. Define the "Stop Words" (Case Insensitive)
    // These are the phrases the AI might use when it wants to stop thinking
    const stopPhrases = [
        "Close COT",
        "CLOSE COT",
        "close cot",
        "End of thought",
        "End of reasoning",
        "Analysis complete"
    ];

    // 4. Try to find a stop phrase and insert </think> after it
    // We create a Regex that looks for any of these phrases (case insensitive)
    // The 'i' flag makes it case insensitive, 'g' checks globally
    const regexPattern = new RegExp(`(${stopPhrases.join("|")})`, "i");
    
    // If we find a match (e.g., "Close COT"), replace it with "Close COT</think>"
    if (regexPattern.test(text)) {
        console.log(`[${extensionName}] Found CoT stop phrase. Closing tag.`);
        // $1 keeps the original text (e.g., "Close COT") and adds the tag
        return text.replace(regexPattern, "$1</think>");
    }

    // 5. Fallback: If no stop phrase is found, close it at the very end
    // This prevents the thought from hiding the entire message
    console.log(`[${extensionName}] No stop phrase found. Force closing <think> at end.`);
    return text + "\n</think>";
}

/**
 * LOGIC 2: Standard HTML Healer (<div>, <span>, etc.)
 */
function healHtml(dirtyHtml) {
    if (!dirtyHtml) return "";

    // Run the CoT Fixer FIRST
    let preProcessed = fixChainOfThought(dirtyHtml);

    const parser = new DOMParser();
    const doc = parser.parseFromString(preProcessed, 'text/html');
    
    // Safety: Remove scripts
    const scripts = doc.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
        scripts[i].parentNode.removeChild(scripts[i]);
    }
    
    return doc.body.innerHTML;
}

/**
 * ACTION: Loop through messages and fix them
 */
async function fixMessages() {
    const context = SillyTavern.getContext();
    const chat = context.chat;

    if (!chat || chat.length === 0) {
        toastr.warning("No messages to fix.");
        return;
    }

    let depth = parseInt($('#html-healer-depth').val());
    if (isNaN(depth) || depth < 1) depth = 1;

    let fixCount = 0;
    
    for (let i = 0; i < depth; i++) {
        const targetIndex = chat.length - 1 - i;
        if (targetIndex < 0) break;

        const originalMes = chat[targetIndex].mes;
        
        // This runs both the CoT Fixer AND the HTML Fixer
        const healedMes = healHtml(originalMes);

        if (originalMes !== healedMes) {
            chat[targetIndex].mes = healedMes;
            fixCount++;
        }
    }

    if (fixCount === 0) {
        toastr.info(`Checked last ${depth} messages. No broken CoT or HTML found.`);
    } else {
        await context.saveChat();
        await context.reloadCurrentChat();
        toastr.success(`Repaired ${fixCount} message(s)!`, "HTML Healer");
    }
}

/**
 * UI: Settings Menu
 */
function loadSettings() {
    const settingsHtml = `
    <div class="html-healer-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>HTML & CoT Healer</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            
            <div class="inline-drawer-content">
                <div class="styled_description_block">
                    Closes broken &lt;think&gt; tags and HTML divs.<br>
                    Detects "Close COT" phrases.
                </div>
                
                <div class="healer-controls">
                    <label for="html-healer-depth">Scan Depth:</label>
                    <input id="html-healer-depth" type="number" class="text_pole" min="1" max="50" value="${defaultDepth}" />
                </div>

                <div id="html-healer-btn" class="menu_button">
                    <i class="fa-solid fa-brain"></i> Fix Logic & HTML
                </div>
            </div>
        </div>
    </div>
    `;

    $('#extensions_settings').append(settingsHtml);
    $('#html-healer-btn').on('click', () => fixMessages());
}

jQuery(async () => {
    loadSettings();
    console.log(`[${extensionName}] Ready to fix CoT.`);
});
