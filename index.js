const extensionName = "html-healer";

// --- 1. Logic (Analysis & Fix) ---

let initialSegments = []; 
let currentSegments = []; 

const authorConfig = {
    name: "Zealllll",
    avatarUrl: "scripts/extensions/third-party/SillyTavern-FixHTML/avatar.png"
};

// แยกส่วนประกอบ
function parseSegments(rawText) {
    if (!rawText) return { segments: [], isThinkBroken: false };
    
    let cleanText = rawText
        .replace(/&lt;think&gt;/gi, "<think>")
        .replace(/&lt;\/think&gt;/gi, "</think>");

    const rawBlocks = cleanText.split(/\n/);
    
    const hasOpenThink = /<think>/i.test(cleanText);
    const hasCloseThink = /<\/think>/i.test(cleanText);
    const isThinkBroken = hasOpenThink && !hasCloseThink;

    let state = 'story'; 
    let segments = [];
    const uiStartRegex = /^<(div|table|style|aside|section|main|header|footer|nav|article|details|summary|code|pre)/i;
    
    rawBlocks.forEach((line, index) => {
        let text = line.trim();
        if (text === "") {
            segments.push({ id: index, text: line, type: state });
            return;
        }

        if (state === 'story') {
            if (/<think>/i.test(text)) state = 'think';
            else if (!isThinkBroken && uiStartRegex.test(text)) state = 'ui';
        } else if (state === 'think') {
            if (/<\/think>/i.test(text)) state = 'story'; 
        } else if (state === 'ui') {
            if (/<think>/i.test(text)) state = 'think';
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

function advancedHtmlFix(text) {
    if (!text) return "";
    const tagRegex = /<(\/?)([a-zA-Z0-9\-\_\.\:]+)([^>]*?)(\/?)>/g;
    const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
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
            result += fullTag; continue;
        }

        if (!isClose) {
            stack.push(tagName);
            result += fullTag;
        } else {
            if (stack.length > 0) {
                const top = stack[stack.length - 1];
                if (top === tagName) {
                    stack.pop(); result += fullTag;
                } else {
                    const foundIndex = stack.lastIndexOf(tagName);
                    if (foundIndex !== -1) {
                        while (stack.length > foundIndex + 1) {
                            const unclosed = stack.pop();
                            result += `</${unclosed}>`; 
                        }
                        stack.pop(); result += fullTag;
                    }
                }
            }
        }
    }
    result += text.substring(lastIndex);
    while (stack.length > 0) {
        const unclosed = stack.pop(); result += `</${unclosed}>`;
    }
    return result;
}

function countWords(str) {
    if (!str) return 0;
    return str.trim().split(/\s+/).length;
}

// --- 2. Smart Action ---
async function performSmartQuickFix() {
    const context = SillyTavern.getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return toastr.warning("No messages.");

    const lastIndex = chat.length - 1;
    const originalText = chat[lastIndex].mes;
    const hasOpenThink = /<think>/i.test(originalText);
    const hasCloseThink = /<\/think>/i.test(originalText);
    
    if (hasOpenThink && !hasCloseThink) {
        toastr.warning("Think is broken! Please set 'Start Story' in Editor.", "Fix Required");
        openBlockEditor(); 
        return;
    }

    const fixedText = advancedHtmlFix(originalText);
    if (fixedText !== originalText) {
        chat[lastIndex].mes = fixedText;
        await context.saveChat();
        await context.reloadCurrentChat();
        toastr.success("Fixed!");
    } else {
        toastr.success("Perfect!");
    }
}

// --- 3. UI Builder ---
let targetMessageId = null;

const getHeaderHtml = (title, icon) => `
    <div class="healer-header" style="background: linear-gradient(90deg, var(--lavender-dark, #2a2730) 0%, rgba(42,39,48,0.9) 100%);">
        <div class="header-brand">
            <div class="header-icon" style="color: #90caf9;">${icon}</div>
            <div class="header-text"><span class="title" style="color: #fff;">${title}</span></div>
        </div>
        <div class="header-controls">
             <div class="author-pill" style="border: 1px solid rgba(144, 202, 249, 0.3); background: rgba(0,0,0,0.2);">
                <img src="${authorConfig.avatarUrl}" onerror="this.style.display='none'" style="border: 1px solid #90caf9;">
                <span class="author-name" style="color: #90caf9;">${authorConfig.name}</span>
            </div>
            <div class="close-btn" onclick="$('#html-healer-modal').remove()" style="margin-left:5px;">
                <i class="fa-solid fa-xmark"></i>
            </div>
        </div>
    </div>
`;

// Feature: Split (Highlight)
function openHighlightFixer() {
    const context = SillyTavern.getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return toastr.warning("No messages.");
    targetMessageId = chat.length - 1;
    const originalText = chat[targetMessageId].mes;

    const modalHtml = `
    <div id="html-healer-modal" class="html-healer-overlay">
        <div class="html-healer-box" style="border: 1px solid rgba(144, 202, 249, 0.4); box-shadow: 0 0 20px rgba(144, 202, 249, 0.15);">
            ${getHeaderHtml("Split (Highlight)", '<i class="fa-solid fa-highlighter"></i>')}
            <div class="healer-body">
                <div class="view-section active">
                    <div class="editor-group main-group" style="border-color: #90caf9;">
                        <div class="group-toolbar" style="background: rgba(144, 202, 249, 0.1);">
                            <span class="label" style="color:#90caf9;"><i class="fa-solid fa-i-cursor"></i> Highlight broken part</span>
                            <div class="toolbar-actions">
                                <button class="action-btn" id="btn-heal-selection" style="background:#90caf9; color:#222; border:none; font-weight:bold;">
                                    <i class="fa-solid fa-wand-magic-sparkles"></i> Fix Selection
                                </button>
                            </div>
                        </div>
                        <textarea id="editor-targeted" placeholder="Message content..." style="font-family: monospace;">${originalText}</textarea>
                    </div>
                </div>
            </div>
            <div class="healer-footer">
                <button id="btn-save-targeted" class="save-button" style="background:#90caf9; color:#222;">
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
        const fixedSegment = advancedHtmlFix(selectedText);
        
        if (fixedSegment === selectedText) { toastr.info("Selection looks valid."); return; }
        
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

// Feature: Editor (Blocks - Blue/Green Logic)
function openBlockEditor() {
    const context = SillyTavern.getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return toastr.warning("No messages.");

    targetMessageId = chat.length - 1;
    const originalText = chat[targetMessageId].mes;
    
    const parseResult = parseSegments(originalText);
    initialSegments = parseResult.segments;
    currentSegments = JSON.parse(JSON.stringify(initialSegments));
    
    const modalHtml = `
    <div id="html-healer-modal" class="html-healer-overlay">
        <div class="html-healer-box" style="border: 1px solid rgba(144, 202, 249, 0.4); box-shadow: 0 0 20px rgba(144, 202, 249, 0.15);">
            
            <div class="healer-header" style="background: linear-gradient(90deg, var(--lavender-dark, #2a2730) 0%, rgba(42,39,48,0.9) 100%);">
                <div class="header-brand">
                    <div class="header-icon" style="color: #90caf9;"><i class="fa-solid fa-layer-group"></i></div>
                    <div class="header-text"><span class="title" style="color: #fff;">Editor</span></div>
                </div>
                <div class="header-controls">
                    <button class="reset-btn" id="btn-reset-split" title="Reset" style="margin-right:5px;"><i class="fa-solid fa-rotate-left"></i></button>
                     <div class="author-pill" style="border: 1px solid rgba(144, 202, 249, 0.3); background: rgba(0,0,0,0.2);">
                        <img src="${authorConfig.avatarUrl}" onerror="this.style.display='none'" style="border: 1px solid #90caf9;">
                        <span class="author-name" style="color: #90caf9;">${authorConfig.name}</span>
                    </div>
                    <div class="close-btn" onclick="$('#html-healer-modal').remove()" style="margin-left:5px;"><i class="fa-solid fa-xmark"></i></div>
                </div>
            </div>

            <div class="segment-picker-area" style="background: rgba(0,0,0,0.2);">
                <div class="segment-scroller" id="segment-container"></div>
                <div class="picker-instruction" style="background: rgba(30,30,40,0.9); border-top: 1px solid #444;">
                    <span style="color:#a5d6a7; font-weight:bold;">
                        <i class="fa-solid fa-flag"></i> Click Flag to Start Story
                    </span>
                    <span style="font-size: 0.8em; margin-left: 10px; color: #ccc;">(Everything above becomes Think)</span>
                </div>
            </div>
            
            <div class="healer-body">
                <div id="view-editor" class="view-section active">
                    <div class="editor-group think-group" style="border-color: #2196f3;">
                        <div class="group-toolbar" style="background: rgba(33, 150, 243, 0.15);">
                            <span class="label" style="color:#64b5f6;"><i class="fa-solid fa-brain"></i> Thinking (Blue)</span>
                            <span class="word-count" id="count-cot" style="color:#90caf9;">0w</span>
                        </div>
                        <textarea id="editor-cot" placeholder="Thinking process..." style="border-left: 2px solid #2196f3;"></textarea>
                    </div>

                    <div class="editor-group ui-group" style="border-color: #ffab91;">
                        <div class="group-toolbar" style="background: rgba(255, 171, 145, 0.15);">
                            <span class="label" style="color: #ffab91;"><i class="fa-solid fa-code"></i> UI / Tags</span>
                            <div class="toolbar-actions">
                                <button class="action-btn" id="btn-heal-ui" style="border-color:#ffab91; color:#ffab91;"><i class="fa-solid fa-wand-magic-sparkles"></i> Fix</button>
                            </div>
                        </div>
                        <textarea id="editor-ui" placeholder="UI Code..." style="color:#ffccbc; border-left: 2px solid #ffab91;"></textarea>
                    </div>

                    <div class="editor-group main-group" style="border-color: #66bb6a;">
                        <div class="group-toolbar" style="background: rgba(76, 175, 80, 0.15);">
                            <span class="label" style="color:#81c784;"><i class="fa-solid fa-comments"></i> Story (Green)</span>
                            <span class="word-count" id="count-main" style="color:#a5d6a7;">0w</span>
                        </div>
                        <textarea id="editor-main" placeholder="Story content..." style="border-left: 2px solid #66bb6a;"></textarea>
                    </div>
                </div>
            </div>

            <div class="healer-footer">
                <button id="btn-save-split" class="save-button" style="background:#64b5f6; color:#111;">
                    <i class="fa-solid fa-floppy-disk"></i> Merge & Save
                </button>
            </div>
        </div>
    </div>
    `;

    $(document.body).append(modalHtml);
    renderSegments();

    // 1. Click Block -> Toggle Type (Cycle)
    $('#segment-container').on('click', '.segment-block', function(e) {
        if ($(e.target).closest('.seg-action').length > 0) return;
        const id = $(this).data('id');
        const seg = currentSegments.find(s => s.id === id);
        if (seg.type === 'story') seg.type = 'think';
        else if (seg.type === 'think') seg.type = 'ui';
        else seg.type = 'story';
        renderSegments(); 
    });

    // 2. Click Flag -> Set Start Story (Blue Top / Green Bottom)
    $('#segment-container').on('click', '.seg-action', function(e) {
        e.stopPropagation(); 
        const startId = $(this).closest('.segment-block').data('id');
        
        // LOGIC: สับครึ่ง
        currentSegments.forEach(seg => {
            if (seg.id < startId) {
                seg.type = 'think'; // ข้างบนเป็น Think (Blue)
            } else {
                seg.type = 'story'; // ตั้งแต่ตรงนี้เป็น Story (Green)
            }
        });

        toastr.success("Set Start Story! (Blue=Think, Green=Story)");
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
            toastr.success("Saved!");
        }
        $('#html-healer-modal').remove();
    });
}

function renderSegments() {
    const container = $('#segment-container');
    container.empty();
    
    currentSegments.forEach(seg => {
        let icon = '<i class="fa-solid fa-comment"></i>';
        let style = '';
        let badgeColor = '#ccc';

        // --- Color Logic (Blue / Green) ---
        if (seg.type === 'think') { 
            icon = '<i class="fa-solid fa-brain"></i>'; 
            // BLUE STYLE
            style = 'border-left: 3px solid #2196f3; background: rgba(33, 150, 243, 0.1); color: #90caf9;';
            badgeColor = '#64b5f6';
        } else if (seg.type === 'story') {
            // GREEN STYLE
            icon = '<i class="fa-solid fa-comment"></i>';
            style = 'border-left: 3px solid #4caf50; background: rgba(76, 175, 80, 0.1); color: #a5d6a7;';
            badgeColor = '#81c784';
        } else if (seg.type === 'ui') { 
            icon = '<i class="fa-solid fa-code"></i>'; 
            style = 'border-left: 3px solid #ffab91; background: rgba(255, 171, 145, 0.1); color: #ffccbc;';
            badgeColor = '#ffab91';
        } 
        
        container.append(`
            <div class="segment-block" data-id="${seg.id}" style="${style} margin-bottom:2px; padding:8px; border-radius:4px; display:flex; align-items:center; cursor:pointer;">
                <div class="seg-icon" style="margin-right:10px; opacity:0.8;">${icon}</div>
                <div class="seg-text" style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-family:monospace; font-size:0.9em;">
                    ${seg.text.substring(0, 60) || "(empty line)"}
                </div>
                
                <div class="seg-action" title="Start Story Here" style="padding:5px 10px; border-radius:4px; background:rgba(255,255,255,0.1); cursor:pointer;">
                    <i class="fa-solid fa-flag" style="color:${badgeColor};"></i>
                </div>
            </div>
        `);
    });

    const thinkText = currentSegments.filter(s => s.type === 'think').map(s => s.text).join('\n');
    const uiText = currentSegments.filter(s => s.type === 'ui').map(s => s.text).join('\n');
    const storyText = currentSegments.filter(s => s.type === 'story').map(s => s.text).join('\n');
    
    $('#editor-cot').val(thinkText);
    $('#editor-ui').val(uiText);
    $('#editor-main').val(storyText);
    
    // Auto-hide empty boxes
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
