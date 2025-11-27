// CONTEXT: SillyTavern Extension - HTML Healer (Menu Version)
// Adds a "Fix" button to the Extension Settings Panel (The Menu).

const extensionName = "html-healer";

// 1. Core Logic: The Healer
function healHtml(dirtyHtml) {
    if (!dirtyHtml) return "";
    const parser = new DOMParser();
    const doc = parser.parseFromString(dirtyHtml, 'text/html');
    
    // Safety: Remove script tags
    const scripts = doc.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
        scripts[i].parentNode.removeChild(scripts[i]);
    }

    return doc.body.innerHTML;
}

// 2. The Button Action
async function fixLastMessage() {
    // Get context
    const context = SillyTavern.getContext();
    const chat = context.chat;

    if (!chat || chat.length === 0) {
        toastr.warning("No messages to fix.");
        return;
    }

    // Target the LAST message in the chat
    const lastMsgIndex = chat.length - 1;
    const originalMes = chat[lastMsgIndex].mes;
    
    // Heal it
    const healedMes = healHtml(originalMes);

    // Check if changes are needed
    if (originalMes === healedMes) {
        toastr.info("Last message is already healthy.", "HTML Healer");
        return;
    }

    // Apply changes
    chat[lastMsgIndex].mes = healedMes;

    // Save and Refresh
    await context.saveChat();
    await context.reloadCurrentChat();
    
    toastr.success("Fixed the last message!", "HTML Healer");
}

// 3. Create the Menu UI (Looks like EllipsisCleaner)
// This generates the HTML that appears in the Extensions menu
function loadSettings() {
    const settingsHtml = `
    <div class="html-healer-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>HTML Healer Controls</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            
            <div class="inline-drawer-content">
                <div class="styled_description_block">
                    Click the button below if the last message has broken colors or unclosed tags.
                </div>
                <br>
                <div id="html-healer-btn" class="menu_button">
                    <i class="fa-solid fa-band-aid"></i> Fix Last Message
                </div>
                <hr>
                <small>Status: Ready to heal.</small>
            </div>
        </div>
    </div>
    `;

    // Inject into the extension settings area
    $('#extensions_settings').append(settingsHtml);

    // Add Click Event Listener to our new button
    $('#html-healer-btn').on('click', () => {
        fixLastMessage();
    });
}

// 4. Initialization
jQuery(async () => {
    // Wait for the extensions menu to be ready, then load our UI
    loadSettings();
    console.log(`[${extensionName}] Menu UI Loaded.`);
});
