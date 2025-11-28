
const extensionName = "html-healer";

// --- 1. Logic (Analysis & Fix) ---

let initialSegments = []; 
let currentSegments = []; 

// แยกส่วนประกอบ: Thinking / UI / Story
function parseSegments(rawText) {
    if (!rawText) return [];
    let cleanText = rawText
        .replace(/&lt;think&gt;/gi, "<think>")
        .replace(/&lt;\/think&gt;/gi, "</think>");

    const rawBlocks = cleanText.split(/\n/);
    
    // ตรวจสอบความสมบูรณ์ของ Think
    const hasOpenThink = /<think>/i.test(cleanText);
    const hasCloseThink = /<\/think>/i.test(cleanText);
    const isThinkBroken = hasOpenThink && !hasCloseThink;

    let state = 'story'; 
    let segments = [];
    
    // Regex จับ UI (จะถูกข้ามถ้า Think พัง)
    const uiStartRegex = /^<(div|table|style|aside|section|main|header|footer|nav|article|details|summary|code|pre)/i;
    
    rawBlocks.forEach((line, index) => {
        let text = line.trim();
        if (text === "") {
            segments.push({ id: index, text: line, type: state });
            return;
        }

        if (state === 'story') {
            if (/<think>/i.test(text)) {
                state = 'think';
            } else if (!isThinkBroken && uiStartRegex.test(text)) {
                state = 'ui';
            }
        } else if (state === 'think') {
            if (/<\/think>/i.test(text)) {
                state = 'story'; 
            }
        } else if (state === 'ui') {
            if (/<think>/i.test(text)) {
                 state = 'think';
            }
        }

        if (state === 'think' && /<\/think>/i.test(text)) {
             segments.push({ id: index, text: line, type: 'think' });
             state = 'story';
             return;
        }
        
        segments.push({ id: index, text: line, type: state });
    });

    return { segments, isThinkBroken };
}

// --- [NEW LOGIC] Advanced HTML Fixer ---
// รองรับ Custom Tags และเช็ค Nesting (Parent-Child)
function advancedHtmlFix(text) {
    if (!text) return "";

    // 1. Regex จับ Tag ทั้งหมด (Custom Tag อะไรก็ได้ที่ขึ้นต้นด้วยตัวอักษร)
    // capture groups: 1=slash(if close), 2=tagName, 3=attributes, 4=self-closing slash
    const tagRegex = /<(\/?)([a-zA-Z0-9\-\_]+)([^>]*?)(\/?)>/g;
    
    // Void Tags ที่ไม่ต้องมีตัวปิด (มาตรฐาน HTML5)
    const voidTags = new Set([
        "area", "base", "br", "col", "embed", "hr", "img", "input", 
        "link", "meta", "param", "source", "track", "wbr"
    ]);

    let stack = [];
    let result = "";
    let lastIndex = 0;
    let match;

    while ((match = tagRegex.exec(text)) !== null) {
        const fullTag = match[0];
        const isClose = match[1] === "/";
        const tagName = match[2].toLowerCase(); // บังคับตัวเล็กเพื่อนับ stack ง่ายๆ
        const isSelfClosing = match[4] === "/";
        const offset = match.index;

        // เติมข้อความก่อนหน้า Tag นี้เข้าผลลัพธ์
        result += text.substring(lastIndex, offset);
        lastIndex = tagRegex.lastIndex;

        // กรณี Void Tag หรือ Self-Closing (<br>, <img ... />, <custom />) -> ใส่เลย ไม่ต้องลง Stack
        if (voidTags.has(tagName) || isSelfClosing) {
            result += fullTag;
            continue;
        }

        if (!isClose) {
            // --- OPEN TAG ---
            // ใส่ลง Stack รอตัวปิด
            stack.push(tagName);
            result += fullTag;
        } else {
            // --- CLOSE TAG ---
            // เช็คว่าตรงกับตัวบนสุดของ Stack ไหม?
            if (stack.length > 0) {
                const top = stack[stack.length - 1];
                
                if (top === tagName) {
                    // ตรงกัน -> คู่สมบูรณ์ -> Pop ออก
                    stack.pop();
                    result += fullTag;
                } else {
                    // ไม่ตรงกัน! (Nesting Error หรือ Missing Close)
                    // ตรวจสอบว่ามี Tag นี้อยู่ลึกกว่านี้ไหม?
                    const foundIndex = stack.lastIndexOf(tagName);
                    
                    if (foundIndex !== -1) {
                        // เจอ! แสดงว่าตัวลูกๆ ก่อนหน้านี้ลืมปิด
                        // วิธีแก้: ปิดตัวลูกๆ ให้หมดก่อน จนถึงตัวนี้
                        // เช่น stack=[div, span], เจอ </div> -> ต้องปิด span ก่อน
                        
                        while (stack.length > foundIndex + 1) {
                            const unclosed = stack.pop();
                            result += `</${unclosed}>`; // Auto-close child
                        }
                        
                        // พอปิดลูกหมดแล้ว ก็ปิดตัวแม่ (ตัวปัจจุบัน)
                        stack.pop();
                        result += fullTag;
                    } else {
                        // ไม่เจอใน Stack เลย (Orphan Close Tag) -> ส่วนเกิน
                        // วิธีแก้: ไม่เติม Tag ปิดนี้ลงไป (ลบทิ้ง) หรือปล่อยผ่าน text ธรรมดา
                        // ในที่นี้เลือก "ลบทิ้ง" เพื่อความสะอาดของ HTML
                        // result += ""; 
                    }
                }
            } else {
                // Stack ว่างเปล่า แต่เจอ Tag ปิด -> ส่วนเกิน
                // result += "";
            }
        }
    }

    // เติมข้อความส่วนที่เหลือหลัง Tag สุดท้าย
    result += text.substring(lastIndex);

    // ปิด Stack ที่เหลือให้หมด (Unclosed Tags at the end)
    while (stack.length > 0) {
        const unclosed = stack.pop();
        result += `</${unclosed}>`;
    }

    return result;
}

