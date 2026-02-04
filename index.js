const extensionName = "html-healer";
const authorConfig = {
    name: "Zealllll",
    avatarUrl: "scripts/extensions/third-party/SillyTavern-FixHTML/avatar.png"
};

let logic = null;
let ui = null;

// State
let initialSegments = [];
let currentSegments = [];
let targetMessageId = null;

// --- Initialization ---
jQuery(async () => {
    // Dynamic Import เพื่อโหลดไฟล์อื่น ๆ
    try {
        // หมายเหตุ: Path อาจจะต้องปรับตามโครงสร้างโฟลเดอร์จริงใน SillyTavern
        // ใช้ ./ เพื่ออ้างอิง relative path จากไฟล์ index.js นี้
        const { HtmlHealerLogic } = await import('./logic.js');
        const { HtmlHealerUI } = await import('./ui.js');
        
        logic = new HtmlHealerLogic();
        ui = new HtmlHealerUI(authorConfig);
        
        initSettings();
        console.log(`[${extensionName}] Modules loaded & Ready.`);
    } catch (e) {
        console.error(`[${extensionName}] Failed to load modules:`, e);
        toastr.error("HTML Healer failed to load modules. Check console.");
    }
});

function getContext() {
    return SillyTavern.getContext();
}

// --- Controller Actions ---

/**
 * 1. Smart Fix Action (Auto)
 */
async function performSmartQuickFix() {
    const context = getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return toastr.warning("No messages.");

    const lastIndex = chat.length - 1;
    const originalText = chat[lastIndex].mes;
    
    // ใช้ Logic เช็ค
    const { isThinkBroken } = logic.parseSegments(originalText);
    
    if (isThinkBroken) {
        toastr.warning("Think is broken! Please click where the Story starts.", "Fix Required");
        openBlockEditor(); // ส่งต่อไปเปิด Editor
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

/**
 * 2. Editor Action (Block Editor)
 */
function openBlockEditor() {
    const context = getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return toastr.warning("No messages.");

    targetMessageId = chat.length - 1;
    const originalText = chat[targetMessageId].mes;
    
    // 1. เรียก Logic ให้ Parse ข้อมูล
    const result = logic.parseSegments(originalText);
    initialSegments = result.segments;
    currentSegments = JSON.parse(JSON.stringify(initialSegments)); // Deep copy

    // 2. เรียก UI ให้ Render Modal พร้อมส่ง Callbacks กลับมาหา Controller
    ui.renderEditorModal(currentSegments, {
        onSave: handleSaveSplit,
        onReset: () => {
            currentSegments = JSON.parse(JSON.stringify(initialSegments));
            refreshEditorState();
        },
        onSegmentClick: (clickedId) => {
            // Logic การเปลี่ยน type ของ segment
            currentSegments.forEach(seg => {
                if (seg.id < clickedId) seg.type = 'think';
                else seg.type = 'story'; 
            });
            refreshEditorState();
        },
        onInput: () => {
             const cot = $('#editor-cot').val();
             const main = $('#editor-main').val();
             ui.updateWordCounts(logic.countWords(cot), logic.countWords(main));
        }
    });

    refreshEditorState();
}

// Helper: อัพเดทข้อมูลใน Editor (UI) ตาม State ปัจจุบัน
function refreshEditorState() {
    // แยก Text ตาม Type
    const thinkText = currentSegments.filter(s => s.type === 'think').map(s => s.text).join('\n');
    const storyText = currentSegments.filter(s => s.type === 'story').map(s => s.text).join('\n');
    
    // อัพเดท UI List
    ui.renderSegmentsList(currentSegments);
    // อัพเดท UI Textareas
    ui.setEditorValues(thinkText, storyText);
    // อัพเดท UI Counts
    ui.updateWordCounts(logic.countWords(thinkText), logic.countWords(storyText));
}

async function handleSaveSplit() {
    let cot = $('#editor-cot').val().trim();
    let main = $('#editor-main').val().trim();
    
    let parts = [];
    if (cot) {
        // ห่อ Think ให้อัตโนมัติ (Business Logic)
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

/**
 * 3. Highlight Fixer Action
 */
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
            
            // เรียก Logic ซ่อมเฉพาะส่วน
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
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>HTML Healer</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <div class="styled_description_block">Refactored Modular Version</div>
                    <div style="display:flex; gap:5px; margin-top:5px;">
                        <div id="html-healer-quick-fix" class="menu_button" style="flex:1; background-color: var(--smart-theme-color, #4caf50);">
                            <i class="fa-solid fa-wand-magic-sparkles"></i> Auto
                        </div>
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
    $('#html-healer-open-editor').on('click', openBlockEditor);
    $('#html-healer-open-split').on('click', openHighlightFixer);
}
