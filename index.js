const extensionName = "html-healer";

// --- 1. Logic (Block Segmentation & Split) ---

let initialSegments = []; // เก็บค่าเริ่มต้นไว้กด Reset
let currentSegments = []; // ค่าปัจจุบันที่ User แก้ไข

// แยกข้อความและเดาเบื้องต้น
function parseSegments(rawText) {
    let cleanText = rawText
        .replace(/&lt;think&gt;/gi, "<think>")
        .replace(/&lt;\/think&gt;/gi, "</think>");

    // 1. ตรวจจับการแบ่งพารากราฟด้วย \n\n (2 บรรทัดขึ้นไป)
    const rawBlocks = cleanText.split(/\n{2,}/);
    
    // Logic เดาเบื้องต้น
    let isThinking = false;
    let hasFoundStoryStart = false;

    return rawBlocks.map((block, index) => {
        let text = block.trim();
        if (!text) return null;

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
        
        // กันพลาด: ถ้าบล็อกแรกไม่มี tag อะไรเลย ให้เป็น Story ไปก่อน
        if (index === 0 && !isThinking && !startsWithComplexTag) assignedType = 'story';

        return { id: index, text: text, type: assignedType };
    }).filter(b => b !== null);
}

// ฟังก์ชันกำหนดจุดตัด (เมื่อ User คลิก)
function applySplitPoint(startIndex) {
    currentSegments.forEach((seg) => {
        if (seg.id < startIndex) {
            seg.type = 'think'; // ก่อนหน้าจุดเลือก = ความคิด
        } else {
            seg.type = 'story'; // ตั้งแต่จุดเลือกเป็นต้นไป = เนื้อเรื่อง
        }
    });
}

// Logic ซ่อม HTML (เหมือนเดิม)
function stackBasedFix(htmlSegment) {
    const voidTags = new Set([
        "area", "base", "br", "col", "embed", "hr", "img", "input", 
        "link", "meta", "param", "source", "track", "wbr", "command", "keygen", "menuitem"
    ]);
    const tagRegex = /<\/?([a-zA-Z0-9\.\-\_:]+)[^>]*>/g;
    const stack = [];
    let match;

    while ((match = tagRegex.exec(htmlSegment)) !== null) {
        const tagName = match[1].toLowerCase();
        if (voidTags.has(tagName)) continue;
        if (match[0].startsWith("</")) {
            const lastIdx = stack.lastIndexOf(tagName);
            if (lastIdx !== -1) stack.splice(lastIdx, stack.length - lastIdx);
        } else {
            stack.push(tagName);
        }
    }
    return htmlSegment + stack.reverse().map(t => `</${t}>`).join("");
}

function countWords(str) {
    if (!str) return 0;
    return str.trim().split(/\s+/).length;
}

