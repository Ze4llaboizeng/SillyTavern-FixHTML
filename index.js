
const extensionName = "html-healer";

// --- 1. Logic (Analysis & Fix) ---

let initialSegments = []; 
let currentSegments = []; 

const authorConfig = {
    name: "Zealllll",
    avatarUrl: "scripts/extensions/third-party/SillyTavern-FixHTML/avatar.png"
};

// แยกส่วนประกอบ: Thinking / UI / Story
function parseSegments(rawText) {
    if (!rawText) return { segments: [], isThinkBroken: false };
    
    // แปลง escape characters กลับมาเป็น tag จริงก่อนประมวลผล
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
    
    // Regex จับ UI (เพิ่ม pre/code เข้ามาเผื่อเป็นโค้ด)
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

        // กรณีจบ Think ในบรรทัดเดียว
        if (state === 'think' && /<\/think>/i.test(text)) {
             segments.push({ id: index, text: line, type: 'think' });
             state = 'story';
             return;
        }
        
        segments.push({ id: index, text: line, type: state });
    });

    return { segments, isThinkBroken };
}

// --- [UPDATED] Advanced HTML Fixer ---
// รองรับ: name.subname, colon:tags, nesting check
function advancedHtmlFix(text) {
    if (!text) return "";

    // Regex ใหม่: รองรับ a-z, 0-9, -, _, . (จุด), : (โคลอน)
    // Group 1: Slash (ถ้าเป็น tag ปิด)
    // Group 2: Tag Name (เช่น char.emotion)
    // Group 3: Attributes
    // Group 4: Self-closing slash
    const tagRegex = /<(\/?)([a-zA-Z0-9\-\_\.\:]+)([^>]*?)(\/?)>/g;
    
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
        const tagName = match[2].toLowerCase(); 
        const isSelfClosing = match[4] === "/";
        const offset = match.index;

        result += text.substring(lastIndex, offset);
        lastIndex = tagRegex.lastIndex;

        if (voidTags.has(tagName) || isSelfClosing) {
            result += fullTag;
            continue;
        }

        if (!isClose) {
            // <open> -> Push Stack
            stack.push(tagName);
            result += fullTag;
        } else {
            // </close>
            if (stack.length > 0) {
                const top = stack[stack.length - 1];
                
                if (top === tagName) {
                    // Match! -> Pop
                    stack.pop();
                    result += fullTag;
                } else {
                    // Mismatch! (Nesting Error)
                    const foundIndex = stack.lastIndexOf(tagName);
                    
                    if (foundIndex !== -1) {
                        // เจอคู่อยู่ลึกกว่านี้ -> ปิดลูกๆ ให้หมดก่อน
                        while (stack.length > foundIndex + 1) {
                            const unclosed = stack.pop();
                            result += `</${unclosed}>`; 
                        }
                        stack.pop(); // ปิดตัวมันเอง
                        result += fullTag;
                    } else {
                        // ไม่เจอคู่เลย (Orphan Close Tag) -> ลบทิ้งเพื่อความปลอดภัย
                        // result += ""; 
                    }
                }
            }
        }
    }

    result += text.substring(lastIndex);

    // ปิดตกค้าง (Unclosed at end)
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

    // ตรวจสอบ Think ก่อน
    const hasOpenThink = /<think>/i.test(originalText);
    const hasCloseThink = /<\/think>/i.test(originalText);
    
    // เงื่อนไข: ถ้า Think พัง (มีเปิด ไม่มีปิด) -> บังคับเปิด Editor
    if (hasOpenThink && !hasCloseThink) {
        toastr.warning("Think tag is broken! Opening editor...", "Safety First");
        openBlockEditor(); 
        return;
    }

    // ถ้า Think ปกติ -> Auto Fix เลย
    const fixedText = advancedHtmlFix(originalText);
    if (fixedText !== originalText) {
        chat[lastIndex].mes = fixedText;
        await context.saveChat();
        await context.reloadCurrentChat();
        toastr.success("HTML & Tags Fixed!");
    } else {
        toastr.success("Everything looks perfect ✨");
    }
}

// --- 3. UI Builder (Cute & Safe) ---
let targetMessageId = null;

