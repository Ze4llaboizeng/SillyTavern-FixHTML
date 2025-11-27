const extensionName = "html-healer";
const defaultDepth = 1;

/**
 * LOGIC 1: The Optimized CoT Fixer
 * Improvements:
 * - Decodes escaped entities (&lt;think&gt;)
 * - Removes duplicate tags intelligently
 * - Adds proper spacing around tags
 * - Auto-detects stop phrases
 */
function fixChainOfThought(text) {
    if (!text) return "";

    // 0. Pre-cleaning: Unescape potentially encoded tags
    text = text.replace(/&lt;think&gt;/gi, "<think>").replace(/&lt;\/think&gt;/gi, "</think>");

    // Step A: Check existence
    const hasOpen = /<think>/i.test(text);
    if (!hasOpen) return text;

    // Step B: Enforce Single Opening Tag
    // Keep the FIRST <think>, remove others strictly
    const firstOpenIndex = text.search(/<think>/i);
    const preOpen = text.substring(0, firstOpenIndex);
    const postOpen = text.substring(firstOpenIndex + 7); // +7 is length of <think>
    
    // Reconstruct: Pre + <think> + Post (with any other <think> removed)
    text = preOpen + "<think>\n" + postOpen.replace(/<think>/gi, "");

    // Step C: Handle Closing Tag
    if (/<\/think>/i.test(text)) {
        // Enforce Single Closing Tag (Keep the FIRST one to match structure)
        const parts = text.split(/<\/think>/i);
        if (parts.length > 1) {
            // Keep content before first close, and join the rest without the tag
            const content = parts[0];
            const remainder = parts.slice(1).join(""); 
            
            // Reconstruct with proper spacing
            // Trim end of content to avoid double newlines, then add close tag + newline
            text = content.trimEnd() + "\n</think>\n" + remainder;
        }
    } else {
        // Step D: Auto-Close Logic (Missing </think>)
        const stopPhrases = [
            "Close COT", "CLOSE COT", "End of thought", 
            "Analysis complete", "Thinking process end"
        ];

        // Regex lookahead: Find phrase if NOT followed by existing </think>
        // We use a simplified check since we know it's missing from Step C
        const regexString = `(${stopPhrases.join("|")})`;
        const stopRegex = new RegExp(regexString, "i");
        
        if (stopRegex.test(text)) {
            console.log(`[${extensionName}] Found stop phrase. Closing CoT.`);
            // Replace phrase with phrase + closing tag
            text = text.replace(stopRegex, "$1\n</think>\n");
        } else {
            console.log(`[${extensionName}] No stop phrase. Force closing at end.`);
            text = text.trimEnd() + "\n</think>\n";
        }
    }

    return text;
}

/**
 * LOGIC 2: Robust HTML Healer with Modes
 * Modes: 'both' (default), 'html_only', 'cot_only'
 */
function healHtml(dirtyHtml, mode = 'both') {
    if (!dirtyHtml) return "";

    let preProcessed = dirtyHtml;

    // 1. Logic: Fix CoT First
    if (mode === 'both' || mode === 'cot_only') {
         preProcessed = fixChainOfThought(dirtyHtml);
         if (mode === 'cot_only') return preProcessed;
    }

    // 2. Logic: Fix HTML (Protection Mechanism)
    // Create a unique placeholder to avoid collision with user text
    const placeholder = ``;
    const cotRegex = /<think>[\s\S]*?<\/think>/i;
    
    let storedCot = "";
    const cotMatch = preProcessed.match(cotRegex);

    if (cotMatch) {
        storedCot = cotMatch[0];
        // Replace with placeholder so DOMParser doesn't mess it up
        preProcessed = preProcessed.replace(cotMatch[0], placeholder);
    }

    // 3. DOMParser Repair
    const parser = new DOMParser();
    const doc = parser.parseFromString(preProcessed, 'text/html');
    
    // Safety: Remove scripts
    const scripts = doc.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
        scripts[i].parentNode.removeChild(scripts[i]);
    }

    let healedHtml = doc.body.innerHTML;

    // 4. Restoration
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
        toastr.info(`Scanned ${depth} msgs. All clean (Mode: ${mode}).`);
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
    // Check if settings already exist to avoid duplicates
    if ($('.html-healer-settings').length > 0) return;

    const settingsHtml = `
    <div class="html-healer-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>HTML & CoT Healer</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            
            <div class="inline-drawer-content">
                <div class="styled_description_block">
                    Auto-fix broken HTML and manage &lt;think&gt; blocks.
                </div>
                
                <div class="healer-controls">
                    <label for="html-healer-depth">Depth:</label>
                    <input id="html-healer-depth" type="number" class="text_pole" min="1" max="50" value="${defaultDepth}" title="Messages to scan" />
                </div>

                <div class="healer-controls">
                    <label for="html-healer-mode">Mode:</label>
                    <select id="html-healer-mode" class="text_pole" style="width: auto; min-width: 120px;">
                        <option value="both">Full Fix (CoT + HTML)</option>
                        <option value="html_only">Fix HTML Only</option>
                        <option value="cot_only">Fix CoT Only</option>
                    </select>
                </div>

                <div id="html-healer-btn" class="menu_button">
                    <i class="fa-solid fa-magic"></i> Heal Messages
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
    console.log(`[${extensionName}] Ready (Optimized).`);
});
