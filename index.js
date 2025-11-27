const extensionName = "html-healer";

// --- 1. Logic ---
function splitContent(rawText) {
    if (!rawText) return { type: "none", cot: "", main: "" };

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

function countWords(str) {
    if (!str) return 0;
    return str.trim().split(/\s+/).length;
}

function checkBrokenHtml(text) {
    if (!text) return false;
    // Simple heuristic: count divs. If mismatch, likely broken.
    const openDivs = (text.match(/<div/gi) || []).length;
    const closeDivs = (text.match(/<\/div>/gi) || []).length;
    return openDivs !== closeDivs;
}

// --- 2. UI Builder ---
let currentMessageId = null;
const authorConfig = {
    name: "Zealllll",
    avatarUrl: "scripts/extensions/third-party/SillyTavern-FixHTML/avatar.png"
};

function openSplitEditor() {
    const context = SillyTavern.getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return toastr.warning("No messages to fix.");

    // Start at last message
    currentMessageId = chat.length - 1;

    // HTML Structure
    const modalHtml = `
    <div id="html-healer-modal" class="html-healer-overlay">
        <div class="html-healer-box">
            
            <div class="healer-header">
                <div class="header-brand">
                    <div class="header-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
                    <div class="header-text">
                        <span class="title">Lavender Editor</span>
                        <span class="subtitle">HTML & CoT Manager</span>
                    </div>
                </div>

                <div class="header-nav">
                    <button class="nav-btn" id="nav-prev" title="Previous Message"><i class="fa-solid fa-chevron-left"></i></button>
                    <span class="nav-info" id="nav-display">Msg #${currentMessageId}</span>
                    <button class="nav-btn" id="nav-next" title="Next Message"><i class="fa-solid fa-chevron-right"></i></button>
                    <button class="nav-btn scan-btn" id="btn-scan-broken" title="Scan for broken HTML"><i class="fa-solid fa-radar"></i> Scan</button>
                </div>

                <div class="header-controls">
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
                        <textarea id="editor-cot" placeholder="Waiting for thoughts..."></textarea>
                    </div>

                    <div class="editor-group main-group">
                        <div class="group-toolbar">
                            <span class="label"><i class="fa-solid fa-comments"></i> Story Content</span>
                            <div class="toolbar-actions">
                                <span class="word-count" id="count-main">0 words</span>
                                <button class="action-btn" id="btn-heal-html" title="Fix HTML"><i class="fa-solid fa-wrench"></i> Fix HTML</button>
                                <button class="action-btn" onclick="copyText('editor-main')" title="Copy"><i class="fa-regular fa-copy"></i></button>
                            </div>
                        </div>
                        <textarea id="editor-main" placeholder="Write the story..."></textarea>
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
                <div class="footer-status" id="footer-status">
                    </div>
                <button id="btn-save-split" class="save-button">
                    <span class="btn-content"><i class="fa-solid fa-floppy-disk"></i> Save Msg #${currentMessageId}</span>
                </button>
            </div>
        </div>
    </div>
    `;

    $(document.body).append(modalHtml);
    
    // --- Logic & Events ---
    
    // 1. Loader Function
    const loadMessageData = (index) => {
        const chat = SillyTavern.getContext().chat;
        if (index < 0 || index >= chat.length) return;
        
        currentMessageId = index;
        const msg = chat[index];
        const parts = splitContent(msg.mes);

        // Update UI Values
        $('#editor-cot').val(parts.cot);
        $('#editor-main').val(parts.main);
        
        // Update Nav Info
        $('#nav-display').text(`Msg #${index} (${msg.is_user ? 'User' : 'Char'})`);
        $('#btn-save-split').html(`<span class="btn-content"><i class="fa-solid fa-floppy-disk"></i> Save Msg #${index}</span>`);

        // Check for broken HTML visual indicator
        const isBroken = checkBrokenHtml(parts.main);
        if(isBroken) {
            $('#nav-display').css('color', '#ff6b6b').append(' <i class="fa-solid fa-triangle-exclamation"></i>');
        } else {
            $('#nav-display').css('color', '');
        }

        // Auto-split status
        if (parts.type === 'phrase_split') {
            $('#footer-status').html('<span class="tag-badge"><i class="fa-solid fa-bolt"></i> Auto-Split Active</span>');
        } else {
            $('#footer-status').empty();
        }

        updatePreview();
    };

    // 2. Navigation Logic
    $('#nav-prev').on('click', () => {
        if (currentMessageId > 0) loadMessageData(currentMessageId - 1);
    });
    $('#nav-next').on('click', () => {
        const max = SillyTavern.getContext().chat.length - 1;
        if (currentMessageId < max) loadMessageData(currentMessageId + 1);
    });

    // 3. Scanner Logic (The Feature You Requested!)
    $('#btn-scan-broken').on('click', () => {
        const chat = SillyTavern.getContext().chat;
        let foundIndex = -1;
        
        // Scan backwards from current position - 1
        for (let i = currentMessageId - 1; i >= 0; i--) {
            if (checkBrokenHtml(chat[i].mes)) {
                foundIndex = i;
                break;
            }
        }
        
        if (foundIndex === -1) {
            // Try scanning forwards if not found backwards
            for (let i = chat.length - 1; i > currentMessageId; i--) {
                if (checkBrokenHtml(chat[i].mes)) {
                    foundIndex = i;
                    break;
                }
            }
        }

        if (foundIndex !== -1) {
            toastr.warning(`Found potential broken HTML at Message #${foundIndex}`);
            loadMessageData(foundIndex);
        } else {
            toastr.success("No obvious broken HTML found in other messages.");
        }
    });

    // 4. Standard Utilities
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
    
    // Fix HTML Action
    $('#btn-heal-html').on('click', () => {
        let val = $('#editor-main').val();
        let fixed = healHtmlContent(val);
        $('#editor-main').val(fixed).trigger('input');
        toastr.success("HTML Repaired!");
    });

    // Save Action
    $('#btn-save-split').on('click', async () => {
        const cot = $('#editor-cot').val().trim();
        const main = $('#editor-main').val();
        const chat = SillyTavern.getContext().chat; // Refresh ref

        if (/<think>/i.test(main)) {
            if (!confirm("⚠️ Found <think> tag in Main Story. Save anyway?")) return;
        }
        
        let finalMes = "";
        if (cot) finalMes += `<think>\n${cot}\n</think>\n`;
        finalMes += main;

        if (chat[currentMessageId].mes !== finalMes) {
            chat[currentMessageId].mes = finalMes;
            await SillyTavern.getContext().saveChat();
            await SillyTavern.getContext().reloadCurrentChat();
            toastr.success(`Saved Message #${currentMessageId}!`);
        }
        // Don't close immediately, user might want to fix others
    });

    // Initial Load
    loadMessageData(currentMessageId);
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

// Reuse styles from previous turn (Lavender Theme + Nav Support)
const styles = `
<style>
/* --- THEME --- */
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

/* --- MODAL --- */
.html-healer-box * { box-sizing: border-box; }
.html-healer-overlay {
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; height: 100dvh;
    z-index: 99999; background: rgba(15, 12, 20, 0.85);
    display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(8px);
}
.html-healer-box {
    width: 90%; max-width: 1100px; height: 85vh;
    background: var(--lavender-darker); border: 1px solid var(--lavender-border);
    border-radius: 16px; display: flex; flex-direction: column;
    box-shadow: 0 0 40px rgba(166, 177, 225, 0.1); overflow: hidden;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

/* --- HEADER & NAV --- */
.healer-header {
    background: var(--lavender-dark); padding: 10px 20px;
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 1px solid var(--lavender-border); height: 60px;
}
.header-brand { display: flex; gap: 12px; align-items: center; }
.header-icon { 
    width: 36px; height: 36px; background: var(--lavender-glass); 
    border-radius: 10px; color: var(--lavender-secondary);
    display: flex; align-items: center; justify-content: center; font-size: 1.2em;
}
.header-text .title { font-weight: bold; color: var(--lavender-text); display: block;}
.header-text .subtitle { font-size: 0.7em; color: var(--lavender-secondary); }

/* Navigation Styles */
.header-nav { 
    display: flex; align-items: center; gap: 10px; 
    background: rgba(0,0,0,0.2); padding: 5px 10px; border-radius: 20px; border: 1px solid var(--lavender-border);
}
.nav-info { color: var(--lavender-text); font-weight: bold; font-size: 0.9em; min-width: 80px; text-align: center;}
.nav-btn {
    background: transparent; border: none; color: var(--lavender-secondary);
    cursor: pointer; padding: 5px 10px; border-radius: 8px; font-size: 1em;
}
.nav-btn:hover { background: var(--lavender-glass); color: #fff; }
.scan-btn { color: var(--lavender-accent); font-size: 0.85em; display: flex; gap: 5px; align-items: center;}

.close-btn { font-size: 1.5em; cursor: pointer; color: var(--lavender-text-muted); padding: 0 10px; }

/* --- BODY --- */
.healer-body { flex: 1; display: flex; overflow: hidden; }
.view-section { flex: 1; display: flex; flex-direction: column; padding: 20px; gap: 15px; overflow-y: auto; }

.editor-group {
    display: flex; flex-direction: column; flex: 1;
    background: rgba(0,0,0,0.2); border-radius: 12px; border: 1px solid var(--lavender-border);
}
.group-toolbar {
    padding: 8px 12px; border-bottom: 1px solid var(--lavender-border);
    display: flex; justify-content: space-between; align-items: center;
}
.label { font-weight: 600; color: var(--lavender-secondary); font-size: 0.9em; }
.toolbar-actions { display: flex; gap: 10px; align-items: center; }
.action-btn { background: transparent; border: none; color: var(--lavender-text-muted); cursor: pointer; }
.action-btn:hover { color: var(--lavender-primary); }

textarea {
    flex: 1; width: 100%; border: none; background: transparent;
    color: var(--lavender-text); padding: 15px; resize: none; outline: none; line-height: 1.5;
}

/* --- PREVIEW --- */
#view-preview { border-left: 1px solid var(--lavender-border); background: rgba(0,0,0,0.1); }
.preview-wrapper { 
    height: 100%; overflow-y: auto; padding: 20px; color: var(--lavender-text); 
}
.preview-think-bubble {
    background: rgba(166, 177, 225, 0.08); border-radius: 8px;
    padding: 15px; margin-bottom: 20px; border-left: 3px solid var(--lavender-secondary);
    font-style: italic; color: #d0d5e8;
}

/* --- FOOTER --- */
.healer-footer {
    padding: 10px 20px; background: var(--lavender-dark);
    border-top: 1px solid var(--lavender-border);
    display: flex; justify-content: space-between; align-items: center;
    padding-bottom: max(10px, env(safe-area-inset-bottom));
}
.save-button {
    background: linear-gradient(135deg, var(--lavender-secondary), #8e84d6);
    color: #1a1625; border: none; padding: 8px 25px;
    border-radius: 20px; font-weight: bold; cursor: pointer;
}

/* --- MOBILE --- */
.mobile-tabs { display: none; padding: 10px; gap: 10px; background: var(--lavender-darker); }
.tab-btn { flex: 1; padding: 10px; background: transparent; border: 1px solid var(--lavender-border); color: var(--lavender-text-muted); border-radius: 8px; }
.tab-btn.active { background: var(--lavender-glass); color: var(--lavender-secondary); border-color: var(--lavender-secondary); }

@media screen and (max-width: 768px) {
    .html-healer-box { width: 100%; height: 100dvh; border-radius: 0; border: none; }
    .header-brand, .header-controls { display: none; } /* Simplify header */
    .healer-header { justify-content: center; }
    .header-nav { width: 100%; justify-content: space-between; }
    
    .mobile-tabs { display: flex; }
    .view-section { display: none; padding: 10px; }
    .view-section.active { display: flex; }
    #view-preview { border-left: none; }
}

@media screen and (min-width: 769px) {
    .healer-body { flex-direction: row; }
}
</style>
`;
$('head').append(styles);

jQuery(async () => {
    loadSettings();
    console.log(`[${extensionName}] Ready (Navigator Edition).`);
});
