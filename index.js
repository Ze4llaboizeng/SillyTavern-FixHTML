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

    if (parts.type === "phrase_split") {
        toastr.info("ระบบแยกกล่องให้อัตโนมัติครับ");
    }

    const modalHtml = `
    <div id="html-healer-modal" class="html-healer-overlay">
        <div class="html-healer-box purple-theme">
            
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
                
                <div class="close-btn" id="btn-close-modal" title="Close (Esc)">✖</div>
            </div>
            
            <div class="healer-body">
                <div id="view-editor" class="view-section active">
                    <div class="input-container think-theme">
                        <div class="input-label">
                            <span class="label-text">🧠 ความคิด (Thinking)</span>
                            <div class="tools">
                                <button class="tool-btn icon-only" id="btn-copy-cot" title="Copy Thinking"><i class="fa-regular fa-copy"></i></button>
                                <button class="tool-btn icon-only" id="btn-clear-cot" title="Clear Thinking"><i class="fa-solid fa-eraser"></i></button>
                            </div>
                        </div>
                        <textarea id="editor-cot" placeholder="ยังไม่มีความคิด...">${parts.cot}</textarea>
                    </div>

                    <div class="input-container main-theme">
                        <div class="input-label">
                            <span class="label-text">💬 เนื้อเรื่อง (Story)</span>
                            <div class="tools">
                                <button class="tool-btn icon-only" id="btn-copy-main" title="Copy Story"><i class="fa-regular fa-copy"></i></button>
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
                    <span class="shortcut-hint desktop-only">Tip: Ctrl+Enter to Save, Esc to Close</span>
                    ${parts.type === 'phrase_split' ? ' • ⚡ Auto-Split Active' : ''}
                </div>
                <button id="btn-save-split" class="save-button" title="Save (Ctrl+Enter)">
                    <i class="fa-solid fa-floppy-disk"></i> บันทึก
                </button>
            </div>
        </div>
    </div>
    `;

    $(document.body).append(modalHtml);
    
    // Auto-focus main text for convenience
    setTimeout(() => $('#editor-main').focus(), 100);

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

    // -- Tools --
    $('#btn-heal-html').on('click', () => {
        let val = $('#editor-main').val();
        let fixed = healHtmlContent(val);
        $('#editor-main').val(fixed);
        toastr.success("HTML Repaired!");
        updatePreview();
    });

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            toastr.success("Copied to clipboard!");
        });
    };
    $('#btn-copy-cot').on('click', () => copyToClipboard($('#editor-cot').val()));
    $('#btn-copy-main').on('click', () => copyToClipboard($('#editor-main').val()));
    
    $('#btn-clear-cot').on('click', () => {
        if(confirm("ลบข้อความในส่วน Thinking ทั้งหมด?")) {
            $('#editor-cot').val('');
            updatePreview();
        }
    });

    // -- Save & Close --
    const closeModal = () => $('#html-healer-modal').remove();
    $('#btn-close-modal').on('click', closeModal);

    const saveData = async () => {
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
        closeModal();
    };

    $('#btn-save-split').on('click', saveData);

    // -- Keyboard Shortcuts --
    const handleKeydown = (e) => {
        // Ctrl + Enter to Save
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            saveData();
        }
        // Esc to Close
        if (e.key === 'Escape') {
            e.preventDefault();
            closeModal();
        }
    };
    $(window).on('keydown', handleKeydown);
    
    // Clean up event listener when modal is removed
    const originalRemove = $.fn.remove;
    $('#html-healer-modal').one('remove', function() {
        $(window).off('keydown', handleKeydown);
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

// --- CSS (Updated to Light Purple / Lavender Theme) ---
const styles = `
<style>
/* --- THEME VARIABLES: PASTEL PURPLE --- */
:root {
    --healer-bg: #2b2633;            /* Dark Purple Gray Background */
    --healer-panel-bg: #363040;      /* Slightly Lighter Panel */
    --healer-accent: #b39ddb;        /* Pastel Purple Accent */
    --healer-accent-hover: #d1c4e9;  /* Lighter Accent */
    --healer-text: #ede7f6;          /* Very Light Purple Text */
    --healer-border: #5e5470;        /* Muted Purple Border */
    --healer-think-bg: rgba(103, 58, 183, 0.15);
    --healer-think-border: #9575cd;
}

/* CORE */
.html-healer-box * { box-sizing: border-box; }
.html-healer-overlay {
    position: fixed !important; top: 0; left: 0; width: 100vw; 
    height: 100vh; height: 100dvh; 
    z-index: 99999 !important; background: rgba(20, 15, 25, 0.85); /* Darker overlay */
    display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(5px);
}

.html-healer-box {
    width: 95%; max-width: 1200px; height: 90vh;
    background: var(--healer-bg);
    color: var(--healer-text);
    border: 1px solid var(--healer-border); 
    border-radius: 16px;
    display: flex; flex-direction: column;
    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
    overflow: hidden;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

/* HEADER */
.healer-header {
    background: linear-gradient(90deg, #4a3b69 0%, #363040 100%);
    padding: 0 20px; height: 65px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 1px solid var(--healer-border);
}
.header-title { 
    font-size: 1.3em; font-weight: bold; color: #fff; 
    display: flex; align-items: center; gap: 10px; 
    text-shadow: 0 2px 4px rgba(0,0,0,0.3);
}

/* Author Badge */
.author-badge {
    display: flex; align-items: center; gap: 8px;
    background: rgba(255, 255, 255, 0.15);
    padding: 5px 12px; border-radius: 20px;
    font-size: 0.85em; color: #d1c4e9; border: 1px solid rgba(255,255,255,0.1);
}
.author-img {
    width: 24px; height: 24px; border-radius: 50%; object-fit: cover;
    border: 2px solid rgba(255,255,255,0.3);
}

.close-btn { 
    font-size: 1.2em; cursor: pointer; color: #ffab91; 
    transition: 0.2s; width: 30px; height: 30px; 
    display: flex; align-items: center; justify-content: center;
    border-radius: 50%;
}
.close-btn:hover { background: rgba(255, 255, 255, 0.1); color: #ff8a65; }

/* TABS (Mobile) */
.mobile-tabs { display: none; gap: 8px; background: rgba(0,0,0,0.2); padding: 4px; border-radius: 20px; }
.tab-btn {
    background: transparent; border: none; color: #aaa;
    padding: 6px 16px; border-radius: 16px; cursor: pointer; font-weight: bold; font-size: 0.9em;
}
.tab-btn.active { background: var(--healer-accent); color: #2b2633; box-shadow: 0 2px 5px rgba(0,0,0,0.2); }

/* BODY */
.healer-body { flex: 1; overflow: hidden; position: relative; display: flex; background: var(--healer-bg); }
.view-section { 
    flex: 1; display: flex; flex-direction: column; padding: 20px; gap: 15px; overflow-y: auto; 
    height: 100%;
}

.input-container {
    display: flex; flex-direction: column; flex: 1;
    border-radius: 12px; overflow: hidden;
    background: var(--healer-panel-bg);
    border: 1px solid var(--healer-border);
    transition: border-color 0.2s;
}
.input-container:focus-within { border-color: var(--healer-accent); }

/* Special Themes */
.input-container.think-theme { 
    border: 1px solid var(--healer-think-border); 
    background: rgba(45, 40, 60, 0.5);
}
.input-container.think-theme .input-label { background: rgba(103, 58, 183, 0.2); color: #d1c4e9; }
.input-container.main-theme .input-label { background: rgba(0,0,0,0.2); }

.input-label {
    padding: 10px 15px; font-weight: bold; color: var(--healer-text);
    display: flex; justify-content: space-between; align-items: center;
    font-size: 0.9em; letter-spacing: 0.5px;
}
.tools { display: flex; gap: 8px; }
.tool-btn {
    background: rgba(255,255,255,0.1); border: 1px solid transparent; 
    color: var(--healer-text); border-radius: 6px;
    padding: 4px 10px; font-size: 0.8em; cursor: pointer; display: flex; gap: 6px; align-items: center;
    transition: 0.2s;
}
.tool-btn:hover { background: var(--healer-accent); color: #2b2633; }
.tool-btn.icon-only { padding: 4px 8px; }

textarea {
    flex: 1; width: 100%; border: none; background: transparent;
    color: var(--healer-text); padding: 15px; resize: none;
    font-family: 'Consolas', 'Monaco', monospace; font-size: 14px; outline: none; line-height: 1.6;
}
textarea::placeholder { color: rgba(255,255,255,0.2); }

/* PREVIEW */
.preview-container { 
    height: 100%; overflow-y: auto; background: rgba(0,0,0,0.15); 
    border-radius: 12px; padding: 25px; border: 1px solid var(--healer-border); 
}
.preview-think-bubble {
    background: var(--healer-think-bg); 
    border-left: 4px solid var(--healer-think-border);
    padding: 15px 20px; margin-bottom: 25px; border-radius: 0 8px 8px 0;
    color: #d1c4e9; font-style: italic; line-height: 1.5;
}
.bubble-label { 
    font-weight: bold; color: var(--healer-accent); font-style: normal; 
    font-size: 0.75em; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px;
}
.preview-main { color: var(--healer-text); line-height: 1.7; font-size: 1.05em; }

/* FOOTER */
.healer-footer {
    background: #2b2633; border-top: 1px solid var(--healer-border);
    display: flex; align-items: center; justify-content: space-between;
    padding: 15px 20px; flex-shrink: 0; gap: 10px;
    padding-bottom: max(15px, env(safe-area-inset-bottom));
}
.status-bar { font-size: 0.85em; color: #9fa8da; margin-left: auto; margin-right: 20px; opacity: 0.8;}
.shortcut-hint { margin-right: 15px; font-style: italic; color: #777; }

.save-button {
    background: linear-gradient(135deg, #7e57c2 0%, #673ab7 100%); 
    color: white; border: none; padding: 10px 35px; border-radius: 25px;
    font-weight: bold; font-size: 1em; cursor: pointer;
    box-shadow: 0 4px 15px rgba(103, 58, 183, 0.4);
    white-space: nowrap; flex-shrink: 0; transition: transform 0.2s, box-shadow 0.2s;
}
.save-button:hover { 
    transform: translateY(-2px); 
    box-shadow: 0 6px 20px rgba(103, 58, 183, 0.6);
    filter: brightness(1.1);
}

/* RESPONSIVE */
.desktop-only { display: flex; }
.mobile-only { display: none; }

@media screen and (max-width: 768px) {
    .html-healer-box { width: 100%; height: 100dvh; border-radius: 0; border: none; }
    .header-left { display: none !important; } 
    .desktop-only { display: none; }
    .mobile-tabs { display: flex; }
    
    .view-section { display: none; padding: 15px; }
    .view-section.active { display: flex; }
    
    textarea { font-size: 16px; } 
    .mobile-only { display: flex !important; margin-right: auto; }
    .status-bar { display: none; }
    .save-button { padding: 10px 25px; }
}

@media screen and (min-width: 769px) {
    .healer-body { flex-direction: row; }
    .view-section { display: flex !important; width: 50%; }
    #view-preview { border-left: 1px solid var(--healer-border); }
    .mobile-tabs { display: none !important; }
}
</style>
`;
$('head').append(styles);

jQuery(async () => {
    loadSettings();
    console.log(`[${extensionName}] Ready (Lavender Theme).`);
});
