const extensionName = "html-healer";
const defaultDepth = 1;

/**
 * LOGIC 1: The Specialized CoT Fixer
 * Rules:
 * - Only 1 <think> and 1 </think> allowed.
 * - Detect "Close COT" only if it doesn't already have a tag.
 * - Case-insensitive checks to prevent double tagging (e.g. </THINK> and </think>).
 */
function fixChainOfThought(text) {
    if (!text) return "";

    // Step A: Count how many <think> tags exist (Case Insensitive)
    const openMatches = text.match(/<think>/gi) || [];
    const openCount = openMatches.length;
    
    // If there are NO <think> tags, we don't need to do anything CoT related.
    if (openCount === 0) return text;

    // Step B: Enforce "Only One <think>"
    // If the AI hallucinated and put multiple <think> tags, we keep the first one 
    // and remove the rest to prevent structure breakage.
    if (openCount > 1) {
        console.log(`[${extensionName}] Found multiple <think> tags. Cleaning extras.`);
        
        // Find the first index (Case Insensitive search)
        const firstIndex = text.search(/<think>/i);
        // Get the actual tag string found (e.g. <THINK> or <think>) to handle length correctly
        const firstTag = text.match(/<think>/i)[0];
        
        // Remove all subsequent <think> tags
        let before = text.slice(0, firstIndex + firstTag.length);
        // Replace globally with case-insensitivity in the 'after' chunk
        let after = text.slice(firstIndex + firstTag.length).replace(/<think>/gi, ""); 
        text = before + after;
    }

    // Step C: Check if it is already closed (Case Insensitive)
    if (/<\/think>/i.test(text)) {
        // Optional: Ensure there is only one closing tag too
        const closeMatches = text.match(/<\/think>/gi) || [];
        if (closeMatches.length > 1) {
             const firstCloseIndex = text.search(/<\/think>/i);
             const firstCloseTag = text.match(/<\/think>/i)[0];

             let before = text.slice(0, firstCloseIndex + firstCloseTag.length);
             let after = text.slice(firstCloseIndex + firstCloseTag.length).replace(/<\/think>/gi, "");
             text = before + after;
        }
        return text; 
    }

    // Step D: It is NOT closed. Let's find where to close it.
    const stopPhrases = [
        "Close COT",
        "CLOSE COT",
        "close cot",
        "End of thought",
        "Analysis complete"
    ];

    // Regex Explanation:
    // (${stopPhrases})  -> Match any of the words
    // (?![\s\S]*<\/think>) -> Negative Lookahead: Only match if NOT followed by a closing tag later
    // Added 'i' flag for case insensitivity
    const regexPattern = new RegExp(`(${stopPhrases.join("|")})(?![\\s\\S]*<\\/think>)`, "i");

    if (regexPattern.test(text)) {
        console.log(`[${extensionName}] Found CoT stop phrase. Closing tag.`);
        return text.replace(regexPattern, "$1</think>");
    }

    // Step E: Fallback - Close at end if no phrase found
    console.log(`[${extensionName}] No stop phrase. Force closing at end.`);
    return text + "\n</think>";
}

/**
 * LOGIC 2: General HTML Healer
 * Fixes divs, spans, etc.
 */
function healHtml(dirtyHtml) {
    if (!dirtyHtml) return "";

    // 1. First, fix the CoT Logic strictly
    // This ensures we have exactly one <think> and one </think> (if applicable)
    let preProcessed = fixChainOfThought(dirtyHtml);

    // --- PROTECTION STEP ---
    // We extract the <think> block entirely so DOMParser cannot touch it.
    // This prevents the "add two </think>" issue where the parser might 
    // duplicate the closing tag or malform the content.
    const cotRegex = /<think>[\s\S]*?<\/think>/i;
    const cotMatch = preProcessed.match(cotRegex);
    let storedCot = "";
    let placeholder = "";

    if (cotMatch) {
        storedCot = cotMatch[0];
        // Replace the CoT block with a safe comment placeholder
        preProcessed = preProcessed.replace(cotMatch[0], placeholder);
    }

    // 2. Now use DOMParser for the rest (fixing divs, spans, etc.)
    const parser = new DOMParser();
    const doc = parser.parseFromString(preProcessed, 'text/html');
    
    // Safety: Remove scripts
    const scripts = doc.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
        scripts[i].parentNode.removeChild(scripts[i]);
    }

    let healedHtml = doc.body.innerHTML;

    // --- RESTORATION STEP ---
    // Put the <think> block back exactly as it was
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

    let fixCount = 0;
    
    for (let i = 0; i < depth; i++) {
        const targetIndex = chat.length - 1 - i;
        if (targetIndex < 0) break;

        const originalMes = chat[targetIndex].mes;
        const healedMes = healHtml(originalMes);

        if (originalMes !== healedMes) {
            chat[targetIndex].mes = healedMes;
            fixCount++;
        }
    }

    if (fixCount === 0) {
        toastr.info(`Checked last ${depth} messages. Logic & HTML are healthy.`);
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
                    Ensures single &lt;think&gt; tags and closes generic HTML.
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
    console.log(`[${extensionName}] Ready (Strict Mode + Protected CoT).`);
});
