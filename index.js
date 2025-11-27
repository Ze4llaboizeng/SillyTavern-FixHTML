const extensionName = "html-healer";

// --- 1. Logic การแยกส่วน (หลังบ้าน) ---
function splitContent(rawText) {
    // ล้างรหัส HTML encode ที่อาจติดมา
    let cleanText = rawText
        .replace(/&lt;think&gt;/gi, "<think>")
        .replace(/&lt;\/think&gt;/gi, "</think>");

    // แยกหา Think Tag
    const match = cleanText.match(/<think>([\s\S]*?)<\/think>/i);
    if (match) {
        return {
            cot: match[1].trim(), // เนื้อหาในหัว (ไม่มีแท็ก)
            main: cleanText.replace(match[0], "").trim() // เนื้อเรื่องหลัก
        };
    }
    // กรณีมีแต่ตัวเปิด ไม่มีตัวปิด
    const openIndex = cleanText.search(/<think>/i);
    if (openIndex !== -1) {
        return {
            cot: cleanText.substring(openIndex + 7).trim(),
            main: cleanText.substring(0, openIndex).trim()
        };
    }
    // ไม่เจออะไรเลย
    return { cot: "", main: cleanText };
}

function healHtmlContent(htmlContent) {
    if (!htmlContent) return "";
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const scripts = doc.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
        scripts[i].parentNode.removeChild(scripts[i]);
    }
    return doc.body.innerHTML;
}

