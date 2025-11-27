const extensionName = "html-healer";

// --- Helper: แยกส่วนประกอบข้อความ ---
function splitContent(rawText) {
    const match = rawText.match(/<think>([\s\S]*?)<\/think>/i);
    if (match) {
        return {
            cot: match[1].trim(),
            main: rawText.replace(match[0], "").trim()
        };
    }
    const openIndex = rawText.search(/<think>/i);
    if (openIndex !== -1) {
        return {
            cot: rawText.substring(openIndex + 7).trim(),
            main: rawText.substring(0, openIndex).trim()
        };
    }
    return { cot: "", main: rawText };
}

// --- Helper: ซ่อม HTML ---
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

/**
 * UI: Split Editor Modal with "Tag Hunter"
 */
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
        <div class="html-healer-box split-mode">
            <div class="healer-header">
                <h3>🧠 CoT & HTML Split Editor</h3>
                <div class="close-btn" onclick="$('#html-healer-modal').remove()">✖</div>
            </div>
            
            <div class="healer-body-grid">
                <div class="edit-column">
                    <div class="editor-section">
                        <div class="section-label">
                            <span><i class="fa-solid fa-brain"></i> Thinking Process</span>
                            <div class="mini-btn" id="btn-clean-cot">Trim Whitespace</div>
                        </div>
                        <textarea id="editor-cot" placeholder="Thinking content...">${parts.cot}</textarea>
                    </div>

                    <div class="editor-section">
                        <div class="section-label">
                            <span><i class="fa-solid fa-comment-dots"></i> Main Content</span>
                            <div class="btn-group">
                                <div class="mini-btn" id="btn-scan-tags" title="Find next < or > symbol">🔍 Find &lt;&gt;</div>
                                <div class="mini-btn" id="btn-heal-html">Fix HTML</div>
                            </div>
                        </div>
                        <textarea id="editor-main" placeholder="Story content...">${parts.main}</textarea>
                    </div>
                </div>

                <div class="preview-column">
                    <div class="section-label">
                        <span><i class="fa-solid fa-eye"></i> Live Preview</span>
                    </div>
                    <div id="healer-preview-box" class="preview-content"></div>
                </div>
            </div>

            <div class="healer-footer">
                <div style="font-size: 0.8em; opacity: 0.7; margin-right: auto;">
                    *Use 'Find <>' to detect leftover tags in the main story.
                </div>
                <button id="btn-save-split" class="menu_button">💾 Merge & Save</button>
            </div>
        </div>
    </div>
    `;

    $('body').append(modalHtml);
    
    // --- LIVE PREVIEW LOGIC ---
    const updatePreview = () => {
        const cot = $('#editor-cot').val().trim();
        const main = $('#editor-main').val();
        let previewHtml = "";
        if (cot) previewHtml += `<think>${cot.replace(/\n/g, "<br>")}</think>`;
        previewHtml += main;
        $('#healer-preview-box').html(previewHtml);
    };
    updatePreview();
    $('#editor-cot, #editor-main').on('input', updatePreview);

    // --- BUTTON EVENTS ---
    
    // 1. Trim CoT
    $('#btn-clean-cot').on('click', () => {
        let val = $('#editor-cot').val();
        val = val.replace(/<\/?think>/gi, "").trim();
        $('#editor-cot').val(val);
        updatePreview();
    });

    // 2. Heal HTML
    $('#btn-heal-html').on('click', () => {
        let val = $('#editor-main').val();
        // Simple HTML Fixer
        const parser = new DOMParser();
        const doc = parser.parseFromString(val, 'text/html');
        // Remove scripts
        const scripts = doc.getElementsByTagName('script');
        for (let i = scripts.length - 1; i >= 0; i--) scripts[i].remove();
        
        $('#editor-main').val(doc.body.innerHTML);
        updatePreview();
        toastr.success("HTML Structure Repaired!");
    });

    // 3. TAG HUNTER (NEW FEATURE) 🔍
    let lastSearchIndex = 0; // จำตำแหน่งล่าสุดที่หาเจอ
    
    $('#btn-scan-tags').on('click', () => {
        const textarea = document.getElementById('editor-main');
        const text = textarea.value;
        
        // Regex หาเครื่องหมาย < หรือ > (รวมถึงแท็ก HTML ทั้งก้อน)
        // ถ้าอยากหาแค่ <think> ให้เปลี่ยนเป็น /<\/?think/gi
        // แต่ถ้าอยากหาทุกอย่างที่เป็น tag เพื่อตรวจสอบใช้ /<[^>]+>/g หรือแค่ /<|>/g
        const regex = /<[^>]*>?|>/g; 
        
        regex.lastIndex = lastSearchIndex; // เริ่มหาต่อจากเดิม
        const match = regex.exec(text);

        if (match) {
            // เจอแล้ว! ทำการ Highlight
            textarea.focus();
            textarea.setSelectionRange(match.index, match.index + match[0].length);
            
            // เลื่อน Scroll ไปหาจุดที่เจอ
            const fullText = textarea.value;
            const textLines = fullText.substr(0, match.index).split("\n").length;
            const lineHeight = 20; // ค่าประมาณ
            textarea.scrollTop = (textLines * lineHeight) - (textarea.clientHeight / 2);

            lastSearchIndex = regex.lastIndex; // จำตำแหน่งไว้หาต่อ
            toastr.info(`Found tag: ${match[0]}`);
        } else {
            // ถ้าไม่เจอ หรือหาจนจบแล้ว ให้เริ่มใหม่
            lastSearchIndex = 0;
            // ลองหาใหม่อีกทีจากต้น
            const retry = regex.exec(text);
            if (retry) {
                textarea.focus();
                textarea.setSelectionRange(retry.index, retry.index + retry[0].length);
                lastSearchIndex = regex.lastIndex;
                toastr.info(`Looping start: ${retry[0]}`);
            } else {
                toastr.success("No tags found!");
            }
        }
    });

    // 4. SAVE
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
}

/**
 * UI: Settings Menu
 */
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
                <div class="styled_description_block">
                    Split editor with Live Preview for Thinking Process.
                </div>
                <div id="html-healer-open-split" class="menu_button">
                    <i class="fa-solid fa-columns"></i> Open Split Editor
                </div>
            </div>
        </div>
    </div>
    `;
    $('#extensions_settings').append(settingsHtml);
    $('#html-healer-open-split').on('click', openSplitEditor);
}

