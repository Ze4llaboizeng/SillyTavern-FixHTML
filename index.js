const extensionName = "html-healer";
const defaultDepth = 1;

/**
 * STEP 1: Fix Chain of Thought (<think>)
 * Strict Rule: If </think> exists, DO NOT touch it.
 */
function fixChainOfThought(text) {
    if (!text) return "";

    // 1. Is there a <think> tag at all? If not, skip.
    if (!text.includes("<think>")) return text;

    // 2. Is it ALREADY closed?
    // If we find </think>, we assume it's safe. STOP here.
    // This prevents the "Double Fix" issue.
    if (text.includes("</think>")) {
        return text; 
    }

    // 3. Define the "Stop Words" (Case Insensitive)
    const stopPhrases = [
        "Close COT",
        "CLOSE COT",
        "close cot",
        "End of thought",
        "End of reasoning",
        "Analysis complete"
    ];

    // 4. Find the Stop Phrase and Close it
    const regexPattern = new RegExp(`(${stopPhrases.join("|")})`, "i");
    
    if (regexPattern.test(text)) {
        console.log(`[${extensionName}] Found stop phrase. Closing <think>.`);
        // We replace the found phrase with "Phrase + </think>"
        return text.replace(regexPattern, "$1</think>");
    }

    // 5. Fallback: No phrase found? Close at the end.
    console.log(`[${extensionName}] No stop phrase. Force closing <think>.`);
    return text + "\n</think>";
}

/**
 * STEP 2: Fix General HTML (<div>, <span>, etc.)
 * This runs AFTER Step 1 is completely finished.
 */
function healHtml(dirtyHtml) {
    if (!dirtyHtml) return "";

    // PASS 1: Fix the <think> tags first
    let cotFixedHtml = fixChainOfThought(dirtyHtml);

    // PASS 2: Fix the standard HTML structure
    // We use the browser's parser to close <div>s and <span>s
    const parser = new DOMParser();
    const doc = parser.parseFromString(cotFixedHtml, 'text/html');
    
    // Safety: Remove script tags
    const scripts = doc.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
        scripts[i].parentNode.removeChild(scripts[i]);
    }
    
    // Return the body content. 
    // Since Step 1 already ensured <think> is closed, DOMParser will treat it as a valid element
    // and will not try to double-close it.
    return doc.body.innerHTML;
}

/**
 * ACTION: Loop through messages
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
        
        // Run the strict healing logic
        const healedMes = healHtml(originalMes);

        // Only save if the string actually changed
        if (originalMes !== healedMes) {
            chat[targetIndex].mes = healedMes;
            fixCount++;
        }
    }

    if (fixCount === 0) {
        toastr.info(`Checked last ${depth} messages. No repairs needed.`);
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
    // Prevent duplicate menus if extension reloads
    $('.html-healer-settings').remove();

    const settingsHtml = `
    <div class="html-healer-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>HTML & CoT Healer</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            
            <div class="inline-drawer-content">
                <div class="styled_description_block">
                    <b>Logic:</b> Checks for &lt;think&gt; first. If found, closes it at "Close COT". Then fixes broken HTML divs.
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
    console.log(`[${extensionName}] Strict Mode Ready.`);
});
