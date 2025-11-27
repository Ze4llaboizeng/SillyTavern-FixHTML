const extensionName = "html-healer";
const defaultDepth = 1;

/**
 * LOGIC 1: The Specialized CoT Fixer
 * Rules:
 * - Only 1 <think> and 1 </think> allowed.
 * - Detect "Close COT" only if it doesn't already have a tag.
 */
function fixChainOfThought(text) {
    if (!text) return "";

    // Step A: Count how many <think> tags exist
    const openCount = (text.match(/<think>/g) || []).length;
    
    // If there are NO <think> tags, we don't need to do anything CoT related.
    if (openCount === 0) return text;

    // Step B: Enforce "Only One <think>"
    // If the AI hallucinated and put multiple <think> tags, we keep the first one 
    // and remove the rest to prevent structure breakage.
    if (openCount > 1) {
        console.log(`[${extensionName}] Found multiple <think> tags. Cleaning extras.`);
        // Find the first index
        const firstIndex = text.indexOf("<think>");
        // Remove all subsequent <think> tags
        // We slice the text into two parts: before first tag+length, and the rest (where we delete tags)
        let before = text.slice(0, firstIndex + 7); // 7 is length of <think>
        let after = text.slice(firstIndex + 7).replace(/<think>/g, ""); 
        text = before + after;
    }

    // Step C: Check if it is already closed
    // We look for </think>. If strictly one exists, we assume it's safe 
    // (unless you want to force move it, but usually existing tags are fine).
    if (text.includes("</think>")) {
        // Optional: Ensure there is only one closing tag too
        const closeCount = (text.match(/<\/think>/g) || []).length;
        if (closeCount > 1) {
             // Keep the LAST closing tag, remove others? 
             // Or Keep the FIRST? Usually the first one closes the thought.
             // Let's rely on the first one being the valid closer.
             const firstClose = text.indexOf("</think>");
             let before = text.slice(0, firstClose + 8);
             let after = text.slice(firstClose + 8).replace(/<\/think>/g, "");
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
    // (?!<\/think>)     -> Negative Lookahead: ONLY match if NOT followed by </think>
    // This prevents double tagging "Close COT</think></think>"
    const regexPattern = new RegExp(`(${stopPhrases.join("|")})(?!<\/think>)`, "i");

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
    let preProcessed = fixChainOfThought(dirtyHtml);

    // 2. Now use DOMParser for the rest
    const parser = new DOMParser();
    const doc = parser.parseFromString(preProcessed, 'text/html');
    
    // Safety: Remove scripts
    const scripts = doc.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
        scripts[i].parentNode.removeChild(scripts[i]);
    }

    // 3. Return the fully healed string
    // DOMParser is smart enough to respect the </think> we added in Step 1
    // and will close any <div> tags that are still open around it.
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
    console.log(`[${extensionName}] Ready (Strict Mode).`);
});
