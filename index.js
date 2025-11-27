const extensionName = "html-healer";
const defaultDepth = 1;

// --- 1. The Healing Logic (Same as before) ---
function healHtml(dirtyHtml) {
    if (!dirtyHtml) return "";
    const parser = new DOMParser();
    const doc = parser.parseFromString(dirtyHtml, 'text/html');
    
    const scripts = doc.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
        scripts[i].parentNode.removeChild(scripts[i]);
    }
    return doc.body.innerHTML;
}

// --- 2. The Fix Action with DEPTH ---
async function fixMessages() {
    const context = SillyTavern.getContext();
    const chat = context.chat;

    if (!chat || chat.length === 0) {
        toastr.warning("No messages to fix.");
        return;
    }

    // Get the value from the input box
    let depth = parseInt($('#html-healer-depth').val());
    if (isNaN(depth) || depth < 1) depth = 1;

    let fixCount = 0;
    
    // Loop backwards based on depth
    // If depth is 3, we look at: Last, Last-1, Last-2
    for (let i = 0; i < depth; i++) {
        const targetIndex = chat.length - 1 - i;
        
        // Stop if we reach the beginning of the chat
        if (targetIndex < 0) break;

        const originalMes = chat[targetIndex].mes;
        const healedMes = healHtml(originalMes);

        // Only update if it actually needs fixing
        if (originalMes !== healedMes) {
            chat[targetIndex].mes = healedMes;
            fixCount++;
        }
    }

    if (fixCount === 0) {
        toastr.info(`Checked last ${depth} messages. All healthy.`);
    } else {
        // Save and Refresh only ONCE after the loop finishes
        await context.saveChat();
        await context.reloadCurrentChat();
        toastr.success(`Repaired ${fixCount} message(s)!`, "HTML Healer");
    }
}

// --- 3. The UI (Input + Button) ---
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
                    Automatically close broken tags (e.g. unclosed divs).
                </div>
                
                <div class="healer-controls">
                    <label for="html-healer-depth">Scan Depth (Messages):</label>
                    <input id="html-healer-depth" type="number" class="text_pole" min="1" max="50" value="${defaultDepth}" />
                </div>

                <div id="html-healer-btn" class="menu_button">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Fix HTML
                </div>
            </div>
        </div>
    </div>
    `;

    $('#extensions_settings').append(settingsHtml);

    // Add Click Event
    $('#html-healer-btn').on('click', () => {
        fixMessages();
    });
}

jQuery(async () => {
    loadSettings();
    console.log(`[${extensionName}] Ready.`);
});