function countWords(str) {
    if (!str) return 0;
    return str.trim().split(/\s+/).length;
}

// --- 2. Logic: Smart Action ---

async function performSmartQuickFix() {
    const context = SillyTavern.getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return toastr.warning("No messages to fix.");

    const lastIndex = chat.length - 1;
    const originalText = chat[lastIndex].mes;

    const hasThinking = /<think|&lt;think/i.test(originalText);
    const hasUI = /<div|<table|<style/i.test(originalText);

    // ถ้ามี Think หรือ UI เยอะๆ ให้เตือน user ก่อน (แต่ถ้า user มั่นใจกดอีกทีก็แก้ได้)
    // หรือจะให้แก้เลย? ตาม Logic เดิมคือถ้าซับซ้อนให้เปิด Editor แต่ถ้าจะ Auto ก็จัด advancedHtmlFix เลย
    
    const fixedText = advancedHtmlFix(originalText);
    if (fixedText !== originalText) {
        chat[lastIndex].mes = fixedText;
        await context.saveChat();
        await context.reloadCurrentChat();
        toastr.success("HTML Fixed (Advanced Mode)!");
    } else {
        toastr.success("HTML looks perfect.");
    }
}

// --- 3. UI Builder ---
let targetMessageId = null;

const authorConfig = {
    name: "Zealllll",
    avatarUrl: "scripts/extensions/third-party/SillyTavern-FixHTML/avatar.png"
};

// >>> FEATURE: "Split" (Highlight & Fix) <<<
// ชื่อฟังก์ชันเปลี่ยนตามหน้าที่ แต่ UI จะเรียกว่า "Split" ตามที่คุณขอ
function openHighlightFixer() {
    const context = SillyTavern.getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return toastr.warning("No messages to fix.");
    targetMessageId = chat.length - 1;
    const originalText = chat[targetMessageId].mes;

    const modalHtml = `
    <div id="html-healer-modal" class="html-healer-overlay">
        <div class="html-healer-box">
            <div class="healer-header">
                <div class="header-brand">
                    <div class="header-icon"><i class="fa-solid fa-highlighter"></i></div>
                    <div class="header-text"><span class="title">Split (Highlight Fix)</span></div>
                </div>
                <div class="header-controls">
                     <div class="close-btn" onclick="$('#html-healer-modal').remove()"><i class="fa-solid fa-xmark"></i></div>
                </div>
            </div>
            <div class="healer-body">
                <div class="view-section active">
                    <div class="editor-group main-group">
                        <div class="group-toolbar">
                            <span class="label"><i class="fa-solid fa-i-cursor"></i> Highlight text to fix custom tags & nesting</span>
                            <div class="toolbar-actions">
                                <button class="action-btn" id="btn-heal-selection" style="background:var(--smart-theme-color, #4caf50); color:#fff; border:none;">
                                    <i class="fa-solid fa-wand-magic-sparkles"></i> Fix Selection
                                </button>
                            </div>
                        </div>
                        <textarea id="editor-targeted" placeholder="Message content..." style="font-family: monospace;">${originalText}</textarea>
                    </div>
                </div>
            </div>
            <div class="healer-footer">
                <button id="btn-save-targeted" class="save-button"><i class="fa-solid fa-floppy-disk"></i> Save Changes</button>
            </div>
        </div>
    </div>`;
    $(document.body).append(modalHtml);

    $('#btn-heal-selection').on('click', () => {
        const textarea = document.getElementById('editor-targeted');
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        if (start === end) return toastr.warning("Please highlight the HTML code first!");
        
        const fullText = textarea.value;
        const selectedText = fullText.substring(start, end);
        
        // ใช้ Logic ใหม่: Custom Tags + Nesting Check
        const fixedSegment = advancedHtmlFix(selectedText);
        
        if (fixedSegment === selectedText) {
            toastr.info("Selection looks valid."); return;
        }
        
        textarea.value = fullText.substring(0, start) + fixedSegment + fullText.substring(end);
        textarea.setSelectionRange(start, start + fixedSegment.length);
        textarea.focus();
        toastr.success("Fixed selected area!");
    });

    $('#btn-save-targeted').on('click', async () => {
        chat[targetMessageId].mes = $('#editor-targeted').val();
        await context.saveChat();
        await context.reloadCurrentChat();
        $('#html-healer-modal').remove();
    });
}

