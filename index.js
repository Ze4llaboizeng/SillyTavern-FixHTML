const extensionName = "html-healer";

// --- 1. Logic (Analysis & Fix) ---

let initialSegments = []; 
let currentSegments = []; 

// แยกส่วนประกอบ (ใช้สำหรับหน้า Editor)
function parseSegments(rawText) {
    if (!rawText) return [];
    let cleanText = rawText
        .replace(/&lt;think&gt;/gi, "<think>")
        .replace(/&lt;\/think&gt;/gi, "</think>");

    const rawBlocks = cleanText.split(/\n/).filter(line => line.trim() !== "");
    
    let isThinking = false;
    let hasFoundStoryStart = false;

    return rawBlocks.map((block, index) => {
        let text = block.trim();
        
        // เช็คคร่าวๆ ว่าเป็น Tag เปิดยาวๆ หรือไม่
        const startsWithComplexTag = /^<[^/](?!br|i|b|em|strong|span|p)[^>]*>?/i.test(text);
        const hasCloseThink = /<\/think>|Close COT|End of thought/i.test(text);
        
        let assignedType = 'story'; 

        if (!hasFoundStoryStart) {
            if (startsWithComplexTag || /<think>/i.test(text) || isThinking) {
                assignedType = 'think';
                isThinking = true;
            }
            if (hasCloseThink) {
                isThinking = false;
                hasFoundStoryStart = true;
                assignedType = 'think';
            }
        } else {
            assignedType = 'story';
        }
        
        if (index === 0 && !isThinking && !startsWithComplexTag) assignedType = 'story';

        return { id: index, text: text, type: assignedType };
    });
}

function applySplitPoint(startIndex) {
    currentSegments.forEach((seg) => {
        if (seg.id < startIndex) {
            seg.type = 'think';
        } else {
            seg.type = 'story';
        }
    });
}

// ฟังก์ชันซ่อม HTML (Whitelist Mode)
function whitelistFix(text) {
    if (!text) return "";

    // รายชื่อแท็กมาตรฐาน HTML
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

    // ตรวจหา <think> หรือ &lt;think
    const hasThinking = /<think|&lt;think|&lt;\/think|<\/think>/i.test(originalText);

    if (hasThinking) {
        // กรณีเจอ Think -> บังคับเปิด Editor (ตามที่คุณขอไว้: ถ้า think หลุดให้เป็นป๊อปอัพ)
        toastr.info("Thinking detected! Opening editor to handle carefully...");
        openSplitEditor(); 
    } else {
        // กรณี HTML ธรรมดา -> ซ่อมเลย
        const fixedText = whitelistFix(originalText);
        if (fixedText !== originalText) {
            chat[lastIndex].mes = fixedText;
            await context.saveChat();
            await context.reloadCurrentChat();
            toastr.success("HTML Fixed automatically!");
        } else {
            toastr.success("HTML looks good already.");
        }
    }
}

// --- 3. UI Builder ---
let targetMessageId = null;

const authorConfig = {
    name: "Zealllll",
    avatarUrl: "scripts/extensions/third-party/SillyTavern-FixHTML/avatar.png"
};

