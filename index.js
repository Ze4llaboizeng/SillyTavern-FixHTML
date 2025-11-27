const extensionName = "html-healer";

// --- 1. Helper Logic (เหมือนเดิม) ---
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

function openSplitEditor() {
    const context = SillyTavern.getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return toastr.warning("No messages to fix.");

    const lastIndex = chat.length - 1;
    targetMessageId = lastIndex;
    const originalText = chat[lastIndex].mes;
    const parts = splitContent(originalText);

    // HTML Structure: Header -> Content (Scrollable) -> Footer
    const modalHtml = `
    <div id="html-healer-modal" class="html-healer-overlay">
        <div class="html-healer-box">
            <div class="healer-header">
                <h3><i class="fa-solid fa-file-medical"></i> Surgeon Tool</h3>
                <div class="close-btn" onclick="$('#html-healer-modal').remove()">✖</div>
            </div>
            
            <div class="healer-body-scroll">
                <div class="healer-grid">
                    <div class="column-edit">
                        <div class="editor-group">
                            <div class="label-row">
                                <span><i class="fa-solid fa-brain"></i> Thinking Process</span>
                                <div class="st-btn small" id="btn-clean-cot">Clean Tags</div>
                            </div>
                            <textarea id="editor-cot" placeholder="Logic inside <think>...">${parts.cot}</textarea>
                        </div>

                        <div class="editor-group">
                            <div class="label-row">
                                <span><i class="fa-solid fa-comment-dots"></i> Main Content</span>
                                <div class="action-buttons">
                                    <div class="st-btn small" id="btn-find-tag">🔍 Find Tag</div>
                                    <div class="st-btn small" id="btn-heal-html">Fix HTML</div>
                                </div>
                            </div>
                            <textarea id="editor-main" placeholder="Story content...">${parts.main}</textarea>
                        </div>
                    </div>

                    <div class="column-preview">
                        <div class="label-row">
                            <span><i class="fa-solid fa-eye"></i> Live Preview</span>
                        </div>
                        <div id="healer-preview-box" class="preview-content"></div>
                    </div>
                </div>
            </div>

            <div class="healer-footer">
                <div id="healer-status" class="status-text"></div>
                <button id="btn-save-split" class="st-btn primary">💾 Apply Changes</button>
            </div>
        </div>
    </div>
    `;

    $('body').append(modalHtml);
    
    // --- 3. Interaction Logic ---
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
        if (!match) { regex.lastIndex = 0; match = regex.exec(text); }
        if (match) {
            textarea.focus();
            textarea.setSelectionRange(match.index, match.index + match[0].length);
            $('#healer-status').text(`Found: "${match[0]}"`);
        } else {
            $('#healer-status').text("No tags found.");
        }
    });

    $('#btn-save-split').on('click', async () => {
        const cot = $('#editor-cot').val().trim();
        const main = $('#editor-main').val();

        if (/<think>/i.test(main)) {
            if (!confirm("⚠️ <think> tag detected in Main Content. Save anyway?")) return;
        }
        
        let finalMes = "";
        if (cot) finalMes += `<think>\n${cot}\n</think>\n`;
        finalMes += main;

        if (chat[targetMessageId].mes !== finalMes) {
            chat[targetMessageId].mes = finalMes;
            await context.saveChat();
            await context.reloadCurrentChat();
            toastr.success("Message Saved!");
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
                <div class="styled_description_block">Editor tool for PC & Mobile.</div>
                <div id="html-healer-open-split" class="menu_button">
                    <i class="fa-solid fa-file-medical"></i> Open Surgeon Tool
                </div>
            </div>
        </div>
    </div>`;
    $('#extensions_settings').append(settingsHtml);
    $('#html-healer-open-split').on('click', openSplitEditor);
}

// --- 4. SillyTavern-Like Responsive CSS ---
const styles = `
<style>
/* Reset basics */
.html-healer-box * { box-sizing: border-box; }

/* Overlay: PC = Center, Mobile = Fixed Fill */
.html-healer-overlay {
    position: fixed; inset: 0; z-index: 20000;
    background: rgba(0, 0, 0, 0.85);
    display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(2px);
}

/* Modal Box: Flex Column Layout */
.html-healer-box {
    display: flex; flex-direction: column;
    background: var(--smart-background-color, #1a1a1a);
    border: 1px solid var(--smart-border-color, #444);
    box-shadow: 0 0 25px rgba(0,0,0,0.5);
    
    /* PC Defaults */
    width: 90%; max-width: 1100px;
    height: 85vh; max-height: 900px;
    border-radius: 10px;
}

/* Header & Footer: Rigid (Don't Shrink) */
.healer-header {
    flex: 0 0 auto; /* Fixed height */
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 15px;
    border-bottom: 1px solid var(--smart-border-color, #444);
    background: rgba(0,0,0,0.1);
}
.healer-header h3 { margin: 0; font-size: 1.1em; color: var(--smart-text-color, #ccc); }
.close-btn { cursor: pointer; font-size: 1.2em; color: #ff6666; padding: 0 5px; }

.healer-footer {
    flex: 0 0 auto; /* Fixed height */
    display: flex; align-items: center; justify-content: flex-end;
    padding: 10px 15px;
    border-top: 1px solid var(--smart-border-color, #444);
    background: rgba(0,0,0,0.1); gap: 10px;
}
.status-text { margin-right: auto; font-size: 0.85em; color: #ffab40; opacity: 0.8; }

/* Main Scroll Area: Takes all remaining space */
.healer-body-scroll {
    flex: 1 1 auto; /* Grow and Shrink */
    overflow-y: auto; /* Scroll ONLY inside here */
    padding: 15px;
}

/* Grid System */
.healer-grid {
    display: flex; gap: 15px; height: 100%;
}
.column-edit { flex: 1; display: flex; flex-direction: column; gap: 15px; min-width: 0; }
.column-preview { flex: 1; display: flex; flex-direction: column; border-left: 1px solid #444; padding-left: 15px; min-width: 0; }

/* Editors */
.editor-group { display: flex; flex-direction: column; flex: 1; min-height: 150px; }
.label-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; font-weight: bold; font-size: 0.9em; color: var(--smart-text-color); }
.action-buttons { display: flex; gap: 5px; }

/* ST Style Buttons */
.st-btn {
    background: var(--smart-theme-color, #444);
    color: var(--smart-theme-text, #fff);
    border: 1px solid transparent;
    border-radius: 5px; cursor: pointer;
    text-align: center; font-weight: 600;
    transition: filter 0.2s;
}
.st-btn:hover { filter: brightness(1.2); }
.st-btn.small { padding: 3px 8px; font-size: 0.75em; }
.st-btn.primary { padding: 8px 20px; font-size: 0.95em; }

textarea {
    width: 100%; flex: 1; resize: none;
    background: rgba(0,0,0,0.2); color: var(--smart-text-color, #ccc);
    border: 1px solid var(--smart-border-color, #555);
    border-radius: 5px; padding: 10px; font-family: monospace;
}

/* Preview Area */
.preview-content {
    flex: 1; overflow-y: auto;
    background: rgba(0,0,0,0.1); border: 1px solid #444;
    border-radius: 5px; padding: 10px;
    word-wrap: break-word; font-size: 0.9em; line-height: 1.5;
}
.preview-content think {
    display: block; background: rgba(127, 127, 127, 0.1);
    border-left: 3px solid #888; padding: 8px; margin: 8px 0;
    font-style: italic; opacity: 0.8;
}

/* --- MOBILE RESPONSIVE (The Fix) --- */
@media screen and (max-width: 768px) {
    .html-healer-overlay {
        align-items: flex-end; /* Or flex-start, doesn't matter much as we fill 100% */
    }
    .html-healer-box {
        width: 100%; height: 100%; 
        max-width: none; max-height: none;
        border-radius: 0; border: none;
    }
    
    .healer-grid {
        flex-direction: column; /* Stack vertically */
        height: auto; /* Let content dictate height */
    }
    
    .column-preview {
        border-left: none; border-top: 1px solid #444;
        padding-left: 0; padding-top: 15px;
        height: 300px; /* Fixed height for preview on mobile */
        flex: none; /* Don't grow */
    }
    
    .editor-group {
        min-height: 200px; /* Give textareas enough space */
    }
}
</style>
`;
$('head').append(styles);

jQuery(async () => {
    loadSettings();
    console.log(`[${extensionName}] Ready (SillyTavern Responsive UI).`);
});
