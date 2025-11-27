const extensionName = "html-healer";

// --- 1. Logic ---
function splitContent(rawText) {
    let cleanText = rawText
        .replace(/&lt;think&gt;/gi, "<think>")
        .replace(/&lt;\/think&gt;/gi, "</think>");

    const match = cleanText.match(/<think>([\s\S]*?)<\/think>/i);
    if (match) {
        return {
            type: "tag_match",
            cot: match[1].trim(),
            main: cleanText.replace(match[0], "").trim()
        };
    }

    const stopPhrases = [
        "Close COT", "CLOSE COT", "close cot","Close of CoT",
        "End of thought", "Analysis complete", 
        "Thinking process end", "Reasoning finished"
    ];
    const stopRegex = new RegExp(`(${stopPhrases.join("|")})`, "i");

    const openIndex = cleanText.search(/<think>/i);
    if (openIndex !== -1) {
        const afterOpen = cleanText.substring(openIndex + 7);
        const stopMatch = afterOpen.match(stopRegex);
        
        if (stopMatch) {
            const cutPoint = stopMatch.index + stopMatch[0].length;
            return {
                type: "phrase_split",
                cot: afterOpen.substring(0, cutPoint).trim(),
                main: afterOpen.substring(cutPoint).trim()
            };
        } else {
            return {
                type: "broken_tag",
                cot: afterOpen.trim(),
                main: ""
            };
        }
    }

    const phraseMatch = cleanText.match(stopRegex);
    if (phraseMatch) {
        const cutPoint = phraseMatch.index + phraseMatch[0].length;
        return {
            type: "phrase_split",
            cot: cleanText.substring(0, cutPoint).trim(),
            main: cleanText.substring(cutPoint).trim()
        };
    }

    return { type: "none", cot: "", main: cleanText };
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

// --- 2. UI Builder ---
let targetMessageId = null;

// ⭐ME⭐
const authorConfig = {
    name: "Zealllll",
    // 🔴 แก้ Path ให้ตรงกับโฟลเดอร์จริง (เพิ่ม -main ตามชื่อไฟล์ zip)
    avatarUrl: "scripts/extensions/third-party/SillyTavern-FixHTML-main/avatar.png"
};

function openSplitEditor() {
    const context = SillyTavern.getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return toastr.warning("No messages to fix.");

    const lastIndex = chat.length - 1;
    targetMessageId = lastIndex;
    const originalText = chat[lastIndex].mes;
    const parts = splitContent(originalText);

    if (parts.type === "phrase_split") {
        toastr.info("ระบบแยกกล่องให้อัตโนมัติครับ");
    }

    const modalHtml = `
    <div id="html-healer-modal" class="html-healer-overlay">
        <div class="html-healer-box">
            
            <div class="healer-header">
                <div class="header-left">
                    <div class="header-title">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> Magic Editor
                    </div>
                    <div class="author-badge desktop-only">
                        <img src="${authorConfig.avatarUrl}" class="author-img" onerror="this.style.display='none'">
                        <span>by ${authorConfig.name}</span>
                    </div>
                </div>

                <div class="mobile-tabs">
                    <button class="tab-btn active" onclick="switchTab('edit')"><i class="fa-solid fa-pen"></i> แก้ไข</button>
                    <button class="tab-btn" onclick="switchTab('preview')"><i class="fa-solid fa-eye"></i> ตัวอย่าง</button>
                </div>
                
                <div class="close-btn" onclick="$('#html-healer-modal').remove()">✖</div>
            </div>
            
            <div class="healer-body">
                <div id="view-editor" class="view-section active">
                    <div class="input-container think-theme">
                        <div class="input-label">
                            <span>🧠 ความคิด (Thinking)</span>
                            <span class="tip">ระบบแยกให้แล้ว</span>
                        </div>
                        <textarea id="editor-cot" placeholder="ยังไม่มีความคิด...">${parts.cot}</textarea>
                    </div>

                    <div class="input-container main-theme">
                        <div class="input-label">
                            <span>💬 เนื้อเรื่อง (Story)</span>
                            <div class="tools">
                                <button class="tool-btn" id="btn-heal-html"><i class="fa-solid fa-wrench"></i> ซ่อม HTML</button>
                            </div>
                        </div>
                        <textarea id="editor-main" placeholder="เนื้อเรื่อง...">${parts.main}</textarea>
                    </div>
                </div>

                <div id="view-preview" class="view-section">
                    <div class="preview-container">
                        <div id="healer-preview-box"></div>
                    </div>
                </div>
            </div>

            <div class="healer-footer">
                <div class="author-badge mobile-only">
                    <img src="${authorConfig.avatarUrl}" class="author-img" onerror="this.style.display='none'">
                    <span>by ${authorConfig.name}</span>
                </div>

                <div class="status-bar" id="healer-status">
                    ${parts.type === 'phrase_split' ? '⚡ Auto-Split Active' : ''}
                </div>
                <button id="btn-save-split" class="save-button">
                    <i class="fa-solid fa-floppy-disk"></i> บันทึก
                </button>
            </div>
        </div>
    </div>
    `;

    $(document.body).append(modalHtml);
    
    // --- Logic UI ---
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
        const cot = $('#editor-cot').val().trim();
        const main = $('#editor-main').val();
        let previewHtml = "";
        
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

    $('#editor-cot, #editor-main').on('input', () => {
        if (window.innerWidth > 768) updatePreview();
    });
    updatePreview();

    $('#btn-heal-html').on('click', () => {
        let val = $('#editor-main').val();
        let fixed = healHtmlContent(val);
        $('#editor-main').val(fixed);
        toastr.success("HTML Repaired!");
        updatePreview();
    });

    $('#btn-save-split').on('click', async () => {
        const cot = $('#editor-cot').val().trim();
        const main = $('#editor-main').val();

        if (/<think>/i.test(main)) {
            if (!confirm("⚠️ ยังมีคำว่า <think> ในกล่องเนื้อเรื่อง ยืนยันบันทึก?")) return;
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
                <b>HTML & CoT Healer</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="styled_description_block">Editor with Author Credit.</div>
                <div id="html-healer-open-split" class="menu_button">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Open Magic Editor
                </div>
            </div>
        </div>
    </div>`;
    $('#extensions_settings').append(settingsHtml);
    $('#html-healer-open-split').on('click', openSplitEditor);
}

// --- CSS ---
const styles = `
<style>
/* CORE */
.html-healer-box * { box-sizing: border-box; }
.html-healer-overlay {
    position: fixed !important; top: 0; left: 0; width: 100vw; 
    /* 🔴 แก้ไข: ใช้ dvh เพื่อให้เต็มจอจริงในมือถือ (ไม่โดนแถบ URL บัง) */
    height: 100vh; height: 100dvh; 
    z-index: 99999 !important; background: rgba(0,0,0,0.85);
    display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(4px);
}

.html-healer-box {
    width: 95%; max-width: 1200px; height: 90vh;
    background: var(--smart-background-color, #1e1e1e);
    border: 1px solid #444; border-radius: 12px;
    display: flex; flex-direction: column;
    box-shadow: 0 0 50px rgba(0,0,0,0.6);
    overflow: hidden;
}

/* HEADER & AUTHOR BADGE */
.healer-header {
    background: #252525; padding: 10px 15px;
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 1px solid #444; height: 60px; flex-shrink: 0;
}
.header-left { display: flex; align-items: center; gap: 15px; }
.header-title { font-size: 1.2em; font-weight: bold; color: #fff; display: flex; align-items: center; gap: 10px; }

/* Author Style */
.author-badge {
    display: flex; align-items: center; gap: 8px;
    background: rgba(255, 255, 255, 0.1);
    padding: 4px 10px; border-radius: 20px;
    font-size: 0.8em; color: #aaa; border: 1px solid rgba(255,255,255,0.1);
    white-space: nowrap; 
}
.author-img {
    width: 20px; height: 20px; border-radius: 50%; object-fit: cover;
    border: 1px solid #666;
}

.close-btn { font-size: 1.5em; cursor: pointer; color: #ff6b6b; padding: 0 10px; }

.mobile-tabs { display: none; gap: 8px; background: #333; padding: 4px; border-radius: 20px; }
.tab-btn {
    background: transparent; border: none; color: #aaa;
    padding: 6px 14px; border-radius: 16px; cursor: pointer; font-weight: bold; font-size: 0.9em;
}
.tab-btn.active { background: var(--smart-theme-color, #6a5acd); color: white; }

/* BODY */
.healer-body { flex: 1; overflow: hidden; position: relative; display: flex; }
.view-section { 
    flex: 1; display: flex; flex-direction: column; padding: 15px; gap: 15px; overflow-y: auto; 
    height: 100%;
}

.input-container {
    display: flex; flex-direction: column; flex: 1;
    border-radius: 8px; padding: 2px;
}
.input-container.think-theme { border: 2px solid #6a5acd; background: rgba(106, 90, 205, 0.05); }
.input-container.main-theme { border: 2px solid #444; }

.input-label {
    padding: 8px 12px; font-weight: bold; color: #ddd;
    display: flex; justify-content: space-between; align-items: center;
    background: rgba(0,0,0,0.2); border-radius: 6px 6px 0 0;
}
.input-label .tip { font-size: 0.75em; color: #aaa; font-weight: normal; }
.tool-btn {
    background: #444; border: none; color: white; border-radius: 4px;
    padding: 4px 10px; font-size: 0.8em; cursor: pointer; display: flex; gap: 5px; align-items: center;
}
.tool-btn:hover { background: #555; }

textarea {
    flex: 1; width: 100%; border: none; background: transparent;
    color: var(--smart-text-color, #eee); padding: 12px; resize: none;
    font-family: monospace; font-size: 14px; outline: none; line-height: 1.5;
}

.preview-container { 
    height: 100%; overflow-y: auto; background: rgba(0,0,0,0.2); 
    border-radius: 8px; padding: 20px; border: 1px solid #444; 
}
.preview-think-bubble {
    background: rgba(106, 90, 205, 0.1); border-left: 4px solid #6a5acd;
    padding: 15px; margin-bottom: 20px; border-radius: 4px;
    color: #ccc; font-style: italic;
}
.bubble-label { 
    font-weight: bold; color: #6a5acd; font-style: normal; 
    font-size: 0.8em; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.5px;
}
.preview-main { color: var(--smart-text-color, #eee); line-height: 1.6; }

/* FOOTER */
.healer-footer {
    height: auto; min-height: 60px; /* ยืดหยุ่นได้ */
    background: #252525; border-top: 1px solid #444;
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 15px; flex-shrink: 0; gap: 10px;
    /* 🔴 รองรับ iPhone รุ่นใหม่ที่มีขีดล่าง */
    padding-bottom: max(10px, env(safe-area-inset-bottom));
}
.status-bar { font-size: 0.9em; color: #ffab40; font-weight: 500; margin-left: auto; margin-right: 15px;}
.save-button {
    background: var(--smart-theme-color, #4caf50); color: white;
    border: none; padding: 10px 30px; border-radius: 20px;
    font-weight: bold; font-size: 1em; cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    white-space: nowrap; flex-shrink: 0;
}
.save-button:hover { filter: brightness(1.1); transform: translateY(-2px); }

/* VISIBILITY UTILS */
.desktop-only { display: flex; }
.mobile-only { display: none; }

/* --- MOBILE TWEAKS (แก้ใหม่) --- */
@media screen and (max-width: 768px) {
    /* 🔴 ปรับกล่องให้เต็มจอแบบ 100dvh (Dynamic Viewport Height) */
    .html-healer-box { 
        width: 100%; height: 100dvh; 
        border-radius: 0; border: none; 
    }
    
    /* Header: ซ่อนฝั่งซ้ายทิ้งไปเลย เพื่อให้ Tabs ชิดซ้าย */
    .header-left { display: none !important; } 
    .header-title { display: none; }
    .desktop-only { display: none; }
    
    /* Show Mobile Tabs */
    .mobile-tabs { display: flex; }
    
    /* Body & Layout */
    .view-section { display: none; padding: 10px; }
    .view-section.active { display: flex; }
    .input-container { min-height: 40%; }
    
    /* Fonts & Inputs */
    textarea { font-size: 16px; } /* 16px ป้องกัน iOS Zoom */
    
    /* Footer & Badge */
    /* 🔴 บังคับให้ badge แสดงผลใน footer และจัด layout ให้สวย */
    .mobile-only { 
        display: flex !important; 
        align-items: center;
        margin-right: auto; 
        max-width: 50%; 
        overflow: hidden; 
    }
    
    .author-badge { padding: 4px 8px; font-size: 0.75em; } 
    .save-button { padding: 8px 16px; font-size: 0.9em; } 
    .status-bar { display: none; }
}

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
    console.log(`[${extensionName}] Ready (Author Badge Version).`);
});
