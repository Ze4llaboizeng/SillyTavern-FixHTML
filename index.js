// CONTEXT: SillyTavern Extension - HTML Healer (UI Version)
// Adds a "Repair" button to every message to fix broken HTML tags.

const extensionName = "html-healer";

/**
 * The Core Logic: HTML Sanitizer and Closer
 * Uses browser DOMParser to auto-close tags.
 */
function healHtml(dirtyHtml) {
    if (!dirtyHtml) return "";
    const parser = new DOMParser();
    const doc = parser.parseFromString(dirtyHtml, 'text/html');
    
    // Safety: Remove script tags to prevent issues during healing
    const scripts = doc.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
        scripts[i].parentNode.removeChild(scripts[i]);
    }

    return doc.body.innerHTML;
}

/**
 * The click handler for the repair button
 * @param {number} index - The index of the message in the chat array
 */
async function onRepairClick(index) {
    // 1. Get the current chat
    const context = SillyTavern.getContext();
    const chat = context.chat;

    if (!chat[index]) {
        console.error(`[${extensionName}] Message index ${index} not found.`);
        return;
    }

    // 2. Heal the content
    const originalMes = chat[index].mes;
    const healedMes = healHtml(originalMes);

    // 3. Check if changes are needed
    if (originalMes === healedMes) {
        toastr.info("HTML looks healthy. No repair needed.");
        return;
    }

    // 4. Update the chat data
    chat[index].mes = healedMes;

    // 5. Save and Refresh
    // We must save and reload to ensure the CSS/HTML bleeding stops affects the rest of the page
    await context.saveChat();
    await context.reloadCurrentChat();
    
    toastr.success("HTML Repaired!", "Tags auto-closed");
}

/**
 * Inject the button into the message toolbar
 */
function addRepairButton(messageId, messageDiv) {
    // Locate the button container (class .mes_buttons)
    const buttonContainer = $(messageDiv).find('.mes_buttons');
    
    // Avoid duplicates if the event fires multiple times
    if (buttonContainer.find('.html-healer-btn').length > 0) return;

    // Create the button
    // We use 'fa-band-aid' as the icon
    const repairBtn = $(`
        <div class="mes_button html-healer-btn" title="Repair Broken HTML">
            <i class="fa-solid fa-band-aid"></i>
        </div>
    `);

    // Add Click Event
    repairBtn.on('click', () => {
        onRepairClick(messageId);
    });

    // Append to the toolbar (usually appended at the end or beginning)
    buttonContainer.append(repairBtn);
}

// Hook into SillyTavern's event system
jQuery(async () => {
    // Listen for when a message is rendered in the DOM
    const eventSource = SillyTavern.getContext().eventSource;
    
    eventSource.on(eventSource.MESSAGE_RENDERED, (id) => {
        // 'id' is the index of the message in the chat array
        // We find the DOM element associated with this ID
        const messageDiv = $(`#chat .mes[messageid="${id}"]`);
        
        if (messageDiv.length) {
            addRepairButton(id, messageDiv);
        }
    });

    // Also run once on startup for existing messages in case of a reload
    // This loops through currently rendered messages
    $('#chat .mes').each(function() {
        const id = $(this).attr('messageid');
        if (id !== undefined) {
            addRepairButton(Number(id), this);
        }
    });

    console.log(`[${extensionName}] UI Loaded. Ready to repair.`);
});
