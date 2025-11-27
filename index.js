const extensionName = "html-healer";

// Default settings
const defaultDepth = 1;
const defaultThinkTag = "think"; // The tag to look for
const defaultStopper = ""; // User defines this in UI

/**
 * PRE-PROCESSOR: Specific Logic for <think> tags
 * This runs BEFORE the general HTML fix.
 * It ensures </think> is inserted exactly before a specific marker.
 */
function preProcessThinkLogic(text, stopper) {
    const openTag = `<${defaultThinkTag}`;
    const closeTag = `</${defaultThinkTag}>`;

    // 1. If there is no open <think>, do nothing
    if (!text.includes(openTag)) return text;

    // 2. If it is already closed properly, generally we leave it alone.
    // However, for advanced logic, we assume if the user is running this, 
    // the tag is likely broken or they want to force a structure.
    // Simple check: if </think> exists, we assume it's okay for now.
    if (text.includes(closeTag)) return text;

    // 3. The <think> is OPEN. We need to close it.
    
    // Scenario A: User provided a "Stopper" (e.g., [Output])
    // We want: <think> ... </think> [Output] ...
    if (stopper && text.includes(stopper)) {
        console.log(`[${extensionName}] Closing <think> before stopper: "${stopper}"`);
        // Replace the FIRST occurrence of the stopper with </think> + stopper
        return text.replace(stopper, `${closeTag}\n${stopper}`);
    } 
    
    // Scenario B: No stopper found, or stopper not defined.
    // Just close it at the end to be safe.
    return text + `\n${closeTag}`;
}

/**
 * CORE LOGIC: General HTML Healer
 */
function healHtml(dirtyHtml, stopper) {
    if (!dirtyHtml) return "";

    // Step 1: Run the specific <think> logic first
    let semiClean = preProcessThinkLogic(dirtyHtml, stopper);

    // Step 2: Run the browser's DOMParser to fix divs, spans, and formatting
    const parser = new DOMParser();
    const doc = parser.parseFromString(semiClean, 'text/html');
    
    // Safety: Remove script tags
    const scripts = doc.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
        scripts[i].parentNode.removeChild(scripts[i]);
    }

    return doc.body.innerHTML;
}

/**
 * UI ACTION: Trigger the fix
 */
async function fixMessages() {
    const context = SillyTavern.getContext();
    const chat = context.chat;

    if (!chat || chat.length === 0) {
        toastr.warning("No messages to fix.");
        return;
    }

    // Get Inputs
    let depth = parseInt($('#html-healer-depth').val());
    if (isNaN(depth) || depth < 1) depth = 1;
    
    // Get the unique name/stopper (e.g., "Here is my answer:")
    const stopper = $('#html-healer-stopper').val().trim();

    let fixCount = 0;
    
    // Loop backwards
    for (let i = 0; i < depth; i++) {
        const targetIndex = chat.length - 1 - i;
        if (targetIndex < 0) break;

        const originalMes = chat[targetIndex].mes;
        
        // Pass the stopper to our healer function
        const healedMes = healHtml(originalMes, stopper);

        if (originalMes !== healedMes) {
            chat[targetIndex].mes = healedMes;
            fixCount++;
        }
    }

    if (fixCount === 0) {
        toastr.info(`Scanned ${depth} messages. No open tags found.`);
    } else {
        await context.saveChat();
        await context.reloadCurrentChat();
        toastr.success(`Repaired ${fixCount} message(s)!`, "HTML Healer");
    }
}

/**
 * GENERATE UI
 */
function loadSettings() {
    const settingsHtml = `
    <div class="html-healer-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>HTML & Think Healer</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            
            <div class="inline-drawer-content">
                <div class="styled_description_block">
                    Fixes unclosed HTML. Can specifically close &lt;think&gt; tags before a unique word.
                </div>
                
                <div class="healer-controls-grid">
                    
                    <div class="control-item">
                        <label for="html-healer-depth">Scan Depth:</label>
                        <input id="html-healer-depth" type="number" class="text_pole" min="1" max="50" value="${defaultDepth}" />
                    </div>

                    <div class="control-item full-width">
                        <label for="html-healer-stopper">Must close before (Unique Text):</label>
                        <input id="html-healer-stopper" type="text" class="text_pole" placeholder="e.g. <start_response> or [Answer]" />
                        <small>If found, &lt;/think&gt; is forced right before this text.</small>
                    </div>

                </div>

                <div id="html-healer-btn" class="menu_button">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Fix HTML / Close Think
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
    console.log(`[${extensionName}] Ready.`);
});