// Template สำหรับ Header ที่มี Author Pill (ใช้ซ้ำได้)
const getHeaderHtml = (title, icon) => `
    <div class="healer-header" style="background: linear-gradient(90deg, var(--lavender-dark, #2a2730) 0%, rgba(42,39,48,0.9) 100%);">
        <div class="header-brand">
            <div class="header-icon" style="color: #ffb7b2;">${icon}</div>
            <div class="header-text"><span class="title" style="color: #fff;">${title}</span></div>
        </div>
        <div class="header-controls">
            <div class="author-pill" style="border: 1px solid rgba(255,183,178,0.3); background: rgba(0,0,0,0.2);">
                <img src="${authorConfig.avatarUrl}" onerror="this.style.display='none'" style="border: 1px solid #ffb7b2;">
                <span class="author-name" style="color: #ffb7b2;">${authorConfig.name}</span>
            </div>
            
            <div class="close-btn" onclick="$('#html-healer-modal').remove()" style="margin-left:5px;">
                <i class="fa-solid fa-xmark"></i>
            </div>
        </div>
    </div>
`;

// >>> Feature: Split (Highlight & Fix) <<<
function openHighlightFixer() {
    const context = SillyTavern.getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return toastr.warning("No messages.");
    targetMessageId = chat.length - 1;
    const originalText = chat[targetMessageId].mes;

    const modalHtml = `
    <div id="html-healer-modal" class="html-healer-overlay">
        <div class="html-healer-box" style="border: 1px solid rgba(166,177,225,0.4); box-shadow: 0 0 20px rgba(166,177,225,0.15);">
            ${getHeaderHtml("Split (Highlight)", '<i class="fa-solid fa-highlighter"></i>')}
            
            <div class="healer-body">
                <div class="view-section active">
                    <div class="editor-group main-group">
                        <div class="group-toolbar">
                            <span class="label" style="color:#a6b1e1;"><i class="fa-solid fa-i-cursor"></i> Highlight broken part</span>
                            <div class="toolbar-actions">
                                <button class="action-btn" id="btn-heal-selection" style="background:#ffb7b2; color:#222; border:none; font-weight:bold;">
                                    <i class="fa-solid fa-wand-magic-sparkles"></i> Fix Selection
                                </button>
                            </div>
                        </div>
                        <textarea id="editor-targeted" placeholder="Message content..." style="font-family: monospace;">${originalText}</textarea>
                    </div>
                </div>
            </div>
            <div class="healer-footer">
                <button id="btn-save-targeted" class="save-button" style="background:#a6b1e1; color:#222;">
                    <i class="fa-solid fa-floppy-disk"></i> Save Changes
                </button>
            </div>
        </div>
    </div>`;
    $(document.body).append(modalHtml);

    $('#btn-heal-selection').on('click', () => {
        const textarea = document.getElementById('editor-targeted');
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        if (start === end) return toastr.warning("Please highlight code first!");
        
        const fullText = textarea.value;
        const selectedText = fullText.substring(start, end);
        const fixedSegment = advancedHtmlFix(selectedText); // ใช้ logic ใหม่
        
        if (fixedSegment === selectedText) {
            toastr.info("Selection looks valid."); return;
        }
        
        textarea.value = fullText.substring(0, start) + fixedSegment + fullText.substring(end);
        textarea.setSelectionRange(start, start + fixedSegment.length);
        textarea.focus();
        toastr.success("Fixed!");
    });

    $('#btn-save-targeted').on('click', async () => {
        chat[targetMessageId].mes = $('#editor-targeted').val();
        await context.saveChat();
        await context.reloadCurrentChat();
        $('#html-healer-modal').remove();
    });
}