// >>> FEATURE: "Editor" (Block/Segment Editor) <<<
function openBlockEditor() {
    const context = SillyTavern.getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return toastr.warning("No messages to fix.");

    targetMessageId = chat.length - 1;
    const originalText = chat[targetMessageId].mes;
    
    // Parse
    const parseResult = parseSegments(originalText);
    initialSegments = parseResult.segments;
    const isThinkBroken = parseResult.isThinkBroken;

    currentSegments = JSON.parse(JSON.stringify(initialSegments));
    
    if (isThinkBroken) {
        toastr.error("Warning: Unclosed <think> detected!", "UI Detection Disabled");
    }

    const modalHtml = `
    <div id="html-healer-modal" class="html-healer-overlay">
        <div class="html-healer-box">
            
            <div class="healer-header">
                <div class="header-brand">
                    <div class="header-icon"><i class="fa-solid fa-layer-group"></i></div>
                    <div class="header-text"><span class="title">Editor (Blocks)</span></div>
                </div>
                <div class="header-controls">
                     <button class="reset-btn" id="btn-reset-split" title="Reset"><i class="fa-solid fa-rotate-left"></i></button>
                     <div class="close-btn" onclick="$('#html-healer-modal').remove()"><i class="fa-solid fa-xmark"></i></div>
                </div>
            </div>

            <div class="segment-picker-area">
                <div class="segment-scroller" id="segment-container"></div>
                <div class="picker-instruction">
                    ${isThinkBroken 
                        ? '<span style="color:#e06c75;"><i class="fa-solid fa-triangle-exclamation"></i> Fix <think> tag first.</span>' 
                        : '<i class="fa-solid fa-arrow-pointer"></i> Toggle: <b>Story -> Think -> UI</b>'
                    }
                </div>
            </div>
            
            <div class="healer-body">
                <div id="view-editor" class="view-section active">
                    <div class="editor-group think-group">
                        <div class="group-toolbar">
                            <span class="label"><i class="fa-solid fa-brain"></i> Thinking</span>
                            <span class="word-count" id="count-cot">0w</span>
                        </div>
                        <textarea id="editor-cot" placeholder="<think> content..."></textarea>
                    </div>

                    <div class="editor-group ui-group" style="border-color: #e06c75;">
                        <div class="group-toolbar" style="background: rgba(224, 108, 117, 0.1);">
                            <span class="label" style="color: #e06c75;"><i class="fa-solid fa-code"></i> UI / HTML</span>
                            <div class="toolbar-actions">
                                <button class="action-btn" id="btn-heal-ui"><i class="fa-solid fa-wand-magic-sparkles"></i> Fix UI</button>
                            </div>
                        </div>
                        <textarea id="editor-ui" placeholder="<div>...</div> content..." style="color:#ffccbc;"></textarea>
                    </div>

                    <div class="editor-group main-group">
                        <div class="group-toolbar">
                            <span class="label"><i class="fa-solid fa-comments"></i> Story</span>
                            <span class="word-count" id="count-main">0w</span>
                        </div>
                        <textarea id="editor-main" placeholder="Story content..."></textarea>
                    </div>
                </div>
            </div>

            <div class="healer-footer">
                <button id="btn-save-split" class="save-button">
                    <span class="btn-content"><i class="fa-solid fa-floppy-disk"></i> Merge & Save</span>
                </button>
            </div>
        </div>
    </div>
    `;

    $(document.body).append(modalHtml);
    renderSegments();

    $('#segment-container').on('click', '.segment-block', function() {
        if (isThinkBroken) {
             toastr.warning("Fix <think> tag first!");
             return; 
        }

        const id = $(this).data('id');
        const seg = currentSegments.find(s => s.id === id);
        if (seg.type === 'story') seg.type = 'think';
        else if (seg.type === 'think') seg.type = 'ui';
        else seg.type = 'story';
        
        renderSegments(); 
    });

    $('#btn-reset-split').on('click', () => {
        currentSegments = JSON.parse(JSON.stringify(initialSegments));
        renderSegments();
    });

    $('#btn-heal-ui').on('click', () => {
        let val = $('#editor-ui').val();
        // ใช้ Logic ใหม่ Advanced Fix
        let fixed = advancedHtmlFix(val);
        $('#editor-ui').val(fixed).trigger('input');
        toastr.success("Fixed UI HTML!");
    });

    $('#editor-cot, #editor-main, #editor-ui').on('input', updateCounts);

    $('#btn-save-split').on('click', async () => {
        let cot = $('#editor-cot').val().trim();
        let ui = $('#editor-ui').val().trim();
        let main = $('#editor-main').val().trim();
        
        let parts = [];
        if (cot) {
            if (!/^<think>/i.test(cot)) cot = `<think>\n${cot}`;
            if (!/<\/think>$/i.test(cot)) cot = `${cot}\n</think>`;
            parts.push(cot);
        }
        if (ui) parts.push(ui);
        if (main) parts.push(main);

        const finalMes = parts.join('\n\n');

        if (chat[targetMessageId].mes !== finalMes) {
            chat[targetMessageId].mes = finalMes;
            await context.saveChat();
            await context.reloadCurrentChat();
            toastr.success("Merged & Saved!");
        }
        $('#html-healer-modal').remove();
    });
}

