เข้าใจครับ จะปรับปรุงโค้ดตามที่ระบุเลยครับ:

1.  **Logic การแยกพารากราฟ (`parseSegments`):** จะวนลูปเช็ค **ทุกพารากราฟ** อย่างละเอียด โดยใช้เงื่อนไขว่าถ้าเจอ `<...>` เปิดขึ้นมา (แบบไม่ใช่แท็กทั่วไป) และไม่มีข้อความนำหน้า ให้ตีว่าเป็น `think` และหาจุดสิ้นสุดเพื่อตัดเข้าสู่ `story`
2.  **แก้ UI โทรศัพท์:**
      * **ปุ่ม Save หลุดขอบ:** ปรับ Footer ให้ยืดหยุ่นขึ้น (Responsive) ไม่ให้ดันปุ่มตกขอบ
      * **Icon ผู้สร้างขยับ/เพี้ยน:** ล็อกขนาดและตำแหน่งให้ดีขึ้นในจอเล็ก

นี่คือไฟล์ `index.js` ที่อัปเดตใหม่ครับ (รวม CSS ที่แก้แล้วไว้ในตัวแปร `styles` ด้านล่างสุด)

```javascript
const extensionName = "html-healer";

// --- 1. Logic (Block Segmentation) ---

function parseSegments(rawText) {
    // Normalize Tag
    let cleanText = rawText
        .replace(/&lt;think&gt;/gi, "<think>")
        .replace(/&lt;\/think&gt;/gi, "</think>");

    // แยกย่อหน้าด้วย Double Newline เพื่อเช็คทุกพารากราฟ
    const rawBlocks = cleanText.split(/\n{2,}/);
    
    let isThinking = false; 
    let hasFoundStoryStart = false; 

    return rawBlocks.map((block, index) => {
        let text = block.trim();
        if (!text) return null;

        // เช็คเงื่อนไข:
        // 1. เริ่มต้นด้วย Tag เปิดที่ดูซับซ้อน (เช่น <div class="..."> หรือ <think>) โดยไม่มี text นำหน้า
        //    (regex นี้เช็คว่าตัวแรกคือ < ตามด้วยตัวอักษร และไม่ใช่ tag ทั่วไป)
        const startsWithComplexTag = /^<[^/](?!br|i|b|em|strong|span|p)[^>]*>?/i.test(text);
        
        // 2. มี Tag ปิดความคิด
        const hasCloseThink = /<\/think>|Close COT|End of thought/i.test(text);

        let assignedType = 'story'; // ค่าเริ่มต้นสมมติว่าเป็นเนื้อเรื่อง

        if (!hasFoundStoryStart) {
            // ถ้ายังไม่เจอเนื้อเรื่อง เราจะสงสัยว่าเป็น Think ไว้ก่อน
            
            // กรณี 1: บล็อกนี้เริ่มต้นด้วย Tag ประหลาด หรือมี <think> หรือเรากำลังอยู่ในโหมดคิด
            if (startsWithComplexTag || /<think>/i.test(text) || isThinking) {
                assignedType = 'think';
                isThinking = true; // ล็อกสถานะว่ากำลังคิด
            } 
            // กรณี 2: ไม่มี Tag แต่มันอยู่ก่อนเนื้อเรื่อง (และไม่ใช่บล็อกแรกสุดที่อาจจะเป็น text ธรรมดา)
            // แต่เพื่อให้ User เลือกง่าย เราจะเหมาว่าเป็น Think ไปก่อนถ้ามันดูไม่ใช่บทพูดชัดเจน
            // (ในที่นี้ใช้ Logic เดิมคือ ถ้าเข้าเงื่อนไข Tag ถึงนับ)
            
            // ตรวจสอบจุดจบความคิด
            if (hasCloseThink) {
                isThinking = false;
                hasFoundStoryStart = true; // บล็อกถัดไปจะเป็น Story แน่นอน
                assignedType = 'think'; // บล็อกนี้ยังคงเป็นส่วนหนึ่งของความคิด
            }
        } else {
            // ถ้าเจอจุดตัดเข้าเนื้อเรื่องแล้ว บล็อกที่เหลือคือ Story
            assignedType = 'story';
        }

        // *Special Case Check*: ถ้าบล็อกนี้ไม่มี Tag อะไรเลย และเราไม่ได้ locked ว่ากำลังคิด 
        // ให้ถือว่าเป็น Story (แก้ปัญหาเผลอไปรวบ text บรรทัดแรกเป็น think)
        if (!isThinking && !startsWithComplexTag && !hasFoundStoryStart && index === 0) {
             assignedType = 'story';
        }

        return {
            id: index,
            text: text,
            type: assignedType
        };
    }).filter(b => b !== null);
}

// Logic ซ่อม HTML (คงเดิม)
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
let currentSegments = [];

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
    
    currentSegments = parseSegments(originalText);

    const modalHtml = `
    <div id="html-healer-modal" class="html-healer-overlay">
        <div class="html-healer-box">
            
            <div class="healer-header">
                <div class="header-brand">
                    <div class="header-icon"><i class="fa-solid fa-layer-group"></i></div>
                    <div class="header-text">
                        <span class="title">Segment Selector</span>
                        <span class="subtitle">Click blocks to toggle</span>
                    </div>
                </div>
                <div class="header-controls">
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
                    <i class="fa-solid fa-hand-pointer"></i> Tap blocks to switch: 
                    <span style="color:#a6b1e1">🧠 Think</span> / <span style="color:#98c379">💬 Story</span>
                </div>
            </div>
            
            <div class="healer-body">
                <div id="view-editor" class="view-section active">
                    <div class="editor-group think-group">
                        <div class="group-toolbar">
                            <span class="label"><i class="fa-solid fa-brain"></i> Thought</span>
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
                     <span class="tag-badge"><i class="fa-solid fa-check-double"></i> Interactive</span>
                </div>
                <button id="btn-save-split" class="save-button">
                    <span class="btn-content"><i class="fa-solid fa-floppy-disk"></i> Save</span>
                </button>
            </div>
        </div>
    </div>
    `;

    $(document.body).append(modalHtml);
    renderSegments();

    // --- Events ---
    $('#segment-container').on('click', '.segment-block', function() {
        const id = $(this).data('id');
        const seg = currentSegments.find(s => s.id === id);
        seg.type = seg.type === 'think' ? 'story' : 'think';
        renderSegments(); 
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
        const icon = seg.type === 'think' ? '<i class="fa-solid fa-brain"></i>' : '<i class="fa-solid fa-comment"></i>';
        container.append(`
            <div class="segment-block type-${seg.type}" data-id="${seg.id}">
                <div class="seg-icon">${icon}</div>
                <div class="seg-text">${seg.text.substring(0, 80)}...</div>
                <div class="seg-toggle"><i class="fa-solid fa-repeat"></i></div>
            </div>
        `);
    });
    
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

// --- CSS UPDATED ---
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
}

.html-healer-box {
    width: 95%; max-width: 900px; height: 90vh;
    background: var(--lavender-darker);
    border: 1px solid var(--lavender-border);
    border-radius: 12px;
    display: flex; flex-direction: column;
    box-shadow: 0 0 30px rgba(0,0,0,0.6);
    overflow: hidden;
}

/* HEADER */
.healer-header {
    background: var(--lavender-dark); padding: 10px 15px;
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 1px solid var(--lavender-border); height: 60px; flex-shrink: 0;
}
.header-brand { display: flex; gap: 10px; align-items: center; }
.header-icon { font-size: 1.2em; color: var(--lavender-secondary); }
.header-text .title { font-weight: bold; color: var(--lavender-text); }
.header-text .subtitle { font-size: 0.75em; color: #aaa; display: block; }
.header-controls { display: flex; gap: 10px; align-items: center; }
.close-btn { cursor: pointer; padding: 5px; color: var(--lavender-text); font-size: 1.2em; }

/* AUTHOR PILL (Fix for Mobile) */
.author-pill {
    display: flex; align-items: center; gap: 8px;
    background: rgba(255, 255, 255, 0.05);
    padding: 4px 10px; border-radius: 20px;
    border: 1px solid var(--lavender-border);
    flex-shrink: 0; /* ห้ามหด */
}
.author-pill img {
    width: 24px; height: 24px; border-radius: 50%; object-fit: cover;
    border: 1px solid var(--lavender-secondary);
}
.author-pill span { font-size: 0.8em; color: var(--lavender-text); font-weight: bold; }

/* SEGMENT PICKER */
.segment-picker-area {
    padding: 8px; background: rgba(0,0,0,0.2);
    border-bottom: 1px solid var(--lavender-border);
    height: 150px; display: flex; flex-direction: column; gap: 5px;
}
.segment-scroller { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.picker-instruction { font-size: 0.75em; color: #888; text-align: center; }

.segment-block {
    display: flex; align-items: center; gap: 10px; padding: 8px;
    border-radius: 4px; cursor: pointer; border: 1px solid transparent;
    font-size: 0.85em; background: rgba(255,255,255,0.03);
}
.segment-block.type-think { border-color: var(--lavender-secondary); background: rgba(166, 177, 225, 0.1); }
.segment-block.type-story { border-color: rgba(152, 195, 121, 0.4); background: rgba(152, 195, 121, 0.05); }
.seg-text { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #ddd; }

/* EDITOR BODY */
.healer-body { flex: 1; display: flex; overflow: hidden; }
.view-section { flex: 1; display: flex; flex-direction: column; padding: 10px; gap: 10px; }
.editor-group { flex: 1; display: flex; flex-direction: column; border: 1px solid var(--lavender-border); border-radius: 6px; }
.group-toolbar {
    padding: 5px 10px; background: rgba(0,0,0,0.2);
    display: flex; justify-content: space-between; align-items: center;
}
.label { font-size: 0.8em; font-weight: bold; color: var(--lavender-secondary); }
.toolbar-actions { display: flex; gap: 8px; align-items: center; }
.word-count { font-size: 0.7em; color: #666; }
.action-btn { background: none; border: 1px solid #444; color: #ccc; border-radius: 4px; cursor: pointer; font-size: 0.75em; padding: 2px 6px; }
textarea { flex: 1; width: 100%; border: none; background: transparent; color: #eee; padding: 10px; resize: none; outline: none; font-family: monospace; }

/* FOOTER (Fix Button Falling Off) */
.healer-footer {
    padding: 10px 15px; background: var(--lavender-dark);
    border-top: 1px solid var(--lavender-border);
    display: flex; justify-content: space-between; align-items: center;
    flex-wrap: wrap; /* ให้ตกบรรทัดได้ถ้าจอเล็กมาก */
    gap: 10px;
    padding-bottom: max(10px, env(safe-area-inset-bottom));
}
.footer-status { font-size: 0.8em; color: #888; }
.save-button {
    background: var(--lavender-secondary); color: #222; border: none;
    padding: 8px 20px; border-radius: 20px; font-weight: bold; cursor: pointer;
    white-space: nowrap; /* ไม่ให้ข้อความในปุ่มแตกบรรทัด */
    flex-shrink: 0;
}

/* MOBILE RESPONSIVE TWEAKS */
@media screen and (max-width: 600px) {
    .html-healer-box { width: 100%; height: 100%; border-radius: 0; border: none; }
    .header-text .subtitle { display: none; } /* ซ่อนคำอธิบายยาวๆ */
    
    /* ปรับ Icon ผู้สร้างในมือถือ */
    .author-pill span.author-name { display: none; } /* ซ่อนชื่อ เหลือแต่รูป */
    .author-pill { padding: 2px; border: none; background: transparent; }
    
    .segment-picker-area { height: 130px; }
    .view-section { padding: 5px; gap: 5px; }
    
    /* Footer แน่นๆ */
    .healer-footer { justify-content: flex-end; } 
    .footer-status { display: none; } /* ซ่อน status ถ้าที่เต็ม */
}
</style>
`;
$('head').append(styles);

jQuery(async () => {
    loadSettings();
    console.log(`[${extensionName}] Ready.`);
});
```