// >>> Feature: Editor (Blocks) <<<
function openBlockEditor() {
    const context = SillyTavern.getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return toastr.warning("No messages.");

    targetMessageId = chat.length - 1;
    const originalText = chat[targetMessageId].mes;
    
    // Parse
    const parseResult = parseSegments(originalText);
    initialSegments = parseResult.segments;
    const isThinkBroken = parseResult.isThinkBroken;

    currentSegments = JSON.parse(JSON.stringify(initialSegments));
    
    if (isThinkBroken) {
        toastr.error("Warning: Unclosed <think> detected!", "Parsing Paused");
    }

    const modalHtml = `
    <div id="html-healer-modal" class="html-healer-overlay">
        <div class="html-healer-box" style="border: 1px solid rgba(166,177,225,0.4); box-shadow: 0 0 20px rgba(166,177,225,0.15);">
            
            <div class="healer-header" style="background: linear-gradient(90deg, var(--lavender-dark, #2a2730) 0%, rgba(42,39,48,0.9) 100%);">
                <div class="header-brand">
                    <div class="header-icon" style="color: #ffb7b2;"><i class="fa-solid fa-layer-group"></i></div>
                    <div class="header-text"><span class="title" style="color: #fff;">Editor (Blocks)</span></div>
                </div>
                <div class="header-controls">
                    <button class="reset-btn" id="btn-reset-split" title="Reset" style="margin-right:5px;"><i class="fa-solid fa-rotate-left"></i></button>
                    
                    <div class="author-pill" style="border: 1px solid rgba(255,183,178,0.3); background: rgba(0,0,0,0.2);">
                        <img src="${authorConfig.avatarUrl}" onerror="this.style.display='none'" style="border: 1px solid #ffb7b2;">
                        <span class="author-name" style="color: #ffb7b2;">${authorConfig.name}</span>
                    </div>

                    <div class="close-btn" onclick="$('#html-healer-modal').remove()" style="margin-left:5px;">
                        <i class="fa-solid fa-xmark"></i>
                    </div>
                </div>
            </div>

            <div class="segment-picker-area">
                <div class="segment-scroller" id="segment-container"></div>
                <div class="picker-instruction">
                    ${isThinkBroken 
                        ? '<span style="color:#ffb7b2;"><i class="fa-solid fa-triangle-exclamation"></i> Please close &lt;think&gt; first.</span>' 
                        : '<i class="fa-solid fa-arrow-pointer"></i> Toggle: <b>Story → Think → UI</b>'
                    }
                </div>
            </div>
            
            <div class="healer-body">
                <div id="view-editor" class="view-section active">
                    <div class="editor-group think-group" style="border-color: rgba(166, 177, 225, 0.3);">
                        <div class="group-toolbar">
                            <span class="label" style="color:#a6b1e1;"><i class="fa-solid fa-brain"></i> Thinking</span>
                            <span class="word-count" id="count-cot">0w</span>
                        </div>
                        <textarea id="editor-cot" placeholder="<think>...</think>"></textarea>
                    </div>

                    <div class="editor-group ui-group" style="border-color: #ffb7b2;">
                        <div class="group-toolbar" style="background: rgba(255, 183, 178, 0.1);">
                            <span class="label" style="color: #ffb7b2;"><i class="fa-solid fa-code"></i> UI / Tags</span>
                            <div class="toolbar-actions">
                                <button class="action-btn" id="btn-heal-ui" style="border-color:#ffb7b2; color:#ffb7b2;"><i class="fa-solid fa-wand-magic-sparkles"></i> Fix UI</button>
                            </div>
                        </div>
                        <textarea id="editor-ui" placeholder="<custom.tag>...</custom.tag>" style="color:#ffccbc;"></textarea>
                    </div>

                    <div class="editor-group main-group" style="border-color: rgba(152, 195, 121, 0.3);">
                        <div class="group-toolbar">
                            <span class="label" style="color:#98c379;"><i class="fa-solid fa-comments"></i> Story</span>
                            <span class="word-count" id="count-main">0w</span>
                        </div>
                        <textarea id="editor-main" placeholder="Story content..."></textarea>
                    </div>
                </div>
            </div>

            <div class="healer-footer">
                <button id="btn-save-split" class="save-button" style="background:#a6b1e1; color:#222;">
                    <i class="fa-solid fa-floppy-disk"></i> Merge & Save
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
            // ฉลาด: ถ้า user ลืมใส่ tag think ระบบเติมให้เลยตอนเซฟ
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
        let style = '';

        if (seg.type === 'think') { 
            icon = '<i class="fa-solid fa-brain"></i>'; 
            colorClass = 'type-think'; 
        }
        if (seg.type === 'ui') { 
            icon = '<i class="fa-solid fa-code"></i>'; 
            colorClass = 'type-ui'; 
            style = 'border-color: #ffb7b2; background: rgba(255, 183, 178, 0.1);';
        } 
        
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
                        
                        <div id="html-healer-quick-fix" class="menu_button" style="flex:1; background-color: var(--smart-theme-color, #4caf50);" title="Fix HTML tags (checks broken think first)">
                            <i class="fa-solid fa-wand-magic-sparkles"></i> Auto
                        </div>

                        <div id="html-healer-open-editor" class="menu_button" style="flex:1;" title="Separate Think / UI / Story">
                            <i class="fa-solid fa-layer-group"></i> Editor
                        </div>

                        <div id="html-healer-open-split" class="menu_button" style="flex:1;" title="Highlight specific text to fix">
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
    $('#html-healer-open-editor').on('click', openBlockEditor);
    $('#html-healer-open-split').on('click', openHighlightFixer);
}

jQuery(async () => {
    loadSettings();
    console.log(`[${extensionName}] Ready.`);
});