// CSS Style (รวม CSS สำหรับจำลองกล่อง think ในหน้า Preview)
const styles = `
<style>
.html-healer-overlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.85); z-index: 9999;
    display: flex; justify-content: center; align-items: center;
}
.html-healer-box.split-mode {
    background: var(--smart-background-color, #202020);
    border: 1px solid var(--smart-border-color, #444);
    width: 95%; max-width: 1000px; height: 90%;
    display: flex; flex-direction: column;
    border-radius: 10px; padding: 15px;
    box-shadow: 0 0 30px rgba(0,0,0,0.8);
}
.healer-header { display: flex; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px solid #444; padding-bottom: 5px;}
.healer-header h3 { margin: 0; color: var(--smart-text-color, #eee); }
.close-btn { cursor: pointer; font-size: 1.2em; color: #ff5555; }

/* Grid Layout */
.healer-body-grid { 
    flex: 1; display: flex; gap: 15px; overflow: hidden; 
}
.edit-column { flex: 1; display: flex; flex-direction: column; gap: 10px; }
.preview-column { 
    flex: 1; display: flex; flex-direction: column; 
    border-left: 1px solid #444; padding-left: 15px; 
}

.editor-section { display: flex; flex-direction: column; flex: 1; }
.section-label { 
    display: flex; justify-content: space-between; align-items: center; 
    margin-bottom: 5px; font-weight: bold; color: var(--smart-text-color);
}
.mini-btn {
    background: #444; color: white; padding: 2px 8px; border-radius: 4px; 
    font-size: 0.8em; cursor: pointer; border: 1px solid #666;
}
.mini-btn:hover { background: #666; }

textarea { 
    flex: 1; resize: none; 
    background: rgba(0,0,0,0.2); color: var(--smart-text-color, #ccc);
    border: 1px solid var(--smart-border-color, #555);
    font-family: monospace; padding: 10px; border-radius: 5px;
    line-height: 1.4;
}

/* Preview Styles */
.preview-content {
    flex: 1; overflow-y: auto; 
    background: rgba(0, 0, 0, 0.15);
    border: 1px solid var(--smart-border-color, #444);
    border-radius: 5px; padding: 15px;
    color: var(--smart-text-color, #ccc);
    font-family: sans-serif;
    line-height: 1.5;
}

/* SIMULATE THINK BOX IN PREVIEW */
.preview-content think {
    display: block;
    background-color: rgba(128, 128, 128, 0.1);
    border-left: 4px solid rgba(128, 128, 128, 0.5);
    padding: 10px;
    margin: 10px 0;
    font-style: italic;
    opacity: 0.8;
    border-radius: 4px;
}

.healer-footer { margin-top: 15px; display: flex; align-items: center; }
</style>
`;
$('head').append(styles);

jQuery(async () => {
    loadSettings();
    console.log(`[${extensionName}] Ready (Live Preview Mode).`);
});