// --- 2. สร้างหน้าต่าง UI (Friendly Version) ---
let targetMessageId = null;

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
                <div class="header-title">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Magic Editor
                </div>
                <div class="mobile-tabs">
                    <button class="tab-btn active" onclick="switchTab('edit')"><i class="fa-solid fa-pen"></i> Edit</button>
                    <button class="tab-btn" onclick="switchTab('preview')"><i class="fa-solid fa-eye"></i> View</button>
                </div>
                <div class="close-btn" onclick="$('#html-healer-modal').remove()">✖</div>
            </div>
            
            <div class="healer-body">
                
                <div id="view-editor" class="view-section active">
                    <div class="input-container think-theme">
                        <div class="input-label">
                            <span>🧠 ความคิดในใจ (Thinking)</span>
                            <span class="tip">ไม่ต้องพิมพ์ &lt;think&gt; ใส่แค่ข้อความ</span>
                        </div>
                        <textarea id="editor-cot" placeholder="ตัวละครกำลังคิดอะไรอยู่...">${parts.cot}</textarea>
                    </div>

                    <div class="input-container main-theme">
                        <div class="input-label">
                            <span>💬 เนื้อเรื่อง / บทพูด (Story)</span>
                            <div class="tools">
                                <button class="tool-btn" id="btn-heal-html" title="ซ่อม HTML ที่พัง"><i class="fa-solid fa-screwdriver-wrench"></i> Auto-Fix HTML</button>
                            </div>
                        </div>
                        <textarea id="editor-main" placeholder="เนื้อเรื่องบรรยาย...">${parts.main}</textarea>
                    </div>
                </div>

                <div id="view-preview" class="view-section">
                    <div class="preview-container">
                        <div id="healer-preview-box"></div>
                    </div>
                </div>

            </div>

            <div class="healer-footer">
                <div class="status-bar" id="healer-status">พร้อมใช้งาน</div>
                <button id="btn-save-split" class="save-button">
                    <i class="fa-solid fa-floppy-disk"></i> บันทึก (Save)
                </button>
            </div>
        </div>
    </div>
    `;

    $(document.body).append(modalHtml);
    
    // --- Logic การทำงาน ---

    // ฟังก์ชันสลับแท็บ (สำหรับมือถือ)
    window.switchTab = function(tabName) {
        $('.tab-btn').removeClass('active');
        $('.view-section').removeClass('active');
        
        if (tabName === 'edit') {
            $('.tab-btn:first-child').addClass('active');
            $('#view-editor').addClass('active');
        } else {
            $('.tab-btn:last-child').addClass('active');
            $('#view-preview').addClass('active');
            updatePreview(); // อัปเดตพรีวิวก่อนโชว์
        }
    }

    const updatePreview = () => {
        const cot = $('#editor-cot').val().trim();
        const main = $('#editor-main').val();
        let previewHtml = "";
        
        // สร้างกล่องจำลองให้เห็นภาพ
        if (cot) {
            previewHtml += `
            <div class="preview-think-bubble">
                <div class="bubble-label">🧠 Thinking Process</div>
                ${cot.replace(/\n/g, "<br>")}
            </div>`;
        }
        previewHtml += `<div class="preview-main">${main}</div>`;
        
        $('#healer-preview-box').html(previewHtml);
    };

    // อัปเดตพรีวิวแบบ Realtime (เฉพาะ PC ที่จอใหญ่เห็นพร้อมกัน)
    $('#editor-cot, #editor-main').on('input', () => {
        if (window.innerWidth > 768) updatePreview();
    });
    // เรียกครั้งแรก
    updatePreview();

    // ปุ่มซ่อม HTML
    $('#btn-heal-html').on('click', () => {
        let val = $('#editor-main').val();
        let fixed = healHtmlContent(val);
        $('#editor-main').val(fixed);
        toastr.success("ซ่อมโครงสร้าง HTML เรียบร้อย!");
        updatePreview();
    });

    // ปุ่มบันทึก
    $('#btn-save-split').on('click', async () => {
        const cot = $('#editor-cot').val().trim();
        const main = $('#editor-main').val();

        // Safety: ถ้าเผลอเอา <think> ไปใส่ในกล่องล่าง
        if (/<think>/i.test(main)) {
            if (!confirm("⚠️ ระบบตรวจเจอคำว่า <think> ในกล่องเนื้อเรื่อง (กล่องล่าง)\nปกติควรย้ายไปกล่องบน\n\nยืนยันจะบันทึกหรือไม่?")) return;
        }
        
        // ประกอบร่าง
        let finalMes = "";
        if (cot) finalMes += `<think>\n${cot}\n</think>\n`;
        finalMes += main;

        if (chat[targetMessageId].mes !== finalMes) {
            chat[targetMessageId].mes = finalMes;
            await context.saveChat();
            await context.reloadCurrentChat();
            toastr.success("บันทึกเรียบร้อย!");
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
                <b>HTML & CoT Healer</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="styled_description_block">Easy Editor for Thinking Process.</div>
                <div id="html-healer-open-split" class="menu_button">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Open Magic Editor
                </div>
            </div>
        </div>
    </div>`;
    $('#extensions_settings').append(settingsHtml);
    $('#html-healer-open-split').on('click', openSplitEditor);
}

