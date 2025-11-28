
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
    
    // --- [LOGIC ใหม่] ตรวจสอบความสมบูรณ์ของ Think ---
    const hasOpenThink = /<think>/i.test(cleanText);
    const hasCloseThink = /<\/think>/i.test(cleanText);
    
    // ถ้ามีเปิดแต่ไม่มีปิด = พัง (ให้ปิดการ detect UI)
    const isThinkBroken = hasOpenThink && !hasCloseThink;

    let state = 'story'; // normal, think, ui
    let segments = [];
    
    // Regex จับ UI (จะถูกข้ามถ้า Think พัง)
    const uiStartRegex = /^<(div|table|style|aside|section|main|header|footer|nav|article|details|summary)/i;
    
    rawBlocks.forEach((line, index) => {
        let text = line.trim();
        if (text === "") {
            segments.push({ id: index, text: line, type: state });
            return;
        }

        // State Transition Logic
        if (state === 'story') {
            if (/<think>/i.test(text)) {
                state = 'think';
            } else if (!isThinkBroken && uiStartRegex.test(text)) {
                // เข้า UI ได้ก็ต่อเมื่อ Think ไม่พังเท่านั้น
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

        // Special case: One-liners (Think จบในบรรทัดเดียว)
        if (state === 'think' && /<\/think>/i.test(text)) {
             segments.push({ id: index, text: line, type: 'think' });
             state = 'story';
             return;
        }
        
        segments.push({ id: index, text: line, type: state });
    });

    return { segments, isThinkBroken }; // คืนค่า flag ไปบอก UI ด้วย
}

function whitelistFix(text) {
    if (!text) return "";

    const standardTags = new Set([
        "a", "abbr", "address", "article", "aside", "audio", "b", "base", "bdi", "bdo", 
        "blockquote", "body", "br", "button", "canvas", "caption", "cite", "code", "col", 
        "colgroup", "data", "datalist", "dd", "del", "details", "dfn", "dialog", "div", 
        "dl", "dt", "em", "embed", "fieldset", "figcaption", "figure", "footer", "form", 
        "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hr", "html", "i", "iframe", 
        "img", "input", "ins", "kbd", "label", "legend", "li", "link", "main", "map", 
        "mark", "meta", "meter", "nav", "noscript", "object", "ol", "optgroup", "option", 
        "output", "p", "param", "picture", "pre", "progress", "q", "rp", "rt", "ruby", "s", 
        "samp", "script", "section", "select", "small", "source", "span", "strong", "style", 
        "sub", "summary", "sup", "svg", "table", "tbody", "td", "template", "textarea", 
        "tfoot", "th", "thead", "time", "title", "tr", "track", "u", "ul", "var", "video", 
        "wbr", "font", "center", "strike", "tt", "big" 
    ]);

    const voidTags = new Set([
        "area", "base", "br", "col", "embed", "hr", "img", "input", 
        "link", "meta", "param", "source", "track", "wbr"
    ]);

    const tagRegex = /<\/?([a-zA-Z0-9\.\-\_:]+)[^>]*>/g;
    let stack = [];
    let match;
    
    while ((match = tagRegex.exec(text)) !== null) {
        const fullTag = match[0];
        const tagName = match[1].toLowerCase();

        if (!standardTags.has(tagName)) continue; 
        if (voidTags.has(tagName)) continue;

        if (fullTag.startsWith("</")) {
            let foundIndex = -1;
            for (let i = stack.length - 1; i >= 0; i--) {
                if (stack[i] === tagName) {
                    foundIndex = i;
                    break;
                }
            }
            if (foundIndex !== -1) {
                stack.splice(foundIndex, stack.length - foundIndex);
            }
        } else {
            stack.push(tagName);
        }
    }

    if (stack.length > 0) {
        const closingTags = stack.reverse().map(t => `</${t}>`).join("");
        return text + "\n" + closingTags;
    }

    return text;
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

    if (hasThinking || hasUI) {
        toastr.info("Opening editor for complex content...");
        openSplitEditor(); 
    } else {
        const fixedText = whitelistFix(originalText);
        if (fixedText !== originalText) {
            chat[lastIndex].mes = fixedText;
            await context.saveChat();
            await context.reloadCurrentChat();
            toastr.success("HTML Fixed!");
        } else {
            toastr.success("No fix needed.");
        }
    }
}

// --- 3. UI Builder ---
let targetMessageId = null;

const authorConfig = {
    name: "Zealllll",
    avatarUrl: "scripts/extensions/third-party/SillyTavern-FixHTML/avatar.png"
};

// UI Fixer (Targeted)
function openTargetedFixer() {
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
                    <div class="header-icon"><i class="fa-solid fa-toolbox"></i></div>
                    <div class="header-text"><span class="title">UI Fixer (Select & Fix)</span></div>
                </div>
                <div class="header-controls">
                     <div class="close-btn" onclick="$('#html-healer-modal').remove()"><i class="fa-solid fa-xmark"></i></div>
                </div>
            </div>
            <div class="healer-body">
                <div class="view-section active">
                    <div class="editor-group main-group">
                        <div class="group-toolbar">
                            <span class="label"><i class="fa-solid fa-i-cursor"></i> Highlight broken HTML part</span>
                            <div class="toolbar-actions">
                                <button class="action-btn" id="btn-heal-selection" style="background:var(--smart-theme-color, #4caf50); color:#fff; border:none;">
                                    <i class="fa-solid fa-band-aid"></i> Fix Selection
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
        if (start === end) return toastr.warning("Please highlight the UI code first!");
        
        const fullText = textarea.value;
        const selectedText = fullText.substring(start, end);
        const fixedSegment = whitelistFix(selectedText);
        
        if (fixedSegment === selectedText) {
            toastr.info("Selection looks fine."); return;
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

// Split Editor - Logic: Block UI if Think Broken
function openSplitEditor() {
    const context = SillyTavern.getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return toastr.warning("No messages to fix.");

    targetMessageId = chat.length - 1;
    const originalText = chat[targetMessageId].mes;
    
    // Parse
    const parseResult = parseSegments(originalText);
    initialSegments = parseResult.segments;
    const isThinkBroken = parseResult.isThinkBroken; // Check status

    currentSegments = JSON.parse(JSON.stringify(initialSegments));
    
    // Alert user if Think is broken
    if (isThinkBroken) {
        toastr.error("Warning: Unclosed <think> detected!", "UI Detection Disabled");
    }

    const modalHtml = `
    <div id="html-healer-modal" class="html-healer-overlay">
        <div class="html-healer-box">
            
            <div class="healer-header">
                <div class="header-brand">
                    <div class="header-icon"><i class="fa-solid fa-layer-group"></i></div>
                    <div class="header-text"><span class="title">Split Editor</span></div>
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
                        ? '<span style="color:#e06c75;"><i class="fa-solid fa-triangle-exclamation"></i> Please fix unclosed THINK tag first to enable UI detection.</span>' 
                        : '<i class="fa-solid fa-arrow-pointer"></i> Click segment to toggle type: <b>Story -> Think -> UI</b>'
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

    // Toggle Logic
    $('#segment-container').on('click', '.segment-block', function() {
        if (isThinkBroken) {
             toastr.warning("Fix <think> tag first!");
             return; // ห้ามเปลี่ยน Type ถ้า Think พัง
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
        toastr.info("Reset segments.");
    });

    $('#btn-heal-ui').on('click', () => {
        let val = $('#editor-ui').val();
        let fixed = whitelistFix(val);
        $('#editor-ui').val(fixed).trigger('input');
        toastr.success("Fixed UI HTML!");
    });

    $('#editor-cot, #editor-main, #editor-ui').on('input', updateCounts);

    $('#btn-save-split').on('click', async () => {
        let cot = $('#editor-cot').val().trim();
        let ui = $('#editor-ui').val().trim();
        let main = $('#editor-main').val().trim();
        
        let parts = [];

        // Save logic: พยายามซ่อม Think ให้ด้วยตอนเซฟ ถ้า user ลืมปิด
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
                        <div id="html-healer-open-split" class="menu_button" style="flex:1;">
                            <i class="fa-solid fa-layer-group"></i> Split
                        </div>
                        <div id="html-healer-open-targeted" class="menu_button" style="flex:1;">
                            <i class="fa-solid fa-toolbox"></i> UI Fix
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `);
    
    $('#html-healer-open-split').on('click', openSplitEditor);
    $('#html-healer-quick-fix').on('click', performSmartQuickFix);
    $('#html-healer-open-targeted').on('click', openTargetedFixer);
}

jQuery(async () => {
    loadSettings();
    console.log(`[${extensionName}] Ready.`);
});