function openSplitEditor() {
    const context = SillyTavern.getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return toastr.warning("No messages to fix.");

    const lastIndex = chat.length - 1;
    targetMessageId = lastIndex;
    const originalText = chat[lastIndex].mes;
    
    initialSegments = parseSegments(originalText);
    currentSegments = JSON.parse(JSON.stringify(initialSegments));

    const modalHtml = `
    <div id="html-healer-modal" class="html-healer-overlay">
        <div class="html-healer-box">
            
            <div class="healer-header">
                <div class="header-brand">
                    <div class="header-icon"><i class="fa-solid fa-layer-group"></i></div>
                    <div class="header-text">
                        <span class="title">Seg. Selector</span>
                    </div>
                </div>

                <div class="header-controls">
                     <button class="reset-btn" id="btn-reset-split" title="Reset">
                        <i class="fa-solid fa-rotate-left"></i>
                     </button>
                     
                     <div class="author-pill">
                        <img src="${authorConfig.avatarUrl}" onerror="this.style.display='none'">
                        <span class="author-name">${authorConfig.name}</span>
                    </div>

                    <div class="close-btn" onclick="$('#html-healer-modal').remove()">
                        <i class="fa-solid fa-xmark"></i>
                    </div>
                </div>
            </div>

            <div class="segment-picker-area">
                <div class="segment-scroller" id="segment-container"></div>
                <div class="picker-instruction">
                    <i class="fa-solid fa-arrow-pointer"></i> คลิกบรรทัดที่เป็น <b>"จุดเริ่มเนื้อเรื่อง"</b>
                </div>
            </div>
            
            <div class="healer-body">
                <div id="view-editor" class="view-section active">
                    <div class="editor-group think-group">
                        <div class="group-toolbar">
                            <span class="label"><i class="fa-solid fa-brain"></i> Thinking</span>
                            <div class="toolbar-actions">
                                <span class="word-count" id="count-cot">0w</span>
                                <button class="action-btn" onclick="copyText('editor-cot')"><i class="fa-regular fa-copy"></i></button>
                            </div>
                        </div>
                        <textarea id="editor-cot" placeholder="Thinking process..."></textarea>
                    </div>

                    <div class="editor-group main-group">
                        <div class="group-toolbar">
                            <span class="label"><i class="fa-solid fa-comments"></i> Story</span>
                            <div class="toolbar-actions">
                                <span class="word-count" id="count-main">0w</span>
                                <button class="action-btn" id="btn-heal-html"><i class="fa-solid fa-wand-magic-sparkles"></i> Fix</button>
                            </div>
                        </div>
                        <textarea id="editor-main" placeholder="Story content..."></textarea>
                    </div>
                </div>
            </div>

            <div class="healer-footer">
                <button id="btn-save-split" class="save-button">
                    <span class="btn-content"><i class="fa-solid fa-floppy-disk"></i> Save Changes</span>
                </button>
            </div>
        </div>
    </div>
    `;

    $(document.body).append(modalHtml);
    renderSegments();

    $('#segment-container').on('click', '.segment-block', function() {
        const id = $(this).data('id');
        applySplitPoint(id); 
        renderSegments(); 
    });

    $('#btn-reset-split').on('click', () => {
        currentSegments = JSON.parse(JSON.stringify(initialSegments));
        renderSegments();
        toastr.info("Reset to initial detection.");
    });

    $('#btn-heal-html').on('click', () => {
        let val = $('#editor-main').val();
        let fixed = whitelistFix(val);
        $('#editor-main').val(fixed).trigger('input');
        toastr.success("Standard Tags Fixed!");
    });

    $('#editor-cot, #editor-main').on('input', updateCounts);

    // --- [แก้ไข] LOGIC ปุ่ม SAVE แบบฉลาด ---
    $('#btn-save-split').on('click', async () => {
        let cot = $('#editor-cot').val().trim();
        const main = $('#editor-main').val();
        let finalMes = "";

        if (cot) {
            // เช็คว่าในกล่องข้อความ มี <think> เปิดอยู่แล้วหรือยัง?
            // ถ้าไม่มี -> ให้เติม <think> นำหน้า
            if (!/^<think>/i.test(cot)) {
                cot = `<think>\n${cot}`;
            }

            // เช็คว่าในกล่องข้อความ มี </think> ปิดอยู่แล้วหรือยัง?
            // ถ้าไม่มี -> ให้เติม </think> ปิดท้าย
            if (!/<\/think>$/i.test(cot)) {
                cot = `${cot}\n</think>`;
            }
            
            finalMes = `${cot}\n${main}`;
        } else {
            finalMes = main;
        }

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
        const isThink = seg.type === 'think';
        const icon = isThink ? '<i class="fa-solid fa-brain"></i>' : '<i class="fa-solid fa-comment"></i>';
        
        container.append(`
            <div class="segment-block type-${seg.type}" data-id="${seg.id}">
                <div class="seg-icon">${icon}</div>
                <div class="seg-text">${seg.text.substring(0, 60)}...</div>
                ${!isThink ? '<div class="seg-badge">Start</div>' : ''} 
            </div>
        `);
    });
    
    $('.seg-badge').hide();
    $('.segment-block.type-story').first().find('.seg-badge').show();

    const thinkText = currentSegments.filter(s => s.type === 'think').map(s => s.text).join('\n');
    const storyText = currentSegments.filter(s => s.type === 'story').map(s => s.text).join('\n');
    
    $('#editor-cot').val(thinkText);
    $('#editor-main').val(storyText);
    updateCounts();
}

const updateCounts = () => {
    $('#count-cot').text(countWords($('#editor-cot').val()) + "w");
    $('#count-main').text(countWords($('#editor-main').val()) + "w");
};

window.copyText = (id) => {
    const el = document.getElementById(id);
    el.select(); navigator.clipboard.writeText(el.value);
    toastr.success("Copied!");
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
                            <i class="fa-solid fa-wand-magic-sparkles"></i> Quick Fix
                        </div>
                        <div id="html-healer-open-split" class="menu_button" style="flex:1;">
                            <i class="fa-solid fa-layer-group"></i> Editor
                        </div>
                    </div>
                    <small style="opacity:0.6; display:block; margin-top:5px; text-align:center;">*Quick fix will open editor if &lt;think&gt; detected.</small>
                </div>
            </div>
        </div>
    `);
    
    $('#html-healer-open-split').on('click', openSplitEditor);
    $('#html-healer-quick-fix').on('click', performSmartQuickFix);
}

jQuery(async () => {
    loadSettings();
    console.log(`[${extensionName}] Ready.`);
});
