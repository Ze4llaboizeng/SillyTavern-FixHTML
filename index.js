const extensionName = "html-healer";

// --- 1. Logic (Smart Segment Healer) ---

function splitContent(rawText) {
    let cleanText = rawText
        .replace(/&lt;think&gt;/gi, "<think>")
        .replace(/&lt;\/think&gt;/gi, "</think>");

    // 1. ดึง CoT ที่สมบูรณ์ทั้งหมด (รองรับหลายช่วง)
    let cots = [];
    let mainText = cleanText;
    const thinkRegex = /<think>([\s\S]*?)<\/think>/gi;
    let match;
    
    // วนลูปหาทุก Tag ที่ปิดสมบูรณ์
    while ((match = thinkRegex.exec(cleanText)) !== null) {
        cots.push(match[1].trim());
    }

    // ลบ CoT ที่เจอออกเพื่อเตรียมตรวจ Tag ค้าง
    if (cots.length > 0) {
        mainText = mainText.replace(thinkRegex, "").trim();
    }

    // 2. ตรวจหา Tag ที่เปิดค้างไว้ (Broken Tag) ในส่วนที่เหลือ
    // เช่นพิมพ์ <think> แล้วตัดจบเลย
    const stopPhrases = [
        "Close COT", "CLOSE COT", "close cot", "Close of CoT",
        "End of thought", "Analysis complete"
    ];
    const stopRegex = new RegExp(`(${stopPhrases.join("|")})`, "i");
    const openIndex = mainText.search(/<think>/i);

    if (openIndex !== -1) {
        const afterOpen = mainText.substring(openIndex + 7);
        const stopMatch = afterOpen.match(stopRegex);
        
        if (stopMatch) {
            // เจอคำสั่งปิด แต่ไม่มี tag ปิด
            const cutPoint = stopMatch.index + stopMatch[0].length;
            cots.push(afterOpen.substring(0, cutPoint).trim());
            mainText = mainText.substring(0, openIndex) + afterOpen.substring(cutPoint); // ตัด CoT ออกแล้วเชื่อมข้อความ
        } else {
            // ไม่เจอคำสั่งปิดเลย (ค้างเติ่ง)
            cots.push(afterOpen.trim());
            mainText = mainText.substring(0, openIndex).trim(); // เนื้อเรื่องคือส่วนก่อนหน้า
        }
    }

    // Return ผลลัพธ์
    if (cots.length > 0) {
        return {
            type: "multi_match", // แจ้งว่าเป็นแบบเจอหลายจุด
            cot: cots.join("\n\n---\n\n"), // รวมความคิดด้วยเส้นคั่น
            main: mainText.trim()
        };
    }

    return { type: "none", cot: "", main: cleanText };
}

