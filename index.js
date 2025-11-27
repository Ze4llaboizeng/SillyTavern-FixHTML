const extensionName = "html-healer";
const defaultDepth = 1;

/**
 * LOGIC: CoT Fixer (Strict Mode)
 */
function fixChainOfThought(text) {
    if (!text) return "";

    const openCount = (text.match(/<think>/g) || []).length;
    if (openCount === 0) return text;

    // Remove extra <think> tags if multiple exist
    if (openCount > 1) {
        const firstIndex = text.indexOf("<think>");
        let before = text.slice(0, firstIndex + 7);
        let after = text.slice(firstIndex + 7).replace(/<think>/g, ""); 
        text = before + after;
    }

    // If already closed, check for duplicates, then exit
    if (text.includes("</think>")) {
        const closeCount = (text.match(/<\/think>/g) || []).length;
        if (closeCount > 1) {
             const firstClose = text.indexOf("</think>");
             let before = text.slice(0, firstClose + 8);
             let after = text.slice(firstClose + 8).replace(/<\/think>/g, "");
             text = before + after;
        }
        return text; 
    }

    // Try to find a natural stopping point
    const stopPhrases = [
        "Close COT", "CLOSE COT", "close cot",
        "End of thought", "Analysis complete"
    ];

    const regexPattern = new RegExp(`(${stopPhrases.join("|")})(?!<\/think>)`, "i");

    if (regexPattern.test(text)) {
        return text.replace(regexPattern, "$1</think>");
    }

    return text + "\n</think>";
}

/**
 * LOGIC: HTML Healer
 */
function healHtml(dirtyHtml) {
    if (!dirtyHtml) return "";
    let preProcessed = fixChainOfThought(dirtyHtml);
    const parser = new DOMParser();
    const doc = parser.parseFromString(preProcessed, 'text/html');
    
    const scripts = doc.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
        scripts[i].parentNode.removeChild(scripts[i]);
    }
    return doc.body.innerHTML;
}

/**
 * ACTION: Fix Messages
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
 * UI: Mobile Friendly Settings
 */
function loadSettings() {
    // Note the added 'inputmode="numeric"' and 'pattern="[0-9]*"'
    const settingsHtml = `
    <div class="html-healer-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>HTML & CoT Healer</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            
            <div class="inline-drawer-content">
                <div class="styled_description_block">
                    Fixes broken &lt;think&gt; logic and unclosed HTML.
                </div>
                
                <div class="healer-controls">
                    <label for="html-healer-depth">Scan Depth:</label>
                    <input 
                        id="html-healer-depth" 
                        type="number" 
                        inputmode="numeric" 
                        pattern="[0-9]*"
                        class="text_pole" 
                        min="1" 
                        max="50" 
                        value="${defaultDepth}" 
                    />
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
    console.log(`[${extensionName}] Ready (Mobile Optimized).`);
});