function renderSegments() {
    const container = $('#segment-container');
    container.empty();
    
    currentSegments.forEach(seg => {
        let icon = '<i class="fa-solid fa-comment"></i>';
        let colorClass = 'type-story';
        if (seg.type === 'think') { icon = '<i class="fa-solid fa-brain"></i>'; colorClass = 'type-think'; }
        if (seg.type === 'ui') { icon = '<i class="fa-solid fa-code"></i>'; colorClass = 'type-ui'; } 
        
        let style = seg.type === 'ui' ? 'border-color: #e06c75; background: rgba(224, 108, 117, 0.1);' : '';

        container.append(`
            <div class="segment-block ${colorClass}" data-id="${seg.id}" style="${style}">
                <div class="seg-icon">${icon}</div>
                <div class="seg-text">${seg.text.substring(0, 50)}...</div>
                <div class="seg-badge">${seg.type.toUpperCase()}</div>
            </div>
        `);
    });

    const thinkText = currentSegments.filter(s => s.type === 'think').map(s => s.text).join('\n');
    const uiText = currentSegments.filter(s => s.type === 'ui').map(s => s.text).join('\n');
    const storyText = currentSegments.filter(s => s.type === 'story').map(s => s.text).join('\n');
    
    $('#editor-cot').val(thinkText);
    $('#editor-ui').val(uiText);
    $('#editor-main').val(storyText);
    
    if (!uiText) $('.ui-group').hide(); else $('.ui-group').show();
    if (!thinkText) $('.think-group').hide(); else $('.think-group').show();
    
    updateCounts();
}

const updateCounts = () => {
    $('#count-cot').text(countWords($('#editor-cot').val()) + "w");
    $('#count-main').text(countWords($('#editor-main').val()) + "w");
};

function loadSettings() {
    if ($('.html-healer-settings').length > 0) return;
    
    $('#extensions_settings').append(`
        <div class="html-healer-settings">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>HTML Healer</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <div class="styled_description_block">Editor by ${authorConfig.name}</div>
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
                    <small style="opacity:0.6; display:block; margin-top:5px; text-align:center;">
                        Auto: Smart Fix | Editor: Blocks | Split: Select & Fix
                    </small>
                </div>
            </div>
        </div>
    `);
    
    $('#html-healer-quick-fix').on('click', performSmartQuickFix);
    $('#html-healer-open-editor').on('click', openBlockEditor);   // Editor = Block View
    $('#html-healer-open-split').on('click', openHighlightFixer); // Split = Highlight View
}

jQuery(async () => {
    loadSettings();
    console.log(`[${extensionName}] Ready.`);
});