function healHtmlContent(htmlContent) {
    if (!htmlContent) return "";

    // Pre-fix: แก้ Tag ที่พิมพ์ผิดรูปแบบบ่อยๆ ก่อน
    let processed = htmlContent
        .replace(/<\s*\/\s*([a-zA-Z0-9]+)>/g, "</$1>") // แก้ </ div> เป็น </div>
        .replace(/<([a-zA-Z0-9]+)([^>]*?)\s*\/?>/g, (match) => match); // Normalize เบื้องต้น

    // ⭐ Smart Segment Logic: แยกซ่อมทีละย่อหน้า
    // เพื่อป้องกัน Tag บรรทัดบน กินรวบข้อความบรรทัดล่าง
    const blocks = processed.split(/\n{2,}/); // แยกด้วย Double Newline
    const parser = new DOMParser();
    
    const healedBlocks = blocks.map(block => {
        // ถ้าไม่มีเครื่องหมาย < เลย แสดงว่าเป็น text ล้วน ไม่ต้องซ่อม (ประหยัด resource)
        if (!block.includes('<')) return block;

        // แปลง HTML เฉพาะส่วนนี้
        const doc = parser.parseFromString(block, 'text/html');
        
        // ลบ Script ผี
        const scripts = doc.getElementsByTagName('script');
        for (let i = scripts.length - 1; i >= 0; i--) {
            scripts[i].parentNode.removeChild(scripts[i]);
        }
        
        // ส่งคืน HTML ที่ Browser ซ่อมปิด Tag ให้แล้ว (เฉพาะในย่อหน้านี้)
        return doc.body.innerHTML;
    });

    return healedBlocks.join('\n\n'); // ต่อกลับด้วยการเว้นบรรทัด
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
    const parts = splitContent(originalText);

    if (parts.type === "multi_match") {
        toastr.info(`Detected ${parts.cot.split('---').length} thinking segments.`);
    }

    const modalHtml = `
    <div id="html-healer-modal" class="html-healer-overlay">
        <div class="html-healer-box">
            
            <div class="healer-header">
                <div class="header-brand">
                    <div class="header-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
                    <div class="header-text">
                        <span class="title">Lavender Editor</span>
                        <span class="subtitle">Segment-Aware Healer</span>
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

            <div class="mobile-tabs">
                <button class="tab-btn active" onclick="switchTab('edit')">
                    <i class="fa-solid fa-pen-nib"></i> Editor
                </button>
                <button class="tab-btn" onclick="switchTab('preview')">
                    <i class="fa-solid fa-eye"></i> Preview
                </button>
            </div>
            
            <div class="healer-body">
                <div id="view-editor" class="view-section active">
                    
                    <div class="editor-group think-group">
                        <div class="group-toolbar">
                            <span class="label"><i class="fa-solid fa-brain"></i> Thinking Process</span>
                            <div class="toolbar-actions">
                                <span class="word-count" id="count-cot">0 words</span>
                                <button class="action-btn" onclick="copyText('editor-cot')" title="Copy"><i class="fa-regular fa-copy"></i></button>
                                <button class="action-btn" onclick="$('#editor-cot').val('').trigger('input')" title="Clear"><i class="fa-solid fa-eraser"></i></button>
                            </div>
                        </div>
                        <textarea id="editor-cot" placeholder="Thinking content...">${parts.cot}</textarea>
                    </div>

                    <div class="editor-group main-group">
                        <div class="group-toolbar">
                            <span class="label"><i class="fa-solid fa-comments"></i> Story Content</span>
                            <div class="toolbar-actions">
                                <span class="word-count" id="count-main">0 words</span>
                                <button class="action-btn" id="btn-heal-html" title="Fix HTML"><i class="fa-solid fa-wrench"></i> Smart Fix</button>
                                <button class="action-btn" onclick="copyText('editor-main')" title="Copy"><i class="fa-regular fa-copy"></i></button>
                            </div>
                        </div>
                        <textarea id="editor-main" placeholder="Story content...">${parts.main}</textarea>
                    </div>
                </div>

                <div id="view-preview" class="view-section">
                    <div class="preview-wrapper">
                        <div class="preview-header-label">Live Preview</div>
                        <div id="healer-preview-box" class="markdown-body"></div>
                    </div>
                </div>
            </div>

            <div class="healer-footer">
                <div class="footer-status">
                     ${parts.type !== 'none' ? '<span class="tag-badge"><i class="fa-solid fa-layer-group"></i> Multi-Segment</span>' : ''}
                </div>
                <button id="btn-save-split" class="save-button">
                    <span class="btn-content"><i class="fa-solid fa-floppy-disk"></i> Save Changes</span>
                </button>
            </div>
        </div>
    </div>
    `;

    $(document.body).append(modalHtml);
    
    // --- Logic & Events ---
    window.copyText = function(elementId) {
        const copyText = document.getElementById(elementId);
        copyText.select();
        copyText.setSelectionRange(0, 99999);
        navigator.clipboard.writeText(copyText.value);
        toastr.success("Copied!");
    }

    window.switchTab = function(tabName) {
        $('.tab-btn').removeClass('active');
        $('.view-section').removeClass('active');
        if (tabName === 'edit') {
            $('.tab-btn:first-child').addClass('active');
            $('#view-editor').addClass('active');
        } else {
            $('.tab-btn:last-child').addClass('active');
            $('#view-preview').addClass('active');
            updatePreview();
        }
    }

    const updatePreview = () => {
        const cot = $('#editor-cot').val() || "";
        const main = $('#editor-main').val() || "";
        
        $('#count-cot').text(countWords(cot) + " words");
        $('#count-main').text(countWords(main) + " words");

        let previewHtml = "";
        if (cot.trim()) {
            previewHtml += `
            <div class="preview-think-bubble">
                <div class="bubble-icon"><i class="fa-solid fa-lightbulb"></i></div>
                <div class="bubble-content">${cot.replace(/\n/g, "<br>")}</div>
            </div>`;
        }
        previewHtml += `<div class="preview-main">${main}</div>`;
        $('#healer-preview-box').html(previewHtml);
    };

    $('#editor-cot, #editor-main').on('input', updatePreview);
    updatePreview();

    // ปุ่มซ่อม HTML แบบใหม่
    $('#btn-heal-html').on('click', () => {
        let val = $('#editor-main').val();
        let fixed = healHtmlContent(val);
        $('#editor-main').val(fixed).trigger('input');
        toastr.success("Smart Segment Fix Applied!");
    });

    $('#btn-save-split').on('click', async () => {
        const cot = $('#editor-cot').val().trim();
        const main = $('#editor-main').val();

        if (/<think>/i.test(main)) {
            if (!confirm("⚠️ Found <think> tag in Main Story. Save anyway?")) return;
        }
        
        let finalMes = "";
        if (cot) finalMes += `<think>\n${cot}\n</think>\n`;
        finalMes += main;

        if (chat[targetMessageId].mes !== finalMes) {
            chat[targetMessageId].mes = finalMes;
            await context.saveChat();
            await context.reloadCurrentChat();
            toastr.success("Message updated!");
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
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Open Lavender Editor
                </div>
            </div>
        </div>
    </div>`;
    $('#extensions_settings').append(settingsHtml);
    $('#html-healer-open-split').on('click', openSplitEditor);
}

// --- CSS (Lavender Theme) ---
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
    --lavender-text-muted: #9ca3af;
}

.html-healer-box * { box-sizing: border-box; transition: all 0.2s ease; }
.html-healer-overlay {
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; height: 100dvh;
    z-index: 99999; background: rgba(15, 12, 20, 0.85);
    display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(8px);
}

.html-healer-box {
    width: 90%; max-width: 1100px; height: 85vh;
    background: var(--lavender-darker);
    border: 1px solid var(--lavender-border);
    border-radius: 16px;
    display: flex; flex-direction: column;
    box-shadow: 0 0 40px rgba(166, 177, 225, 0.1);
    overflow: hidden;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.healer-header {
    background: var(--lavender-dark);
    padding: 15px 25px;
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 1px solid var(--lavender-border);
}
.header-brand { display: flex; gap: 12px; align-items: center; }
.header-icon { 
    width: 36px; height: 36px; background: var(--lavender-glass); 
    border-radius: 10px; color: var(--lavender-secondary);
    display: flex; align-items: center; justify-content: center; font-size: 1.2em;
}
.header-text { display: flex; flex-direction: column; }
.header-text .title { font-weight: bold; font-size: 1.1em; color: var(--lavender-text); letter-spacing: 0.5px; }
.header-text .subtitle { font-size: 0.75em; color: var(--lavender-secondary); }

.header-controls { display: flex; align-items: center; gap: 15px; }
.author-pill { 
    display: flex; align-items: center; gap: 8px; 
    background: var(--lavender-glass); padding: 4px 12px; 
    border-radius: 20px; font-size: 0.85em; color: var(--lavender-text-muted);
}
.author-pill img { width: 20px; height: 20px; border-radius: 50%; }

.close-btn {
    width: 32px; height: 32px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; color: var(--lavender-text-muted);
    background: transparent;
}
.close-btn:hover { background: rgba(255, 99, 99, 0.2); color: #ff6b6b; transform: rotate(90deg); }

.healer-body { flex: 1; display: flex; overflow: hidden; background: linear-gradient(180deg, var(--lavender-darker) 0%, #15121a 100%); }
.view-section { flex: 1; display: flex; flex-direction: column; padding: 20px; gap: 20px; overflow-y: auto; }

.editor-group {
    display: flex; flex-direction: column; flex: 1; min-height: 200px;
    background: rgba(0,0,0,0.2); border-radius: 12px;
    border: 1px solid var(--lavender-border);
    overflow: hidden;
}
.editor-group:focus-within { border-color: var(--lavender-secondary); box-shadow: 0 0 15px var(--lavender-glass); }

.group-toolbar {
    padding: 8px 15px; background: rgba(255,255,255,0.03);
    border-bottom: 1px solid var(--lavender-border);
    display: flex; justify-content: space-between; align-items: center;
}
.group-toolbar .label { font-weight: 600; font-size: 0.9em; color: var(--lavender-secondary); display: flex; gap: 8px; align-items: center; }
.toolbar-actions { display: flex; align-items: center; gap: 10px; }
.word-count { font-size: 0.75em; color: var(--lavender-text-muted); margin-right: 5px; }

.action-btn {
    background: transparent; border: none; color: var(--lavender-text-muted);
    cursor: pointer; padding: 4px; border-radius: 4px; font-size: 0.9em;
}
.action-btn:hover { color: var(--lavender-primary); background: var(--lavender-glass); }

textarea {
    flex: 1; width: 100%; border: none; background: transparent;
    color: var(--lavender-text); padding: 15px; resize: none; outline: none;
    font-family: inherit; line-height: 1.6; font-size: 0.95em;
}
textarea::placeholder { color: rgba(255,255,255,0.2); }

#view-preview { border-left: 1px solid var(--lavender-border); background: rgba(0,0,0,0.1); }
.preview-wrapper { 
    height: 100%; display: flex; flex-direction: column; 
    background: var(--lavender-dark); border-radius: 12px; border: 1px solid var(--lavender-border);
    overflow: hidden;
}
.preview-header-label {
    padding: 10px 15px; background: rgba(255,255,255,0.02);
    color: var(--lavender-text-muted); font-size: 0.8em; text-transform: uppercase; letter-spacing: 1px;
}
#healer-preview-box { padding: 20px; overflow-y: auto; flex: 1; color: var(--lavender-text); }

.preview-think-bubble {
    background: rgba(166, 177, 225, 0.08); border-radius: 8px;
    padding: 15px; margin-bottom: 20px; border-left: 3px solid var(--lavender-secondary);
    display: flex; gap: 12px;
}
.bubble-icon { color: var(--lavender-secondary); margin-top: 2px; }
.bubble-content { font-style: italic; color: #d0d5e8; font-size: 0.95em; line-height: 1.5; }

.healer-footer {
    padding: 15px 25px; background: var(--lavender-dark);
    border-top: 1px solid var(--lavender-border);
    display: flex; justify-content: space-between; align-items: center;
    padding-bottom: max(15px, env(safe-area-inset-bottom));
}

.save-button {
    background: linear-gradient(135deg, var(--lavender-secondary), #8e84d6);
    color: #1a1625; border: none; padding: 10px 30px;
    border-radius: 25px; font-weight: bold; cursor: pointer;
    box-shadow: 0 4px 15px rgba(166, 177, 225, 0.3);
}
.save-button:hover { transform: translateY(-2px); filter: brightness(1.1); }
.tag-badge { background: rgba(255, 183, 178, 0.15); color: var(--lavender-accent); padding: 4px 10px; border-radius: 12px; font-size: 0.8em; font-weight: bold; border: 1px solid rgba(255, 183, 178, 0.2); }

.mobile-tabs { display: none; padding: 10px; gap: 10px; background: var(--lavender-darker); }
.tab-btn {
    flex: 1; padding: 10px; border-radius: 8px; border: 1px solid var(--lavender-border);
    background: transparent; color: var(--lavender-text-muted); font-weight: 600; cursor: pointer;
}
.tab-btn.active { background: var(--lavender-glass); color: var(--lavender-secondary); border-color: var(--lavender-secondary); }

@media screen and (max-width: 768px) {
    .html-healer-box { width: 100%; height: 100dvh; border-radius: 0; border: none; }
    .header-brand { display: none; }
    .author-pill { display: none; }
    .healer-header { justify-content: flex-end; padding: 10px; height: 50px; }
    .close-btn { background: rgba(255,255,255,0.05); }
    
    .mobile-tabs { display: flex; }
    .view-section { display: none; padding: 10px; }
    .view-section.active { display: flex; }
    #view-preview { border-left: none; }
    
    .editor-group { min-height: 40%; }
    .save-button { width: 100%; padding: 12px; }
}

@media screen and (min-width: 769px) {
    .healer-body { flex-direction: row; }
}
</style>
`;
$('head').append(styles);

jQuery(async () => {
    loadSettings();
    console.log(`[${extensionName}] Ready (Lavender + Segment Fix).`);
});
