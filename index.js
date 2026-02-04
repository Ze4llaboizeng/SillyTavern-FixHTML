const extensionName = "html-healer";
const authorConfig = {
    name: "Zealllll",
    avatarUrl: "scripts/extensions/third-party/SillyTavern-FixHTML/avatar.png"
};

let logic = null;
let ui = null;
let chatObserver = null;

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
        initChatObserver(); // เริ่มระบบส่องแชท
        console.log(`[${extensionName}] Modules loaded & Observer started.`);
    } catch (e) {
        console.error(`[${extensionName}] Failed to load modules:`, e);
        toastr.error("HTML Healer failed to load modules.");
    }
});

function getContext() { return SillyTavern.getContext(); }

/**
 * ระบบส่องแชท (Observer):
 * ทำหน้าที่แค่ "แปะปุ่ม" ถ้าเจอ Code Block ที่เข้าข่าย
 * ยังไม่มีการแก้ไขข้อความใดๆ ทั้งสิ้น จนกว่า user จะกด
 */
function initChatObserver() {
    const chatContainer = document.querySelector('#chat');
    if (!chatContainer) return;

    chatObserver = new MutationObserver((mutations) => {
        let shouldScan = false;
        mutations.forEach(mutation => {
            if (mutation.addedNodes.length > 0) shouldScan = true;
        });
        if (shouldScan) scanAndInjectButtons();
    });

    chatObserver.observe(chatContainer, { childList: true, subtree: true });
    
    // Scan ครั้งแรก
    setTimeout(scanAndInjectButtons, 1000);
}

function scanAndInjectButtons() {
    // วนหา Code block HTML ทั้งหมดในหน้าจอ
    $('#chat .mes_text pre code').each(function() {
        const codeBlock = $(this);
        const preElement = codeBlock.parent();
        
        // 1. ถ้ามีปุ่มอยู่แล้ว ไม่ต้องทำอะไร
        if (preElement.find('.html-healer-float-btn').length > 0) return;

        // 2. เช็คเนื้อหาหน้าจอคร่าวๆ ว่าน่าจะเป็น HTML Block ที่พังไหม
        // (เริ่มด้วย <div และไม่มี </html>)
        const textContent = codeBlock.text().trim();
        if (textContent.startsWith('<div') && !textContent.includes('</html>')) {
            
            // 3. สร้างปุ่ม (ยังไม่แก้)
            const btn = ui.createFloatingFixButton(async () => {
                // --- ส่วนนี้คือ Flow การแก้ไขจริง เมื่อกดปุ่ม ---
                
                // หา ID ของข้อความนั้น
                const messageDiv = preElement.closest('.mes');
                const mesIdStr = messageDiv.attr('mesid');
                
                if (mesIdStr !== undefined) {
                    await handleInlineFixWithRegex(Number(mesIdStr));
                } else {
                    toastr.error("Could not find Message ID");
                }
            });

            // แปะปุ่มลงไป
            if (preElement.css('position') === 'static') preElement.css('position', 'relative');
            preElement.append(btn);
        }
    });
}

/**
 * Flow การแก้ไขจริง (เหมือน Auto Fix):
 * 1. ดึงข้อความดิบ
 * 2. รัน Regex แทรก </html>
 * 3. บันทึกและรีโหลด
 */
async function handleInlineFixWithRegex(mesId) {
    const context = getContext();
    const chat = context.chat;
    
    if (!chat[mesId]) return;

    const originalText = chat[mesId].mes;

    // เช็คด้วย Logic Regex (จาก logic.js)
    if (logic.hasBrokenCodeBlock(originalText)) {
        
        // ทำการแก้ String
        const fixedText = logic.fixUnclosedDivsInCodeBlock(originalText);
        
        if (fixedText !== originalText) {
            // อัพเดทเข้า DB
            chat[mesId].mes = fixedText;
            await context.saveChat();
            
            // รีโหลดหน้าจอ (ปุ่มจะหายไปเอง เพราะ HTML ถูกแก้แล้ว)
            await context.reloadCurrentChat(); 
            
            toastr.success("Injected </html> & Saved!");
        } else {
            toastr.info("Regex found no changes needed.");
        }
    } else {
        toastr.warning("Could not find matching pattern in raw text.");
    }
}

// ... (ฟังก์ชันเดิม performSmartQuickFix, openBlockEditor ฯลฯ ยังอยู่เหมือนเดิม) ...
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
