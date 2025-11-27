const extensionName = "html-healer";

// --- 1. Logic (Smart Position & Splitter) ---

function splitContent(rawText) {
    let cleanText = rawText
        .replace(/&lt;think&gt;/gi, "<think>")
        .replace(/&lt;\/think&gt;/gi, "</think>");

    // Logic: ตรวจสอบตำแหน่งของ <think> หรือ < (วงเล็บเปิดแบบไม่มีชื่อ)
    // ตามไอเดีย user: ถ้าไม่มีข้อความก่อนหน้า (index 0) = Thinking
    
    const thinkStartRegex = /<think>/i;
    const genericStartRegex = /^<(?!!)/; // ขึ้นต้นด้วย < (ที่ไม่ใช่ <! คอมเมนท์)

    let cot = "";
    let main = cleanText;
    let splitType = "none";

    // 1. ลองหา <think> แบบชัดเจนก่อน
    const match = cleanText.match(/<think>([\s\S]*?)<\/think>/i);
    
    if (match) {
        // เจอ <think>...</think> สมบูรณ์
        if (match.index === 0) {
            // กรณีขึ้นต้นด้วย <think> เลย -> ย้ายไปใส่กล่อง Think
            cot = match[1].trim();
            main = cleanText.replace(match[0], "").trim();
            splitType = "standard_tag";
        } else {
            // กรณีมีข้อความนำหน้า <think> -> ส่วนหน้าเป็น Story, ใน Tag เป็น Think
            // (แต่ส่วนใหญ่เรามักจะอยากเก็บส่วนหน้าไว้ที่เดิม)
            cot = match[1].trim();
            main = cleanText.replace(match[0], "").trim(); // เอาแค่เนื้อเรื่องส่วนอื่น
            splitType = "embedded_tag";
        }
    } 
    // 2. ถ้าไม่เจอ tag สมบูรณ์ ลองดูว่ามันเปิดค้างไว้มั้ยแบบที่คุณบอก
    else if (thinkStartRegex.test(cleanText) || genericStartRegex.test(cleanText)) {
        const openIndex = cleanText.search(/<think>|<[a-z]/i);
        
        // ถ้ามันเปิดที่ตัวอักษรแรก (หรือใกล้เคียง) แสดงว่าเป็น Thinking นำ
        if (openIndex <= 5) { 
            // หาจุดจบของความคิด (End of thought markers)
            const stopPhrases = [
                "Close COT", "CLOSE COT", "</think>", 
                "End of thought", "Analysis complete"
            ];
            const stopRegex = new RegExp(`(${stopPhrases.join("|")})`, "i");
            const stopMatch = cleanText.match(stopRegex);

            if (stopMatch) {
                const cutPoint = stopMatch.index + stopMatch[0].length;
                cot = cleanText.substring(0, cutPoint).replace(/<\/?think>/gi, "").trim();
                main = cleanText.substring(cutPoint).trim();
                splitType = "heuristic_split";
            } else {
                // ถ้าหาจุดปิดไม่เจอเลย แต่ขึ้นต้นด้วย < 
                // อาจจะเหมาว่าเป็น Think ทั้งหมด หรือให้ User มาแก้เอง
                // ในที่นี้จะกันไว้ส่วนหนึ่ง แล้วให้ user ย้ายเองจะปลอดภัยกว่า
                splitType = "potential_open_tag";
            }
        }
    }

    return { type: splitType, cot: cot, main: main };
}

// Logic ซ่อม HTML แบบ Stack (ตัวล่าสุด)
function stackBasedFix(htmlSegment) {
    const voidTags = new Set([
        "area", "base", "br", "col", "embed", "hr", "img", "input", 
        "link", "meta", "param", "source", "track", "wbr"
    ]);
    const tagRegex = /<\/?([a-zA-Z0-9\.\-\_:]+)[^>]*>/g;
    const stack = [];
    let match;

    while ((match = tagRegex.exec(htmlSegment)) !== null) {
        const fullTag = match[0];
        const tagName = match[1].toLowerCase();
        if (voidTags.has(tagName)) continue;

        if (fullTag.startsWith("</")) {
            const lastIdx = stack.lastIndexOf(tagName);
            if (lastIdx !== -1) stack.splice(lastIdx, stack.length - lastIdx);
        } else {
            stack.push(tagName);
        }
    }
    return htmlSegment + stack.reverse().map(t => `</${t}>`).join("");
}

