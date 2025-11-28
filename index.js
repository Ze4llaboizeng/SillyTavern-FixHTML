const extensionName = "html-healer";
const extensionAuthor = "Zealllll";

// --- 1. Global Settings & Persistence ---
const DEFAULT_CUSTOM_TAGS = "scrollborad.zeal, neon-box, chat-bubble";
let userCustomTags = new Set();
let aiSettings = {
    provider: 'main', // 'main' or 'gemini'
    apiKey: '',
    model: 'gemini-2.5-flash',
    autoLearn: true
};

// --- LOGGING ---
const MAX_LOGS = 50;
let logHistory = [];
function addLog(message, type = 'info') {
    logHistory.unshift({ time: new Date().toLocaleTimeString(), msg: message, type });
    if (logHistory.length > MAX_LOGS) logHistory.pop();
    console.log(`[${extensionName}] ${message}`);
}
function showLogViewer() { /* ... (Log Viewer logic optional, can be kept simple) ... */ }

// --- SETTINGS LOGIC ---
function loadSettingsData() {
    const storedTags = localStorage.getItem('html-healer-custom-tags');
    const rawString = storedTags !== null ? storedTags : DEFAULT_CUSTOM_TAGS;
    userCustomTags.clear();
    rawString.split(',').forEach(t => { if(t.trim()) userCustomTags.add(t.trim().toLowerCase()); });

    const storedAi = localStorage.getItem('html-healer-ai-settings');
    if (storedAi) {
        try { aiSettings = { ...aiSettings, ...JSON.parse(storedAi) }; } catch(e) {}
    }
    updateSettingsUI();
}

function updateSettingsUI() {
    if ($('#setting_custom_tags').length) $('#setting_custom_tags').val(Array.from(userCustomTags).join(', '));
    if ($('#setting_ai_provider').length) {
        $('#setting_ai_provider').val(aiSettings.provider);
        $('#setting_gemini_key').val(aiSettings.apiKey);
        $('#setting_gemini_model').val(aiSettings.model);
        $('#setting_auto_learn').prop('checked', aiSettings.autoLearn);
        aiSettings.provider === 'gemini' ? $('.gemini-settings').slideDown() : $('.gemini-settings').slideUp();
    }
}

function saveAllSettings() {
    const tagsVal = $('#setting_custom_tags').val();
    userCustomTags.clear();
    tagsVal.split(',').forEach(t => { if(t.trim()) userCustomTags.add(t.trim().toLowerCase()); });
    localStorage.setItem('html-healer-custom-tags', Array.from(userCustomTags).join(', '));
    
    aiSettings.provider = $('#setting_ai_provider').val();
    aiSettings.apiKey = $('#setting_gemini_key').val().trim();
    aiSettings.model = $('#setting_gemini_model').val();
    aiSettings.autoLearn = $('#setting_auto_learn').is(':checked');
    localStorage.setItem('html-healer-ai-settings', JSON.stringify(aiSettings));

    toastr.success("Settings Saved!");
    addLog("Settings updated.");
}

// --- 2. Logic: Universal Fixer ---
function smartLineFix(fullText) {
    if (!fullText) return "";
    const tagRegex = /(<\/?(?:[a-zA-Z0-9\.\-\_:]+)[^>]*>)/g;
    const tokens = fullText.split(tagRegex);
    const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
    let stack = []; let fixedText = ""; 

    for (let token of tokens) {
        if (!token) continue; 
        if (token.startsWith("<") && token.endsWith(">")) {
            const match = token.match(/^<\/?([a-zA-Z0-9\.\-\_:]+)/);
            if (!match || !/^[a-zA-Z]/.test(match[1])) { fixedText += token; continue; }

            const tagName = match[1].toLowerCase();
            const isClosing = token.startsWith("</");
            const isSelfClosing = /\/>$/.test(token.trim());

            if (voidTags.has(tagName) || isSelfClosing) {
                fixedText += token;
            } else if (isClosing) {
                let foundIdx = -1;
                for (let i = stack.length - 1; i >= 0; i--) { if (stack[i] === tagName) { foundIdx = i; break; } }
                if (foundIdx !== -1) {
                    while (stack.length > foundIdx + 1) { fixedText += `</${stack.pop()}>`; }
                    stack.pop(); fixedText += token;
                } else { fixedText += token; }
            } else {
                stack.push(tagName); fixedText += token;
            }
        } else { fixedText += token; }
    }
    while (stack.length > 0) { fixedText += `</${stack.pop()}>`; }
    return fixedText;
}

