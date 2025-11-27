const extensionName = "html-healer";

// --- 1. Logic (Block Segmentation) ---

// แยกข้อความเป็นบล็อกๆ เพื่อให้ User เลือก
function parseSegments(rawText) {
    // Normalize Tag ก่อน
    let cleanText = rawText
        .replace(/&lt;think&gt;/gi, "<think>")
        .replace(/&lt;\/think&gt;/gi, "</think>");

    // แยกย่อหน้าด้วย Double Newline
    const rawBlocks = cleanText.split(/\n{2,}/);
    
    // สถานะเริ่มต้น (สมมติว่าเป็นเนื้อเรื่องก่อน)
    let currentType = "story"; 
    
    return rawBlocks.map((block, index) => {
        let text = block.trim();
        if (!text) return null;

        // 🧠 Heuristic Logic: ระบบเดาใจเบื้องต้น (User แก้ทีหลังได้)
        // ถ้าขึ้นต้นด้วย < และไม่ใช่ tag ปิด (เช่น </...) และไม่ใช่ tag พื้นฐานเช่น <br>, <i>
        const startsWithTag = /^<[^/](?!br|i|b|em|strong|span|div|p)[^>]*>?/i.test(text);
        
        // ถ้าเจอ <think> หรือ Tag เปิดแปลกๆ ให้เปลี่ยนโหมดเป็น Think
        if (/<think>/i.test(text) || startsWithTag) {
            currentType = "think";
        }
        
        // ถ้าเจอ Tag ปิด </think> หรือคำสั่งปิด ให้ถือว่าเป็น Think บล็อกสุดท้าย แล้วจบ
        const hasClosing = /<\/think>|Close COT|End of thought/i.test(text);
        
        let assignedType = currentType;

        // ถ้าเจอตัวปิด ในรอบหน้าให้กลับไปเป็น story
        if (hasClosing) {
            currentType = "story";
        }

        return {
            id: index,
            text: text,
            type: assignedType // 'story' หรือ 'think'
        };
    }).filter(b => b !== null);
}