// --- 3. CSS (Super Friendly Style) ---
const styles = `
<style>
/* --- CORE --- */
.html-healer-box * { box-sizing: border-box; }
.html-healer-overlay {
    position: fixed !important; top: 0; left: 0; width: 100vw; height: 100vh;
    z-index: 99999 !important; background: rgba(0,0,0,0.85);
    display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(4px);
}

/* กล่องหลัก */
.html-healer-box {
    width: 95%; max-width: 1200px; height: 90vh;
    background: var(--smart-background-color, #1e1e1e);
    border: 1px solid #444; border-radius: 12px;
    display: flex; flex-direction: column;
    box-shadow: 0 0 40px rgba(0,0,0,0.5);
    overflow: hidden;
}

/* --- HEADER --- */
.healer-header {
    background: #252525; padding: 10px 15px;
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 1px solid #444; height: 60px; flex-shrink: 0;
}
.header-title { font-size: 1.2em; font-weight: bold; color: #fff; display: flex; align-items: center; gap: 10px; }
.close-btn { font-size: 1.5em; cursor: pointer; color: #ff6b6b; padding: 0 10px; }

/* Tabs (Mobile Only) */
.mobile-tabs { display: none; gap: 10px; background: #333; padding: 4px; border-radius: 20px; }
.tab-btn {
    background: transparent; border: none; color: #aaa;
    padding: 5px 15px; border-radius: 15px; cursor: pointer; font-weight: bold;
}
.tab-btn.active { background: var(--smart-theme-color, #6a5acd); color: white; }

/* --- BODY --- */
.healer-body { flex: 1; overflow: hidden; position: relative; display: flex; }
.view-section { 
    flex: 1; display: flex; flex-direction: column; padding: 15px; gap: 15px; overflow-y: auto; 
    height: 100%;
}

/* Input Styles */
.input-container {
    display: flex; flex-direction: column; flex: 1;
    border-radius: 8px; padding: 2px;
}
.input-container.think-theme { border: 2px solid #6a5acd; background: rgba(106, 90, 205, 0.05); }
.input-container.main-theme { border: 2px solid #444; }

.input-label {
    padding: 8px 10px; font-weight: bold; color: #ddd;
    display: flex; justify-content: space-between; align-items: center;
    background: rgba(0,0,0,0.2);
}
.input-label .tip { font-size: 0.8em; color: #aaa; font-weight: normal; }
.tool-btn {
    background: #444; border: none; color: white; border-radius: 4px;
    padding: 4px 8px; font-size: 0.8em; cursor: pointer;
}
.tool-btn:hover { background: #666; }

textarea {
    flex: 1; width: 100%; border: none; background: transparent;
    color: var(--smart-text-color, #eee); padding: 10px; resize: none;
    font-family: monospace; font-size: 14px; outline: none;
}

/* Preview Styles */
.preview-container { 
    height: 100%; overflow-y: auto; background: rgba(0,0,0,0.2); 
    border-radius: 8px; padding: 15px; border: 1px solid #444; 
}
.preview-think-bubble {
    background: rgba(106, 90, 205, 0.1); border-left: 4px solid #6a5acd;
    padding: 15px; margin-bottom: 20px; border-radius: 4px;
    color: #ccc; font-style: italic;
}
.bubble-label { 
    font-weight: bold; color: #6a5acd; font-style: normal; 
    font-size: 0.8em; margin-bottom: 5px; text-transform: uppercase; 
}
.preview-main { color: var(--smart-text-color, #eee); line-height: 1.6; }

/* --- FOOTER --- */
.healer-footer {
    height: 60px; background: #252525; border-top: 1px solid #444;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 20px; flex-shrink: 0;
}
.status-bar { font-size: 0.9em; color: #888; }
.save-button {
    background: var(--smart-theme-color, #4caf50); color: white;
    border: none; padding: 10px 25px; border-radius: 20px;
    font-weight: bold; font-size: 1em; cursor: pointer;
    box-shadow: 0 4px 10px rgba(0,0,0,0.3);
}
.save-button:hover { filter: brightness(1.1); transform: translateY(-1px); }

/* --- RESPONSIVE (MOBILE) --- */
@media screen and (max-width: 768px) {
    .html-healer-box { width: 100%; height: 100%; border-radius: 0; border: none; }
    
    /* Show Tabs on Mobile */
    .mobile-tabs { display: flex; }
    .header-title { display: none; } /* Hide title to save space */
    
    /* Hide Sections by default on mobile, show only active */
    .view-section { display: none; }
    .view-section.active { display: flex; }
    
    /* Adjustments */
    .input-container { min-height: 40%; } /* Ensure input boxes are tall enough */
    textarea { font-size: 16px; } /* Prevent Zoom on iOS */
    .save-button { padding: 8px 20px; }
}

/* PC Only: Show both columns */
@media screen and (min-width: 769px) {
    .healer-body { flex-direction: row; }
    .view-section { display: flex !important; width: 50%; }
    #view-preview { border-left: 1px solid #444; }
    .mobile-tabs { display: none !important; }
}
</style>
`;
$('head').append(styles);

jQuery(async () => {
    loadSettings();
    console.log(`[${extensionName}] Ready (User Friendly Version).`);
});