// --- 3. UI: Magic Wand Injection ---
function addWandToMessage(mesBlock) {
    const btnContainer = mesBlock.find('.mes_edit_buttons, .mes_buttons').first();
    if (btnContainer.find('.healer-wand-btn').length > 0) return;

    const wandBtn = $(`<div class="healer-wand-btn" title="HTML Healer Menu"><i class="fa-solid fa-wand-magic-sparkles"></i></div>`);
    wandBtn.on('click', function(e) {
        e.stopPropagation();
        const mesId = mesBlock.attr('mesid');
        const rect = this.getBoundingClientRect();
        showWandMenu(mesId, rect.left, rect.bottom);
    });
    btnContainer.prepend(wandBtn);
}

function initMessageObserver() {
    $('.mes').each(function() { addWandToMessage($(this)); });
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.addedNodes.length) {
                $(mutation.addedNodes).each(function() {
                    if ($(this).hasClass('mes')) addWandToMessage($(this));
                    else if ($(this).find) $(this).find('.mes').each(function() { addWandToMessage($(this)); });
                });
            }
        });
    });
    const chatContainer = document.querySelector('#chat');
    if (chatContainer) observer.observe(chatContainer, { childList: true, subtree: true });
}

// --- 4. UI: Popover & Editor ---
function showWandMenu(mesId, x, y) {
    $('.healer-popover').remove();
    const context = SillyTavern.getContext();
    const msg = context.chat[mesId];
    if (!msg) return;
    const hasSelection = window.getSelection().toString().trim().length > 0;
    
    const menuHtml = `
    <div class="healer-popover" style="left:${x}px; top:${y + 5}px;">
        <div class="healer-menu-header"><span>MSG #${mesId}</span><span style="opacity:0.5; cursor:pointer;" onclick="$('.healer-popover').remove()">✕</span></div>
        <div class="healer-menu-item" id="wand-quick-fix">
            <i class="fa-solid fa-code" style="color:#98c379;"></i>
            <div><div>Quick Fix (Code)</div><div style="font-size:0.75em; opacity:0.6;">${hasSelection ? 'Fixes Selected Context' : 'Fixes Entire Message'}</div></div>
        </div>
        <div class="healer-menu-item" id="wand-open-editor">
            <i class="fa-solid fa-layer-group" style="color:#61afef;"></i>
            <div><div>Open Split Editor</div><div style="font-size:0.75em; opacity:0.6;">Edit Story & Logic</div></div>
        </div>
    </div>`;
    $('body').append(menuHtml);
    
    // Prevent off-screen
    const $menu = $('.healer-popover');
    if (x + $menu.width() > $(window).width()) $menu.css('left', $(window).width() - $menu.width() - 10 + 'px');

    $('#wand-quick-fix').on('click', async () => {
        $('.healer-popover').remove();
        const newText = smartLineFix(msg.mes);
        if (newText !== msg.mes) {
            msg.mes = newText;
            await context.saveChat(); await context.reloadCurrentChat();
            toastr.success("HTML Fixed!");
        } else toastr.success("No changes needed.");
    });
    $('#wand-open-editor').on('click', () => { $('.healer-popover').remove(); openEditorModal(mesId); });
    
    setTimeout(() => {
        $(document).on('click.healerMenu', function(e) {
            if (!$(e.target).closest('.healer-popover').length) { $('.healer-popover').remove(); $(document).off('click.healerMenu'); }
        });
    }, 100);
}