// --- 2. UI Builder ---
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
    
    // เริ่มต้น
    initialSegments = parseSegments(originalText);
    currentSegments = JSON.parse(JSON.stringify(initialSegments));

    const modalHtml = `
    <div id="html-healer-modal" class="html-healer-overlay">
        <div class="html-healer-box">
            
            <div class="healer-header">
                <div class="header-brand">
                    <div class="header-icon"><i class="fa-solid fa-layer-group"></i></div>
                    <div class="header-text">
                        <span class="title">Segment Selector</span>
                        <span class="subtitle">Click the <b>First Story Message</b></span>
                    </div>
                </div>
                <div class="header-controls">
                     <button class="reset-btn" id="btn-reset-split" title="Reset">
                        <i class="fa-solid fa-rotate-left"></i> <span class="reset-text">Reset</span>
                     </button>
                     <div class="author-pill">
                        <img src="${authorConfig.avatarUrl}" onerror="this.style.display='none'">
                    </div>
                    <div class="close-btn" onclick="$('#html-healer-modal').remove()">
                        <i class="fa-solid fa-xmark"></i>
                    </div>
                </div>
            </div>

            <div class="segment-picker-area">
                <div class="segment-scroller" id="segment-container"></div>
                <div class="picker-instruction">
                    <i class="fa-solid fa-arrow-pointer"></i> คลิกที่บล็อกที่เป็น <b>"จุดเริ่มเนื้อเรื่อง"</b> (ด้านบนจะเป็นความคิดอัตโนมัติ)
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
                <div class="footer-status">
                     <span class="tag-badge"><i class="fa-solid fa-check-double"></i> Split Mode</span>
                </div>
                <button id="btn-save-split" class="save-button">
                    <span class="btn-content"><i class="fa-solid fa-floppy-disk"></i> Save Changes</span>
                </button>
            </div>
        </div>
    </div>
    `;

    $(document.body).append(modalHtml);
    renderSegments();

    // Event Handlers
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
        let fixed = val.split(/\n{2,}/).map(b => b.includes('<') ? stackBasedFix(b) : b).join('\n\n');
        $('#editor-main').val(fixed).trigger('input');
        toastr.success("Tags Fixed!");
    });

    $('#editor-cot, #editor-main').on('input', updateCounts);

    $('#btn-save-split').on('click', async () => {
        const cot = $('#editor-cot').val().trim();
        const main = $('#editor-main').val();
        let finalMes = cot ? `<think>\n${cot}\n</think>\n${main}` : main;

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
    
    // โชว์ Badge แค่ตัวแรกที่เป็น Story
    $('.seg-badge').hide();
    $('.segment-block.type-story').first().find('.seg-badge').show();

    const thinkText = currentSegments.filter(s => s.type === 'think').map(s => s.text).join('\n\n');
    const storyText = currentSegments.filter(s => s.type === 'story').map(s => s.text).join('\n\n');
    
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
                    <div id="html-healer-open-split" class="menu_button">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> Open Editor
                    </div>
                </div>
            </div>
        </div>
    `);
    $('#html-healer-open-split').on('click', openSplitEditor);
}

// --- CSS UPDATED (Fix Mobile Overflow) ---
const styles = `
<style>
:root {
    --lavender-primary: #dcd6f7;
    --lavender-secondary: #a6b1e1;
    --lavender-border: rgba(166, 177, 225, 0.2);
    --lavender-dark: #2a2730;
    --lavender-darker: #1e1b24;
    --lavender-text: #f4f4f8;
}

.html-healer-box * { box-sizing: border-box; }
.html-healer-overlay {
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    z-index: 99999; background: rgba(0,0,0,0.85);
    display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(4px);
    padding: 10px; /* เพิ่ม padding กันติดขอบจอเกินไป */
}

.html-healer-box {
    width: 100%; max-width: 900px; height: 90vh; /* ใช้ 100% width ในจอเล็ก */
    background: var(--lavender-darker);
    border: 1px solid var(--lavender-border);
    border-radius: 12px;
    display: flex; flex-direction: column;
    box-shadow: 0 0 30px rgba(0,0,0,0.6);
    overflow: hidden;
}

/* HEADER */
.healer-header {
    background: var(--lavender-dark); padding: 5px 10px;
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 1px solid var(--lavender-border); height: 55px; flex-shrink: 0;
}
.header-brand { display: flex; gap: 8px; align-items: center; overflow: hidden; }
.header-icon { font-size: 1.1em; color: var(--lavender-secondary); }
.header-text { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.header-text .title { font-weight: bold; color: var(--lavender-text); font-size: 0.9em; }
.header-text .subtitle { font-size: 0.7em; color: #aaa; display: block; }
.header-controls { display: flex; gap: 8px; align-items: center; margin-left: auto; }
.close-btn { cursor: pointer; padding: 5px; color: var(--lavender-text); font-size: 1.2em; }

/* RESET & AUTHOR */
.reset-btn {
    background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
    color: #ddd; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 0.8em;
    display: flex; align-items: center; gap: 5px;
}
.author-pill {
    display: flex; align-items: center; gap: 5px;
    background: rgba(255, 255, 255, 0.05);
    padding: 2px; border-radius: 20px;
    border: 1px solid var(--lavender-border);
    flex-shrink: 0; 
}
.author-pill img {
    width: 24px; height: 24px; border-radius: 50%; object-fit: cover;
}

/* SEGMENT PICKER */
.segment-picker-area {
    padding: 5px; background: rgba(0,0,0,0.2);
    border-bottom: 1px solid var(--lavender-border);
    height: 140px; display: flex; flex-direction: column; gap: 5px;
}
.segment-scroller { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 5px; }
.picker-instruction { font-size: 0.75em; color: #888; text-align: center; }

.segment-block {
    display: flex; align-items: center; gap: 8px; padding: 6px 10px;
    border-radius: 4px; cursor: pointer; border: 1px solid transparent;
    font-size: 0.8em; background: rgba(255,255,255,0.03);
    position: relative;
}
.segment-block.type-think { border-color: var(--lavender-secondary); background: rgba(166, 177, 225, 0.1); opacity: 0.7; }
.segment-block.type-story { border-color: rgba(152, 195, 121, 0.4); background: rgba(152, 195, 121, 0.1); font-weight: bold;}
.seg-text { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #ddd; }
.seg-badge { background: #98c379; color: #222; font-size: 0.7em; padding: 1px 5px; border-radius: 4px; font-weight: bold; }

/* EDITOR BODY */
.healer-body { flex: 1; display: flex; overflow: hidden; }
.view-section { flex: 1; display: flex; flex-direction: column; padding: 5px; gap: 5px; }
.editor-group { flex: 1; display: flex; flex-direction: column; border: 1px solid var(--lavender-border); border-radius: 6px; }
.group-toolbar {
    padding: 5px; background: rgba(0,0,0,0.2);
    display: flex; justify-content: space-between; align-items: center;
}
.label { font-size: 0.8em; font-weight: bold; color: var(--lavender-secondary); }
.toolbar-actions { display: flex; gap: 5px; align-items: center; }
.word-count { font-size: 0.65em; color: #666; }
.action-btn { background: none; border: 1px solid #444; color: #ccc; border-radius: 4px; cursor: pointer; font-size: 0.7em; padding: 2px 5px; }
textarea { flex: 1; width: 100%; border: none; background: transparent; color: #eee; padding: 8px; resize: none; outline: none; font-family: monospace; font-size: 13px; }

/* FOOTER (FIXED OVERFLOW) */
.healer-footer {
    padding: 8px 10px; background: var(--lavender-dark);
    border-top: 1px solid var(--lavender-border);
    display: flex; justify-content: space-between; align-items: center;
    padding-bottom: max(8px, env(safe-area-inset-bottom));
}
.footer-status { font-size: 0.8em; color: #888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.save-button {
    background: var(--lavender-secondary); color: #222; border: none;
    padding: 8px 15px; border-radius: 20px; font-weight: bold; cursor: pointer;
    white-space: nowrap; /* ห้ามตัดบรรทัดในปุ่ม */
    flex-shrink: 0; /* ห้ามหดปุ่ม */
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
}

/* MOBILE RESPONSIVE TWEAKS */
@media screen and (max-width: 600px) {
    .html-healer-box { width: 100%; height: 100%; border-radius: 0; border: none; }
    .header-text .subtitle { display: none; }
    .reset-text { display: none; } /* ซ่อนคำว่า Reset เหลือแต่ไอคอน */
    
    .segment-picker-area { height: 120px; }
    
    /* แก้ Footer ตกจอ: ซ่อน Status ทิ้งไปเลย ให้ปุ่ม Save เต็มที่ */
    .healer-footer { justify-content: center; } 
    .footer-status { display: none; } 
    .save-button { width: 100%; text-align: center; } /* ปุ่มเต็มจอ */
}
</style>
`;
$('head').append(styles);

jQuery(async () => {
    loadSettings();
    console.log(`[${extensionName}] Ready.`);
});
