const extensionName = "html-healer";

// --- Helper: แยกส่วนประกอบ ---
function splitContent(rawText) {
    let cleanText = rawText
        .replace(/&lt;think&gt;/gi, "<think>")
        .replace(/&lt;\/think&gt;/gi, "</think>");

    const match = cleanText.match(/<think>([\s\S]*?)<\/think>/i);
    if (match) {
        return {
            cot: match[1].trim(),
            main: cleanText.replace(match[0], "").trim()
        };
    }
    const openIndex = cleanText.search(/<think>/i);
    if (openIndex !== -1) {
        return {
            cot: cleanText.substring(openIndex + 7).trim(),
            main: cleanText.substring(0, openIndex).trim()
        };
    }
    return { cot: "", main: cleanText };
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

// --- UI: Split Editor Modal ---
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
        <div class="html-healer-box split-mode">
            <div class="healer-header">
                <h3>🧠 Surgeon Tool</h3>
                <div class="close-btn" onclick="$('#html-healer-modal').remove()">✖</div>
            </div>
            
            <div class="healer-body-grid">
                <div class="edit-column">
                    <div class="editor-section">
                        <div class="section-label">
                            <span><i class="fa-solid fa-brain"></i> Thinking</span>
                            <div class="mini-btn" id="btn-clean-cot">Clean Tags</div>
                        </div>
                        <textarea id="editor-cot" placeholder="Logic content...">${parts.cot}</textarea>
                    </div>

                    <div class="editor-section">
                        <div class="section-label">
                            <span><i class="fa-solid fa-comment-dots"></i> Main Content</span>
                            <div class="btn-group">
                                <div class="mini-btn" id="btn-find-tag">🔍 Find Tag</div>
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
                <div id="healer-status" class="status-text"></div>
                <button id="btn-save-split" class="menu_button save-btn">💾 Save</button>
            </div>
        </div>
    </div>
    `;

    $('body').append(modalHtml);
    
    // --- Logic ---
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

    $('#btn-clean-cot').on('click', () => {
        let val = $('#editor-cot').val();
        val = val.replace(/<\/?think>/gi, "").trim();
        $('#editor-cot').val(val);
        updatePreview();
    });

    $('#btn-heal-html').on('click', () => {
        let val = $('#editor-main').val();
        let fixed = healHtmlContent(val);
        $('#editor-main').val(fixed);
        updatePreview();
        toastr.success("HTML Repaired!");
    });

    $('#btn-find-tag').on('click', () => {
        const textarea = document.getElementById('editor-main');
        const text = textarea.value;
        const cursorPos = textarea.selectionEnd;
        const regex = /<think>|<\/think>|<|>|&lt;|&gt;/gi;
        regex.lastIndex = cursorPos; 
        let match = regex.exec(text);
        if (!match) {
            regex.lastIndex = 0;
            match = regex.exec(text);
        }
        if (match) {
            textarea.focus();
            textarea.setSelectionRange(match.index, match.index + match[0].length);
            $('#healer-status').text(`Found: "${match[0]}"`);
        } else {
            toastr.info("No tags found.");
            $('#healer-status').text("No tags.");
        }
    });

    $('#btn-save-split').on('click', async () => {
        const cot = $('#editor-cot').val().trim();
        const main = $('#editor-main').val();

        if (/<think>/i.test(main)) {
            const confirmSave = confirm("Warning: <think> tag found in Main Content. Move it up?");
            if (!confirmSave) return;
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

/** UI Loading */
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
                    Mobile-friendly split editor.
                </div>
                <div id="html-healer-open-split" class="menu_button">
                    <i class="fa-solid fa-file-medical"></i> Open Editor
                </div>
            </div>
        </div>
    </div>
    `;
    $('#extensions_settings').append(settingsHtml);
    $('#html-healer-open-split').on('click', openSplitEditor);
}

// Mobile-Friendly CSS
const styles = `
<style>
.html-healer-overlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.85); z-index: 20000; /* High Z-index */
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
.healer-header { 
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 10px; border-bottom: 1px solid #444; padding-bottom: 5px;
    flex-shrink: 0;
}
.healer-header h3 { margin: 0; color: var(--smart-text-color, #eee); font-size: 1.1rem;}
.close-btn { cursor: pointer; font-size: 1.5em; color: #ff5555; padding: 0 10px;}

/* Grid Layout - Desktop Default */
.healer-body-grid { flex: 1; display: flex; gap: 15px; overflow: hidden; }
.edit-column { flex: 1; display: flex; flex-direction: column; gap: 10px; }
.preview-column { flex: 1; display: flex; flex-direction: column; border-left: 1px solid #444; padding-left: 15px; }

.editor-section { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.section-label { 
    display: flex; justify-content: space-between; align-items: center; 
    margin-bottom: 5px; font-weight: bold; color: var(--smart-text-color); font-size: 0.9em;
}
.btn-group { display: flex; gap: 5px; }
.mini-btn { 
    background: #444; color: white; padding: 4px 8px; border-radius: 4px; 
    font-size: 0.75em; cursor: pointer; border: 1px solid #666; white-space: nowrap;
}
.mini-btn:hover { background: #666; }

textarea { 
    flex: 1; resize: none; 
    background: rgba(0,0,0,0.2); color: var(--smart-text-color, #ccc); 
    border: 1px solid var(--smart-border-color, #555); 
    font-family: monospace; padding: 10px; border-radius: 5px; 
    line-height: 1.4; font-size: 14px;
}

.preview-content { 
    flex: 1; overflow-y: auto; 
    background: rgba(0, 0, 0, 0.15); 
    border: 1px solid var(--smart-border-color, #444); border-radius: 5px; 
    padding: 15px; color: var(--smart-text-color, #ccc); 
    font-family: sans-serif; line-height: 1.5; font-size: 14px;
}
.preview-content think { 
    display: block; background-color: rgba(128, 128, 128, 0.1); 
    border-left: 4px solid rgba(128, 128, 128, 0.5); 
    padding: 10px; margin: 10px 0; font-style: italic; opacity: 0.8; 
}

.healer-footer { 
    margin-top: 10px; display: flex; align-items: center; 
    flex-shrink: 0; 
}
.status-text { font-size: 0.8em; opacity: 0.7; margin-right: auto; color: #ffab40; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60%; }
.save-btn { padding: 10px 20px; width: auto; min-width: 100px;}

/* MOBILE RESPONSIVE TWEAKS */
@media (max-width: 768px) {
    .html-healer-box.split-mode {
        width: 100%; height: 100%;
        max-width: none; border-radius: 0;
        padding: 10px;
    }
    .healer-body-grid {
        flex-direction: column; /* Stack vertically */
        overflow-y: auto; /* Scroll the whole body */
        gap: 20px;
    }
    .preview-column {
        border-left: none;
        border-top: 1px solid #444;
        padding-left: 0;
        padding-top: 15px;
        min-height: 250px; /* Give preview some space */
    }
    .editor-section {
        min-height: 150px; /* Ensure textareas don't collapse */
    }
    .mini-btn {
        padding: 6px 10px; /* Larger touch targets */
        font-size: 0.85em;
    }
}
</style>
`;
$('head').append(styles);

jQuery(async () => {
    loadSettings();
    console.log(`[${extensionName}] Ready (Mobile Compatible).`);
});
