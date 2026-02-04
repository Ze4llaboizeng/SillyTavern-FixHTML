const extensionName = "html-healer";
const authorConfig = {
    name: "Zealllll",
    // หมายเหตุ: Path นี้ต้องตรงกับชื่อโฟลเดอร์จริง ถ้าเปลี่ยนชื่อโฟลเดอร์ต้องมาแก้ตรงนี้
    avatarUrl: "scripts/extensions/third-party/SillyTavern-FixHTML/avatar.png"
};

let logic = null;
let ui = null;

// State
let initialSegments = [];
let currentSegments = [];
let targetMessageId = null;

jQuery(async () => {
    try {
        const { HtmlHealerLogic } = await import('./logic.js');
        const { HtmlHealerUI } = await import('./ui.js');
        
        logic = new HtmlHealerLogic();
        ui = new HtmlHealerUI(authorConfig);
        
        initSettings();
        console.log(`[${extensionName}] Modules loaded. Ready.`);
    } catch (e) {
        console.error(`[${extensionName}] Failed to load modules:`, e);
        toastr.error("HTML Healer failed to load modules.");
    }
});

function getContext() { return SillyTavern.getContext(); }

// --- Button Actions ---

async function performSmartQuickFix() {
    const context = getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return toastr.warning("No messages.");
    
    const lastIndex = chat.length - 1;
    const originalText = chat[lastIndex].mes;

    const { isThinkBroken } = logic.parseSegments(originalText);
    if (isThinkBroken) {
        toastr.warning("Think is broken! Please click where the Story starts.", "Fix Required");
        openBlockEditor();
        return;
    }

    const fixedText = logic.fixHtml(originalText);

    if (fixedText !== originalText) {
        chat[lastIndex].mes = fixedText;
        await context.saveChat();
        await context.reloadCurrentChat();
        toastr.success("Fixed HTML structure!");
    } else {
        toastr.success("HTML looks perfect!");
    }
}

async function performCodeBlockFix() {
    const context = getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return toastr.warning("No messages.");

    const lastIndex = chat.length - 1;
    const originalText = chat[lastIndex].mes;

    const fixedText = logic.fixUnclosedDivsInCodeBlock(originalText);

    if (fixedText !== originalText) {
        chat[lastIndex].mes = fixedText;
        await context.saveChat();
        await context.reloadCurrentChat();
        toastr.success("Completed code blocks!");
    } else {
        toastr.info("No broken code blocks found.");
    }
}

function openBlockEditor() {
    const context = getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return toastr.warning("No messages.");
    targetMessageId = chat.length - 1;
    const originalText = chat[targetMessageId].mes;
    const result = logic.parseSegments(originalText);
    initialSegments = result.segments;
    currentSegments = JSON.parse(JSON.stringify(initialSegments));
    ui.renderEditorModal(currentSegments, {
        onSave: handleSaveSplit,
        onReset: () => { currentSegments = JSON.parse(JSON.stringify(initialSegments)); refreshEditorState(); },
        onSegmentClick: (clickedId) => {
            currentSegments.forEach(seg => { if (seg.id < clickedId) seg.type = 'think'; else seg.type = 'story'; });
            refreshEditorState();
        },
        onInput: () => { const cot = $('#editor-cot').val(); const main = $('#editor-main').val(); ui.updateWordCounts(logic.countWords(cot), logic.countWords(main)); }
    });
    refreshEditorState();
}

function refreshEditorState() {
    const thinkText = currentSegments.filter(s => s.type === 'think').map(s => s.text).join('\n');
    const storyText = currentSegments.filter(s => s.type === 'story').map(s => s.text).join('\n');
    ui.renderSegmentsList(currentSegments);
    ui.setEditorValues(thinkText, storyText);
    ui.updateWordCounts(logic.countWords(thinkText), logic.countWords(storyText));
}

async function handleSaveSplit() {
    let cot = $('#editor-cot').val().trim();
    let main = $('#editor-main').val().trim();
    let parts = [];
    if (cot) {
        if (!/^<think>/i.test(cot)) cot = `<think>\n${cot}`;
        if (!/<\/think>$/i.test(cot)) cot = `${cot}\n</think>`;
        parts.push(cot);
    }
    if (main) parts.push(main);
    const finalMes = parts.join('\n\n');
    const context = getContext();
    if (context.chat[targetMessageId].mes !== finalMes) {
        context.chat[targetMessageId].mes = finalMes;
        await context.saveChat();
        await context.reloadCurrentChat();
        toastr.success("Saved!");
    }
    ui.closeModal();
}

function openHighlightFixer() {
    const context = getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return toastr.warning("No messages.");
    targetMessageId = chat.length - 1;
    const originalText = chat[targetMessageId].mes;
    ui.renderHighlightModal(originalText, {
        onFixSelection: () => {
            const textarea = document.getElementById('editor-targeted');
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            if (start === end) return toastr.warning("Please highlight code first!");
            const fullText = textarea.value;
            const selectedText = fullText.substring(start, end);
            const fixedSegment = logic.fixHtml(selectedText);
            if (fixedSegment === selectedText) { toastr.info("Selection looks valid."); return; }
            const newText = fullText.substring(0, start) + fixedSegment + fullText.substring(end);
            $(textarea).val(newText).trigger('input'); 
            textarea.setSelectionRange(start, start + fixedSegment.length);
            textarea.focus();
            toastr.success("Fixed selection!");
        },
        onSave: async () => {
            const newMes = $('#editor-targeted').val();
            context.chat[targetMessageId].mes = newMes;
            await context.saveChat();
            await context.reloadCurrentChat();
            ui.closeModal();
        }
    });
}

function initSettings() {
    if ($('.html-healer-settings').length > 0) return;
    
    $('#extensions_settings').append(`
        <div class="html-healer-settings">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header"><b>HTML Healer</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
                <div class="inline-drawer-content">
                    <div class="styled_description_block">Editor by ${authorConfig.name}</div>
                    
                    <div style="display:flex; gap:5px; margin-top:5px;">
                        <div id="html-healer-quick-fix" class="menu_button" style="flex:1; background-color: var(--smart-theme-color, #4caf50);" title="Fix General HTML Tags">
                            <i class="fa-solid fa-wand-magic-sparkles"></i> Auto
                        </div>
                        <div id="html-healer-block-fix" class="menu_button" style="flex:1; background-color: #2196f3;" title="Inject </html> into Code Blocks">
                            <i class="fa-solid fa-code"></i> Complete Block
                        </div>
                    </div>
                    
                    <div style="display:flex; gap:5px; margin-top:5px;">
                        <div id="html-healer-open-editor" class="menu_button" style="flex:1;">
                            <i class="fa-solid fa-layer-group"></i> Editor
                        </div>
                        <div id="html-healer-open-split" class="menu_button" style="flex:1;">
                            <i class="fa-solid fa-highlighter"></i> Split
                        </div>
                    </div>

                </div>
            </div>
        </div>
    `);
    
    $('#html-healer-quick-fix').on('click', performSmartQuickFix);
    $('#html-healer-block-fix').on('click', performCodeBlockFix);
    $('#html-healer-open-editor').on('click', openBlockEditor);
    $('#html-healer-open-split').on('click', openHighlightFixer);
}