// Logic เดิมสำหรับซ่อม HTML (Stack-Based)
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
let currentSegments = []; // เก็บสถานะบล็อกปัจจุบัน

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
    
    // 1. Parse Segments ครั้งแรก
    currentSegments = parseSegments(originalText);

    const modalHtml = `
    <div id="html-healer-modal" class="html-healer-overlay">
        <div class="html-healer-box">
            
            <div class="healer-header">
                <div class="header-brand">
                    <div class="header-icon"><i class="fa-solid fa-layer-group"></i></div>
                    <div class="header-text">
                        <span class="title">Segment Selector</span>
                        <span class="subtitle">Click blocks to toggle (Story/Thought)</span>
                    </div>
                </div>
                <div class="header-controls">
                     <div class="author-pill">
                        <img src="${authorConfig.avatarUrl}" onerror="this.style.display='none'">
                        <span>${authorConfig.name}</span>
                    </div>
                    <div class="close-btn" onclick="$('#html-healer-modal').remove()">
                        <i class="fa-solid fa-xmark"></i>
                    </div>
                </div>
            </div>

            <div class="segment-picker-area">
                <div class="segment-scroller" id="segment-container">
                    </div>
                <div class="picker-instruction">
                    <i class="fa-solid fa-hand-pointer"></i> คลิกที่กล่องข้อความเพื่อสลับ: 
                    <span style="color:#a6b1e1">🧠 ความคิด</span> vs <span style="color:#98c379">💬 เนื้อเรื่อง</span>
                </div>
            </div>
            
            <div class="healer-body">
                <div id="view-editor" class="view-section active">
                    <div class="editor-group think-group">
                        <div class="group-toolbar">
                            <span class="label"><i class="fa-solid fa-brain"></i> Thinking Process</span>
                            <div class="toolbar-actions">
                                <span class="word-count" id="count-cot">0 words</span>
                                <button class="action-btn" onclick="copyText('editor-cot')"><i class="fa-regular fa-copy"></i></button>
                            </div>
                        </div>
                        <textarea id="editor-cot" placeholder="Selected thought segments will appear here..."></textarea>
                    </div>

                    <div class="editor-group main-group">
                        <div class="group-toolbar">
                            <span class="label"><i class="fa-solid fa-comments"></i> Story Content</span>
                            <div class="toolbar-actions">
                                <span class="word-count" id="count-main">0 words</span>
                                <button class="action-btn" id="btn-heal-html" title="Auto-Close Tags"><i class="fa-solid fa-wand-magic-sparkles"></i> Fix HTML</button>
                                <button class="action-btn" onclick="copyText('editor-main')"><i class="fa-regular fa-copy"></i></button>
                            </div>
                        </div>
                        <textarea id="editor-main" placeholder="Selected story segments will appear here..."></textarea>
                    </div>
                </div>
            </div>

            <div class="healer-footer">
                <div class="footer-status">
                     <span class="tag-badge"><i class="fa-solid fa-check-double"></i> Interactive Mode</span>
                </div>
                <button id="btn-save-split" class="save-button">
                    <span class="btn-content"><i class="fa-solid fa-floppy-disk"></i> Save Changes</span>
                </button>
            </div>
        </div>
    </div>
    `;

    $(document.body).append(modalHtml);
    
    // --- Render Segments ---
    const renderSegments = () => {
        const container = $('#segment-container');
        container.empty();
        
        currentSegments.forEach(seg => {
            const icon = seg.type === 'think' ? '<i class="fa-solid fa-brain"></i>' : '<i class="fa-solid fa-comment"></i>';
            const html = `
            <div class="segment-block type-${seg.type}" data-id="${seg.id}">
                <div class="seg-icon">${icon}</div>
                <div class="seg-text">${seg.text.substring(0, 120)}${seg.text.length > 120 ? '...' : ''}</div>
                <div class="seg-toggle"><i class="fa-solid fa-repeat"></i></div>
            </div>
            `;
            container.append(html);
        });
        
        syncEditors(); // อัปเดต Textarea ด้านล่างทันที
    };

    // --- Sync Segments to Editors ---
    const syncEditors = () => {
        const thinkText = currentSegments
            .filter(s => s.type === 'think')
            .map(s => s.text)
            .join('\n\n');
            
        const storyText = currentSegments
            .filter(s => s.type === 'story')
            .map(s => s.text)
            .join('\n\n');

        $('#editor-cot').val(thinkText);
        $('#editor-main').val(storyText);
        updateCounts();
    };

    // --- Click Event (Toggle) ---
    $('#segment-container').on('click', '.segment-block', function() {
        const id = $(this).data('id');
        const seg = currentSegments.find(s => s.id === id);
        
        // Toggle Logic
        seg.type = seg.type === 'think' ? 'story' : 'think';
        
        // Re-render เฉพาะ class visual เพื่อความลื่นไหล (หรือ render ใหม่หมดก็ได้ถ้ารายการไม่เยอะ)
        renderSegments(); 
    });

    // --- Standard Utils ---
    window.copyText = (id) => {
        const el = document.getElementById(id);
        el.select(); navigator.clipboard.writeText(el.value);
        toastr.success("Copied!");
    };

    const updateCounts = () => {
        $('#count-cot').text(countWords($('#editor-cot').val()) + " words");
        $('#count-main').text(countWords($('#editor-main').val()) + " words");
    };

    $('#editor-cot, #editor-main').on('input', updateCounts);

    $('#btn-heal-html').on('click', () => {
        let val = $('#editor-main').val();
        let fixed = val.split(/\n{2,}/).map(b => b.includes('<') ? stackBasedFix(b) : b).join('\n\n');
        $('#editor-main').val(fixed).trigger('input');
        toastr.success("Tags Fixed!");
    });

    $('#btn-save-split').on('click', async () => {
        const cot = $('#editor-cot').val().trim();
        const main = $('#editor-main').val();
        
        let finalMes = "";
        if (cot) finalMes += `<think>\n${cot}\n</think>\n`;
        finalMes += main;

        if (chat[targetMessageId].mes !== finalMes) {
            chat[targetMessageId].mes = finalMes;
            await context.saveChat();
            await context.reloadCurrentChat();
            toastr.success("Saved!");
        }
        $('#html-healer-modal').remove();
    });

    // Start
    renderSegments();
}

function loadSettings() {
    if ($('.html-healer-settings').length > 0) return;
    const settingsHtml = `
    <div class="html-healer-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>HTML Healer</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="styled_description_block">Interactive Editor by ${authorConfig.name}</div>
                <div id="html-healer-open-split" class="menu_button">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Open Segment Editor
                </div>
            </div>
        </div>
    </div>`;
    $('#extensions_settings').append(settingsHtml);
    $('#html-healer-open-split').on('click', openSplitEditor);
}

