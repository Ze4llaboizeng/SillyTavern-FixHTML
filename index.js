const extensionName = "html-healer";
const authorConfig = {
    name: "Zealllll",
    avatarUrl: "scripts/extensions/third-party/SillyTavern-FixHTML-release/avatar.png"
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
        console.log(`[${extensionName}] Modules loaded. Ready for manual triggers.`);
    } catch (e) {
        console.error(`[${extensionName}] Failed to load modules:`, e);
        toastr.error("HTML Healer failed to load modules.");
    }
});

function getContext() { return SillyTavern.getContext(); }

/**
 * Main Feature: Auto Fix (Combined)
 * กดทีเดียว แก้ทุกอย่าง:
 * 1. เช็ค <think>
 * 2. แก้ Code Block (Regex) -> แทรก </html>
 * 3. แก้ General HTML (Stack) -> ปิด tag ทั่วไป
 */
async function performSmartQuickFix() {
    const context = getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return toastr.warning("No messages.");
    
    const lastIndex = chat.length - 1;
    let originalText = chat[lastIndex].mes;
    let currentText = originalText;

    // 1. Safety Check for Think
    const { isThinkBroken } = logic.parseSegments(currentText);
    if (isThinkBroken) {
        toastr.warning("Think is broken! Please click where the Story starts.", "Fix Required");
        openBlockEditor();
        return;
    }

    // 2. Fix Code Blocks (Regex) - สแกนหา ``` และแก้
    // ทำอันนี้ก่อน เพราะถ้า Regex แทรก </html> ลงไปแล้ว Stack Logic จะได้เห็นว่า tag ปิดครบ
    let afterRegexFix = logic.fixUnclosedDivsInCodeBlock(currentText);

    // 3. Fix General HTML (Stack) - แก้ tag ที่ลืมปิดทั่วไป
    let finalFixedText = logic.fixHtml(afterRegexFix);

    // 4. Save if changed
    if (finalFixedText !== originalText) {
        chat[lastIndex].mes = finalFixedText;
        await context.saveChat();
        await context.reloadCurrentChat();
        
        // เช็คว่าแก้อะไรไปบ้างเพื่อแจ้งเตือนให้ตรงจุด
        if (afterRegexFix !== originalText) {
             toastr.success("Fixed broken Code Block & HTML!");
        } else {
             toastr.success("Fixed HTML structure!");
        }
    } else {
        toastr.success("HTML and Code Blocks look perfect!");
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
                    <div class="styled_description_block">Refactored Modular Version</div>
                    <div style="display:flex; gap:5px; margin-top:5px;">
                        <div id="html-healer-quick-fix" class="menu_button" style="flex:1; background-color: var(--smart-theme-color, #4caf50);"><i class="fa-solid fa-wand-magic-sparkles"></i> Auto</div>
                        <div id="html-healer-open-editor" class="menu_button" style="flex:1;"><i class="fa-solid fa-layer-group"></i> Editor</div>
                        <div id="html-healer-open-split" class="menu_button" style="flex:1;"><i class="fa-solid fa-highlighter"></i> Split</div>
                    </div>
                </div>
            </div>
        </div>
    `);
    $('#html-healer-quick-fix').on('click', performSmartQuickFix);
    $('#html-healer-open-editor').on('click', openBlockEditor);
    $('#html-healer-open-split').on('click', openHighlightFixer);
}
