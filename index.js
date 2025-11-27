const extensionName = "html-healer";
const defaultDepth = 1;

/**
 * LOGIC 1: The Specialized CoT Fixer
 * Rules:
 * - Only 1 <think> and 1 </think> allowed.
 * - Detect "Close COT" phrases.
 * - NEW: Detect HTML/CSS structure (div, span, etc.) to force close CoT.
 * - Ensures </think> is followed by a new line.
 */
function fixChainOfThought(text) {
    if (!text) return "";

    // Step A: Count how many <think> tags exist (Case Insensitive)
    const openMatches = text.match(/<think>/gi) || [];
    const openCount = openMatches.length;
    
    // If there are NO <think> tags, we don't need to do anything CoT related.
    if (openCount === 0) return text;

    // Step B: Enforce "Only One <think>"
    // If multiple exist, keep the first one, remove others.
    if (openCount > 1) {
        console.log(`[${extensionName}] Found multiple <think> tags. Cleaning extras.`);
        const firstIndex = text.search(/<think>/i);
        const firstTag = text.match(/<think>/i)[0];
        
        let before = text.slice(0, firstIndex + firstTag.length);
        let after = text.slice(firstIndex + firstTag.length).replace(/<think>/gi, ""); 
        text = before + after;
    }

    // Step C: Check if it is already closed (Case Insensitive)
    if (/<\/think>/i.test(text)) {
        // Ensure there is only one closing tag
        const closeMatches = text.match(/<\/think>/gi) || [];
        if (closeMatches.length > 1) {
             const firstCloseIndex = text.search(/<\/think>/i);
             const firstCloseTag = text.match(/<\/think>/i)[0];

             let before = text.slice(0, firstCloseIndex + firstCloseTag.length);
             let after = text.slice(firstCloseIndex + firstCloseTag.length).replace(/<\/think>/gi, "");
             text = before + after;
        }

        // FORMATTING FIX: Ensure </think> is followed by a new line
        text = text.replace(/<\/think>\s*/i, "</think>\n");

        return text; 
    }

    // --- STEP D (NEW): Detect HTML Structure Start ---
    // User Requirement: If we see <div> or CSS/HTML stuff, close the <think> there.
    // We look for common layout tags appearing AFTER the <think> tag.
    
    // 1. Find where <think> ends
    const thinkIndex = text.search(/<think>/i);
    const thinkTagLength = text.match(/<think>/i)[0].length;
    const searchStartIndex = thinkIndex + thinkTagLength;
    const textAfterThink = text.slice(searchStartIndex);

    // 2. Regex for common "Content Start" tags
    // Matches <div, <span, <p, <style, <link, <table, etc.
    const htmlStartPattern = /<(div|span|p|style|link|table|section|header|footer|blockquote|code|pre)\b/i;
    const htmlMatch = textAfterThink.match(htmlStartPattern);

    if (htmlMatch) {
        console.log(`[${extensionName}] Found HTML structure (${htmlMatch[0]}). Closing CoT before it.`);
        
        // Calculate the absolute index where the HTML tag starts
        const splitIndex = searchStartIndex + htmlMatch.index;
        
        const before = text.slice(0, splitIndex);
        const after = text.slice(splitIndex);
        
        // Insert closing tag + newline BEFORE the HTML tag
        return before + "\n</think>\n" + after;
    }

    // Step E: Stop Phrases (Fallback if no HTML structure found)
    const stopPhrases = [
        "Close COT",
        "CLOSE COT",
        "close cot",
        "End of thought",
        "Analysis complete"
    ];

    const regexPattern = new RegExp(`(${stopPhrases.join("|")})(?![\\s\\S]*<\\/think>)`, "i");

    if (regexPattern.test(text)) {
        console.log(`[${extensionName}] Found CoT stop phrase. Closing tag.`);
        return text.replace(regexPattern, "$1\n</think>\n");
    }

    // Step F: Ultimate Fallback - Close at end
    console.log(`[${extensionName}] No stop phrase or HTML structure. Force closing at end.`);
    return text + "\n</think>\n";
}

/**
 * LOGIC 2: General HTML Healer with Modes
 * Modes: 'both' (default), 'html_only', 'cot_only'
 */
function healHtml(dirtyHtml, mode = 'both') {
    if (!dirtyHtml) return "";

    let preProcessed = dirtyHtml;

    // 1. Logic: Fix CoT First (If requested)
    if (mode === 'both' || mode === 'cot_only') {
         preProcessed = fixChainOfThought(dirtyHtml);
         if (mode === 'cot_only') return preProcessed;
    }

    // 2. Logic: Fix HTML (If requested)
    // Extract <think>...<think> so DOMParser doesn't touch it
    const cotRegex = /<think>[\s\S]*?<\/think>/i;
    const cotMatch = preProcessed.match(cotRegex);
    let storedCot = "";
    const placeholder = "";

    if (cotMatch) {
        storedCot = cotMatch[0];
        preProcessed = preProcessed.replace(cotMatch[0], placeholder);
    }

    // Use DOMParser
    const parser = new DOMParser();
    const doc = parser.parseFromString(preProcessed, 'text/html');
    
    // Safety: Remove scripts
    const scripts = doc.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
        scripts[i].parentNode.removeChild(scripts[i]);
    }

    let healedHtml = doc.body.innerHTML;

    // Restore CoT
    if (storedCot) {
        healedHtml = healedHtml.replace(placeholder, storedCot);
    }

    return healedHtml;
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

    // Get the selected mode from UI
    const mode = $('#html-healer-mode').val() || 'both';

    let fixCount = 0;
    
    for (let i = 0; i < depth; i++) {
        const targetIndex = chat.length - 1 - i;
        if (targetIndex < 0) break;

        const originalMes = chat[targetIndex].mes;
        const healedMes = healHtml(originalMes, mode);

        if (originalMes !== healedMes) {
            chat[targetIndex].mes = healedMes;
            fixCount++;
        }
    }

    if (fixCount === 0) {
        toastr.info(`Checked last ${depth} messages. No changes needed (Mode: ${mode}).`);
    } else {
        await context.saveChat();
        await context.reloadCurrentChat();
        toastr.success(`Repaired ${fixCount} message(s)! (Mode: ${mode})`, "HTML Healer");
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
                    Manage broken HTML tags and Chain of Thought blocks.
                </div>
                
                <div class="healer-controls">
                    <label for="html-healer-depth">Depth:</label>
                    <input id="html-healer-depth" type="number" class="text_pole" min="1" max="50" value="${defaultDepth}" title="How many recent messages to scan" />
                </div>

                <div class="healer-controls">
                    <label for="html-healer-mode">Target:</label>
                    <select id="html-healer-mode" class="text_pole" style="width: auto; min-width: 120px;">
                        <option value="both">All (CoT Priority)</option>
                        <option value="html_only">HTML Only</option>
                        <option value="cot_only">CoT Only</option>
                    </select>
                </div>

                <div id="html-healer-btn" class="menu_button">
                    <i class="fa-solid fa-brain"></i> Execute Fix
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
    console.log(`[${extensionName}] Ready (Formatted CoT + HTML Detect).`);
});