// --- CSS (Updated for Segment Picker) ---
const styles = `
<style>
:root {
    --lavender-primary: #dcd6f7;
    --lavender-secondary: #a6b1e1;
    --lavender-accent: #ffb7b2;
    --lavender-dark: #2a2730;
    --lavender-darker: #1e1b24;
    --lavender-glass: rgba(166, 177, 225, 0.1);
    --lavender-border: rgba(166, 177, 225, 0.2);
    --lavender-text: #f4f4f8;
}

.html-healer-box * { box-sizing: border-box; transition: all 0.2s ease; }
.html-healer-overlay {
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    z-index: 99999; background: rgba(15, 12, 20, 0.9);
    display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(5px);
}

.html-healer-box {
    width: 90%; max-width: 1000px; height: 90vh;
    background: var(--lavender-darker);
    border: 1px solid var(--lavender-border);
    border-radius: 16px;
    display: flex; flex-direction: column;
    box-shadow: 0 0 50px rgba(0,0,0,0.5);
    overflow: hidden;
}

/* HEADER */
.healer-header {
    background: var(--lavender-dark); padding: 15px 25px;
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 1px solid var(--lavender-border); height: 70px; flex-shrink: 0;
}
.header-brand { display: flex; gap: 12px; align-items: center; }
.header-icon { font-size: 1.5em; color: var(--lavender-secondary); }
.header-text .title { font-weight: bold; font-size: 1.2em; color: var(--lavender-text); }
.header-text .subtitle { font-size: 0.8em; color: var(--lavender-secondary); }
.header-controls { display: flex; gap: 15px; align-items: center; }
.close-btn { cursor: pointer; font-size: 1.2em; color: var(--lavender-text); }

/* SEGMENT PICKER (พระเอกของเรา) */
.segment-picker-area {
    padding: 10px 20px;
    background: rgba(0,0,0,0.2);
    border-bottom: 1px solid var(--lavender-border);
    height: 180px; /* ความสูงคงที่สำหรับเลือกบล็อก */
    display: flex; flex-direction: column; gap: 5px;
}
.segment-scroller {
    flex: 1; overflow-y: auto; overflow-x: hidden;
    display: flex; flex-direction: column; gap: 8px;
    padding-right: 5px;
}
.picker-instruction { font-size: 0.8em; color: #aaa; text-align: center; margin-top: 5px; }

/* Segment Blocks */
.segment-block {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 12px; border-radius: 6px;
    cursor: pointer; border: 1px solid transparent;
    font-size: 0.9em; user-select: none;
}
.segment-block:hover { transform: translateX(5px); }

/* Think Mode (Purple) */
.segment-block.type-think {
    background: rgba(166, 177, 225, 0.15);
    border-color: var(--lavender-secondary);
}
.segment-block.type-think .seg-icon { color: var(--lavender-secondary); }
.segment-block.type-think .seg-text { color: #d0d5e8; font-style: italic; }

/* Story Mode (Green/Normal) */
.segment-block.type-story {
    background: rgba(152, 195, 121, 0.1); /* Greenish tint */
    border-color: rgba(152, 195, 121, 0.4);
}
.segment-block.type-story .seg-icon { color: #98c379; }
.segment-block.type-story .seg-text { color: var(--lavender-text); }

.seg-text { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.seg-toggle { opacity: 0.5; font-size: 0.8em; }

/* EDITOR BODY */
.healer-body { flex: 1; display: flex; overflow: hidden; }
.view-section { flex: 1; display: flex; flex-direction: column; padding: 15px; gap: 15px; }

.editor-group {
    flex: 1; display: flex; flex-direction: column;
    background: rgba(255,255,255,0.02); border-radius: 8px; border: 1px solid var(--lavender-border);
}
.group-toolbar {
    padding: 8px 12px; border-bottom: 1px solid var(--lavender-border);
    display: flex; justify-content: space-between; align-items: center;
    background: rgba(0,0,0,0.1);
}
.label { font-weight: bold; color: var(--lavender-secondary); font-size: 0.9em; display: flex; gap: 8px; align-items: center; }
.action-btn { background: transparent; border: none; color: #aaa; cursor: pointer; font-size: 0.9em; }
.action-btn:hover { color: white; }

textarea {
    flex: 1; width: 100%; border: none; background: transparent;
    color: var(--lavender-text); padding: 15px; resize: none; outline: none;
    font-family: monospace; line-height: 1.5; font-size: 14px;
}

/* FOOTER */
.healer-footer {
    padding: 10px 25px; background: var(--lavender-dark);
    border-top: 1px solid var(--lavender-border);
    display: flex; justify-content: space-between; align-items: center;
    padding-bottom: max(10px, env(safe-area-inset-bottom));
}
.save-button {
    background: var(--lavender-secondary); color: #222; border: none;
    padding: 8px 24px; border-radius: 20px; font-weight: bold; cursor: pointer;
}
.save-button:hover { filter: brightness(1.1); }
.tag-badge { color: var(--lavender-accent); font-size: 0.8em; }

/* Mobile */
@media screen and (max-width: 768px) {
    .html-healer-box { width: 100%; height: 100%; border-radius: 0; }
    .header-brand, .author-pill { display: none; }
    .segment-picker-area { height: 150px; }
}
</style>
`;
$('head').append(styles);

jQuery(async () => {
    loadSettings();
    console.log(`[${extensionName}] Ready (Interactive Segments).`);
});
