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
// Store candidates to fix
let currentCandidates = [];

jQuery(async () => {
    try {
        const { HtmlHealerLogic } = await import('./logic.js');
        const { HtmlHealerUI } = await import('./ui.js');
        
        logic = new HtmlHealerLogic();
        ui = new HtmlHealerUI(authorConfig);
        
        initSettings();
        console.log(`[${extensionName}] Modules loaded. UI Refreshed.`);
    } catch (e) {
        console.error(`[${extensionName}] Failed:`, e);
        toastr.error("HTML Healer failed to load.");
    }
});

function getContext() { return SillyTavern.getContext(); }

// --- Button Actions (Refactored to Scanner) ---

/**
 * 1. Auto Fix HTML (Scanner Mode)
 * สแกนทั้งแชทหา HTML Tags ที่พัง
 */
async function performSmartQuickFix() {
    const context = getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return toastr.warning("No messages.");

    // 1. สแกนหาข้อความที่มีปัญหา
    const candidates = logic.scanForIssues(chat, 'html');
    currentCandidates = candidates; // เก็บไว้ใช้ตอนกด Apply

    if (candidates.length === 0) {
        return toastr.success("All messages look good! No HTML issues found.");
    }

    // 2. ถ้าเจอ ให้เปิด Checklist Modal
    ui.renderChecklistModal("Auto Fix HTML", candidates, async (selectedIndices) => {
        if (selectedIndices.length === 0) return;

        let fixCount = 0;
        // วนลูปแก้เฉพาะ Index ที่เลือก
        selectedIndices.forEach(idx => {
            const candidate = currentCandidates.find(c => c.index === idx);
            if (candidate) {
                chat[idx].mes = candidate.fixed;
                fixCount++;
            }
        });

        if (fixCount > 0) {
            await context.saveChat();
            await context.reloadCurrentChat();
            toastr.success(`Fixed ${fixCount} messages!`);
        }
        ui.closeModal();
    });
}

/**
 * 2. Complete Code Block (Scanner Mode)
 * สแกนหา Code Block ที่ไม่มี </html>
 */
async function performCodeBlockFix() {
    const context = getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return toastr.warning("No messages.");

    // 1. สแกน
    const candidates = logic.scanForIssues(chat, 'codeblock');
    currentCandidates = candidates;

    if (candidates.length === 0) {
        return toastr.info("No broken code blocks found in history.");
    }

    // 2. เปิด Modal
    ui.renderChecklistModal("Complete Code Blocks", candidates, async (selectedIndices) => {
        if (selectedIndices.length === 0) return;

        let fixCount = 0;
        selectedIndices.forEach(idx => {
            const candidate = currentCandidates.find(c => c.index === idx);
            if (candidate) {
                chat[idx].mes = candidate.fixed;
                fixCount++;
            }
        });

        if (fixCount > 0) {
            await context.saveChat();
            await context.reloadCurrentChat();
            toastr.success(`Completed blocks in ${fixCount} messages!`);
        }
        ui.closeModal();
    });
}

// --- Editor Functions (Keep Existing) ---
function openBlockEditor() {
    const context = getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return toastr.warning("No messages.");
    targetMessageId = chat.length - 1;
    const originalText = chat[targetMessageId].mes;
    
    // Check think first
    const { segments, isThinkBroken } = logic.parseSegments(originalText);
    
    initialSegments = segments;
    currentSegments = JSON.parse(JSON.stringify(initialSegments));
    
    ui.renderEditorModal(currentSegments, {
        onSave: handleSaveSplit,
        onReset: () => { currentSegments = JSON.parse(JSON.stringify(initialSegments)); refreshEditorState(); },
        onSegmentClick: (clickedId) => {
            currentSegments.forEach(seg => { if (seg.id < clickedId) seg.type = 'think'; else seg.type = 'story'; });
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
            if (start === end) return toastr.warning("Highlight text first!");
            const fullText = textarea.value;
            const selectedText = fullText.substring(start, end);
            const fixedSegment = logic.fixHtml(selectedText);
            if (fixedSegment === selectedText) { toastr.info("No fix needed."); return; }
            const newText = fullText.substring(0, start) + fixedSegment + fullText.substring(end);
            $(textarea).val(newText).trigger('input'); 
            textarea.setSelectionRange(start, start + fixedSegment.length);
            textarea.focus();
            toastr.success("Fixed!");
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
                        <div id="html-healer-quick-fix" class="menu_button" style="flex:1; background-color: var(--smart-theme-color, #4caf50);" title="Scan & Fix HTML Tags">
                            <i class="fa-solid fa-wand-magic-sparkles"></i> Auto Scan
                        </div>
                        <div id="html-healer-block-fix" class="menu_button" style="flex:1; background-color: #2196f3;" title="Scan & Complete Code Blocks">
                            <i class="fa-solid fa-code"></i> Block Scan
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