function healHtmlContent(htmlContent) {
    if (!htmlContent) return "";
    let processed = htmlContent
        .replace(/<\s*\/\s*([a-zA-Z0-9\.\-\_:]+)>/g, "</$1>")
        .replace(/<([a-zA-Z0-9\.\-\_:]+)([^>]*?)\s*\/?>/g, (match, tag, attr) => `<${tag}${attr}>`); 

    const blocks = processed.split(/\n{2,}/);
    return blocks.map(block => block.includes('<') ? stackBasedFix(block) : block).join('\n\n');
}

function countWords(str) {
    if (!str) return 0;
    return str.trim().split(/\s+/).length;
}

// --- 2. UI Builder (Toggle Switch Style) ---
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
    const parts = splitContent(originalText);

    const modalHtml = `
    <div id="html-healer-modal" class="html-healer-overlay">
        <div class="html-healer-box">
            
            <div class="healer-header">
                <div class="header-left-group">
                    <div class="header-icon"><i class="fa-solid fa-layer-group"></i></div>
                    <div class="header-text">
                        <span class="title">Lavender Editor</span>
                    </div>
                </div>

                <div class="mode-switcher">
                    <button class="mode-btn active" id="mode-think" onclick="setMode('think')">
                        <i class="fa-solid fa-brain"></i> Thinking
                    </button>
                    <button class="mode-btn" id="mode-story" onclick="setMode('story')">
                        <i class="fa-solid fa-book-open"></i> Story
                    </button>
                </div>

                <div class="header-controls">
                    <div class="close-btn" onclick="$('#html-healer-modal').remove()">
                        <i class="fa-solid fa-xmark"></i>
                    </div>
                </div>
            </div>
            
            <div class="healer-body">
                
                <div id="container-think" class="content-container active">
                    <div class="toolbar">
                        <span class="info-label">🧠 Process Log (CoT)</span>
                        <div class="tools">
                            <span class="word-count" id="count-cot">0w</span>
                            <button class="tool-btn" onclick="transferSelection('cot-to-main')" title="Move selected text to Story">
                                <i class="fa-solid fa-arrow-right"></i> Move to Story
                            </button>
                            <button class="tool-btn icon-only" onclick="copyText('editor-cot')"><i class="fa-regular fa-copy"></i></button>
                            <button class="tool-btn icon-only" onclick="$('#editor-cot').val('').trigger('input')"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                    <textarea id="editor-cot" placeholder="Thinking process will appear here...">${parts.cot}</textarea>
                </div>

                <div id="container-story" class="content-container">
                    <div class="toolbar">
                        <span class="info-label">📖 Main Story</span>
                        <div class="tools">
                            <span class="word-count" id="count-main">0w</span>
                            <button class="tool-btn" onclick="transferSelection('main-to-cot')" title="Move selected text to Thinking">
                                <i class="fa-solid fa-arrow-left"></i> Move to Think
                            </button>
                            <button class="tool-btn" id="btn-heal-html"><i class="fa-solid fa-wand-magic-sparkles"></i> Fix HTML</button>
                            <button class="tool-btn icon-only" onclick="copyText('editor-main')"><i class="fa-regular fa-copy"></i></button>
                        </div>
                    </div>
                    <textarea id="editor-main" placeholder="Story content...">${parts.main}</textarea>
                </div>

            </div>

            <div class="healer-footer">
                <div class="footer-status">
                     ${parts.type !== 'none' ? `<span class="tag-badge"><i class="fa-solid fa-check"></i> Auto-Split: ${parts.type}</span>` : ''}
                </div>
                <button id="btn-save-split" class="save-button">
                    <span class="btn-content"><i class="fa-solid fa-floppy-disk"></i> Save & Apply</span>
                </button>
            </div>
        </div>
    </div>
    `;

    $(document.body).append(modalHtml);
    
    // --- Logic UI ---

    // Toggle Function
    window.setMode = function(mode) {
        $('.mode-btn').removeClass('active');
        $('.content-container').removeClass('active');
        
        $(`#mode-${mode}`).addClass('active');
        $(`#container-${mode}`).addClass('active');
    }

    // Transfer Selection (ฟีเจอร์เด็ด: ย้ายข้อความข้ามกล่อง)
    window.transferSelection = function(direction) {
        let sourceId, targetId;
        if (direction === 'cot-to-main') {
            sourceId = 'editor-cot'; targetId = 'editor-main';
        } else {
            sourceId = 'editor-main'; targetId = 'editor-cot';
        }

        const sourceBox = document.getElementById(sourceId);
        const targetBox = document.getElementById(targetId);
        
        const start = sourceBox.selectionStart;
        const end = sourceBox.selectionEnd;
        
        if (start === end) return toastr.warning("Please select text to move first.");

        const text = sourceBox.value;
        const selected = text.substring(start, end);
        const remaining = text.substring(0, start) + text.substring(end);

        // ย้ายไปต่อท้าย (หรือจะแทรกที่ cursor ก็ได้ แต่นี่เอาแบบง่ายก่อน)
        const targetVal = targetBox.value;
        targetBox.value = (direction === 'cot-to-main') ? (targetVal + "\n" + selected).trim() : (selected + "\n" + targetVal).trim();
        sourceBox.value = remaining.trim();

        updateCounts();
        toastr.success("Text moved!");
    }

    window.copyText = function(elementId) {
        const copyText = document.getElementById(elementId);
        copyText.select();
        navigator.clipboard.writeText(copyText.value);
        toastr.success("Copied!");
    }

    const updateCounts = () => {
        $('#count-cot').text(countWords($('#editor-cot').val()) + "w");
        $('#count-main').text(countWords($('#editor-main').val()) + "w");
    };

    $('#editor-cot, #editor-main').on('input', updateCounts);
    updateCounts();

    $('#btn-heal-html').on('click', () => {
        let val = $('#editor-main').val();
        let fixed = healHtmlContent(val);
        $('#editor-main').val(fixed).trigger('input');
        toastr.success("HTML Fixed!");
    });

    $('#btn-save-split').on('click', async () => {
        const cot = $('#editor-cot').val().trim();
        const main = $('#editor-main').val();

        if (/<think>/i.test(main)) {
            if (!confirm("⚠️ <think> tag found in Story. Save anyway?")) return;
        }
        
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
                <div class="styled_description_block">Editor by ${authorConfig.name}</div>
                <div id="html-healer-open-split" class="menu_button">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Open Editor
                </div>
            </div>
        </div>
    </div>`;
    $('#extensions_settings').append(settingsHtml);
    $('#html-healer-open-split').on('click', openSplitEditor);
}

// CSS Style (Toggle Version)
const styles = `
<style>
:root {
    --lav-bg: #1e1b24;
    --lav-panel: #2a2730;
    --lav-accent: #a6b1e1;
    --lav-active: #dcd6f7;
    --lav-text: #f4f4f8;
    --lav-border: rgba(166, 177, 225, 0.2);
}

.html-healer-overlay {
    position: fixed; inset: 0; z-index: 99999;
    background: rgba(0,0,0,0.85); backdrop-filter: blur(5px);
    display: flex; align-items: center; justify-content: center;
}

.html-healer-box {
    width: 90%; max-width: 800px; height: 85vh; /* ทรงสูงขึ้นเหมือน Editor มือถือ */
    background: var(--lav-bg);
    border: 1px solid var(--lav-border); border-radius: 16px;
    display: flex; flex-direction: column; overflow: hidden;
    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
    font-family: 'Segoe UI', sans-serif;
}

/* HEADER & TOGGLE SWITCH */
.healer-header {
    background: var(--lav-panel); padding: 15px;
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 1px solid var(--lav-border); gap: 15px;
}
.header-left-group { display: flex; align-items: center; gap: 10px; }
.header-icon { color: var(--lav-accent); font-size: 1.2em; }
.title { font-weight: bold; color: var(--lav-text); }

.mode-switcher {
    background: rgba(0,0,0,0.3); padding: 4px; border-radius: 25px;
    display: flex; gap: 5px;
}
.mode-btn {
    background: transparent; border: none; color: #888;
    padding: 6px 18px; border-radius: 20px; font-weight: bold; font-size: 0.9em;
    cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 6px;
}
.mode-btn.active {
    background: var(--lav-accent); color: #1a1625;
    box-shadow: 0 2px 8px rgba(166, 177, 225, 0.3);
}

.close-btn { color: #888; cursor: pointer; font-size: 1.2em; padding: 5px; }
.close-btn:hover { color: #ff6b6b; }

/* BODY & CONTAINERS */
.healer-body { flex: 1; position: relative; overflow: hidden; }

.content-container {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    display: none; flex-direction: column; /* Hidden by default */
    background: var(--lav-bg);
}
.content-container.active { display: flex; animation: fadeIn 0.3s ease; }

@keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

.toolbar {
    padding: 10px 20px; background: rgba(255,255,255,0.03);
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 1px solid var(--lav-border);
}
.info-label { color: var(--lav-accent); font-weight: bold; font-size: 0.9em; text-transform: uppercase; letter-spacing: 1px; }
.tools { display: flex; align-items: center; gap: 8px; }
.word-count { color: #666; font-size: 0.8em; margin-right: 10px; }

.tool-btn {
    background: rgba(255,255,255,0.1); border: 1px solid transparent;
    color: var(--lav-text); padding: 5px 12px; border-radius: 6px;
    font-size: 0.85em; cursor: pointer; display: flex; align-items: center; gap: 6px;
}
.tool-btn:hover { background: var(--lav-accent); color: #1a1625; }
.tool-btn.icon-only { padding: 5px 8px; }

textarea {
    flex: 1; width: 100%; border: none; background: transparent;
    color: var(--lav-text); padding: 20px; resize: none; outline: none;
    font-family: inherit; line-height: 1.6; font-size: 16px;
}
textarea::placeholder { color: rgba(255,255,255,0.15); }

/* FOOTER */
.healer-footer {
    padding: 15px 20px; background: var(--lav-panel);
    border-top: 1px solid var(--lav-border);
    display: flex; justify-content: space-between; align-items: center;
    padding-bottom: max(15px, env(safe-area-inset-bottom));
}
.tag-badge { font-size: 0.8em; color: var(--lav-active); background: rgba(166, 177, 225, 0.1); padding: 4px 8px; border-radius: 6px; }

.save-button {
    background: linear-gradient(135deg, var(--lav-accent), #8e84d6);
    color: #1a1625; border: none; padding: 10px 30px; border-radius: 25px;
    font-weight: bold; cursor: pointer; box-shadow: 0 4px 15px rgba(166, 177, 225, 0.3);
}

/* MOBILE RESPONSIVE */
@media screen and (max-width: 600px) {
    .html-healer-box { width: 100%; height: 100dvh; border-radius: 0; }
    .header-text, .header-left-group { display: none; } /* ซ่อนชื่อแอพในมือถือเพื่อที่ */
    .healer-header { justify-content: center; position: relative; }
    .header-controls { position: absolute; right: 15px; }
    .mode-switcher { width: auto; }
}
</style>
`;
$('head').append(styles);

jQuery(async () => {
    loadSettings();
    console.log(`[${extensionName}] Ready (Toggle Mode).`);
});