function openEditorModal(mesId) {
    const context = SillyTavern.getContext();
    const msg = context.chat[mesId];
    if (!msg) return;
    
    let thinkContent = "", storyContent = msg.mes;
    const thinkMatch = msg.mes.match(/<think>([\s\S]*?)<\/think>/i);
    if (thinkMatch) { thinkContent = thinkMatch[1].trim(); storyContent = msg.mes.replace(thinkMatch[0], "").trim(); }

    const modalHtml = `
    <div id="healer-editor-modal" class="html-healer-overlay">
        <div class="html-healer-box">
            <div class="healer-header"><div><i class="fa-solid fa-pen-to-square"></i> <b>Edit Message #${mesId}</b></div><div style="cursor:pointer;" onclick="$('#healer-editor-modal').remove()"><i class="fa-solid fa-xmark"></i></div></div>
            <div class="healer-body">
                <div class="editor-row" style="flex: 0 0 30%;">
                    <div class="toolbar"><span>Thinking</span><span style="font-size:0.8em; cursor:pointer;" onclick="$('#editor-think').val('')">Clear</span></div>
                    <textarea id="editor-think" class="healer-input">${thinkContent}</textarea>
                </div>
                <div class="editor-row" style="flex: 1;">
                    <div class="toolbar"><span>Story</span><span style="cursor:pointer; color:var(--healer-accent);" id="btn-editor-fix"><i class="fa-solid fa-wand-magic-sparkles"></i> Auto-Fix</span></div>
                    <textarea id="editor-story" class="healer-input">${storyContent}</textarea>
                </div>
            </div>
            <div class="healer-footer"><button class="btn-save" id="btn-editor-save">Save Changes</button></div>
        </div>
    </div>`;
    $('body').append(modalHtml);

    $('#btn-editor-fix').on('click', () => { $('#editor-story').val(smartLineFix($('#editor-story').val())); toastr.success("Fixed!"); });
    $('#btn-editor-save').on('click', async () => {
        const t = $('#editor-think').val().trim(), s = $('#editor-story').val();
        msg.mes = t ? `<think>\n${t}\n</think>\n${s}` : s;
        await context.saveChat(); await context.reloadCurrentChat();
        $('#healer-editor-modal').remove(); toastr.success("Saved!");
    });
}

// --- 5. Settings Menu Builder ---
function loadSettings() {
    if ($('.html-healer-settings').length > 0) return;
    loadSettingsData();
    
    $('#extensions_settings').append(`
        <div class="html-healer-settings">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header"><b>HTML Healer</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
                <div class="inline-drawer-content">
                    <div class="styled_description_block">Editor by ${extensionAuthor}. Use the Magic Wand on messages to fix HTML.</div>
                    <div style="margin: 10px 0;">
                        <label style="font-weight:bold; font-size:0.9em;">Custom Tags:</label>
                        <textarea id="setting_custom_tags" rows="2" style="width:100%; margin-top:5px;" class="text_pole" placeholder="e.g. scrollborad.zeal"></textarea>
                    </div>
                    <div style="margin: 10px 0;">
                        <label style="font-weight:bold; font-size:0.9em;">AI Provider:</label>
                        <select id="setting_ai_provider" class="text_pole" style="width:100%; margin-top:5px;">
                            <option value="main">SillyTavern Main API</option>
                            <option value="gemini">Direct Gemini API</option>
                        </select>
                        <div class="gemini-settings" style="display:none; margin-top:10px; padding-left:10px; border-left:2px solid #4caf50;">
                            <label>Gemini Key:</label><input type="password" id="setting_gemini_key" class="text_pole" style="width:100%;">
                            <label>Model:</label><select id="setting_gemini_model" class="text_pole" style="width:100%;"><option value="gemini-2.5-flash">Flash</option><option value="gemini-1.5-pro">Pro</option></select>
                        </div>
                    </div>
                    <div style="display:flex; gap:5px; margin-top:10px;">
                        <button id="btn_save_all" class="menu_button" style="flex:1;"><i class="fa-solid fa-floppy-disk"></i> Save</button>
                    </div>
                </div>
            </div>
        </div>
    `);
    
    $('#setting_ai_provider').on('change', updateSettingsUI);
    $('#btn_save_all').on('click', saveAllSettings);
}

// --- INIT ---
jQuery(async () => {
    loadSettings(); // Settings Menu
    setTimeout(initMessageObserver, 1000); // Magic Wand
    console.log(`[${extensionName}] Ready.`);
});
