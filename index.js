const extensionName = "html-healer";
const defaultDepth = 1;

/** * --- CORE LOGIC (เหมือนเดิม แต่เรียกใช้ผ่าน UI ใหม่) --- 
 */
function fixChainOfThought(text) {
    if (!text) return "";
    text = text.replace(/&lt;think&gt;/gi, "<think>").replace(/&lt;\/think&gt;/gi, "</think>");
    const hasOpen = /<think>/i.test(text);
    if (!hasOpen) return text;

    const firstOpenIndex = text.search(/<think>/i);
    const preOpen = text.substring(0, firstOpenIndex);
    const postOpen = text.substring(firstOpenIndex + 7); 
    
    text = preOpen + "<think>\n" + postOpen.replace(/<think>/gi, "");

    if (/<\/think>/i.test(text)) {
        const parts = text.split(/<\/think>/i);
        if (parts.length > 1) {
            const content = parts[0];
            const remainder = parts.slice(1).join(""); 
            text = content.trimEnd() + "\n</think>\n" + remainder;
        }
    } else {
        const stopPhrases = ["Close COT", "End of thought", "Analysis complete"];
        const regexString = `(${stopPhrases.join("|")})`;
        const stopRegex = new RegExp(regexString, "i");
        
        if (stopRegex.test(text)) {
            text = text.replace(stopRegex, "$1\n</think>\n");
        } else {
            text = text.trimEnd() + "\n</think>\n";
        }
    }
    return text;
}

function healHtml(dirtyHtml, mode = 'both') {
    if (!dirtyHtml) return "";
    let preProcessed = dirtyHtml;

    if (mode === 'both' || mode === 'cot_only') {
         preProcessed = fixChainOfThought(dirtyHtml);
         if (mode === 'cot_only') return preProcessed;
    }

    const placeholder = ``;
    const cotRegex = /<think>[\s\S]*?<\/think>/i;
    let storedCot = "";
    const cotMatch = preProcessed.match(cotRegex);

    if (cotMatch) {
        storedCot = cotMatch[0];
        preProcessed = preProcessed.replace(cotMatch[0], placeholder);
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(preProcessed, 'text/html');
    const scripts = doc.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
        scripts[i].parentNode.removeChild(scripts[i]);
    }

    let healedHtml = doc.body.innerHTML;

    if (storedCot) {
        healedHtml = healedHtml.replace(placeholder, storedCot);
    }

    return healedHtml;
}

/**
 * --- NEW UI: Manual Fixer Modal ---
 */
let targetMessageId = null; // Store which message we are editing

function openManualFixer() {
    const context = SillyTavern.getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return toastr.warning("No messages to fix.");

    // Default to last message
    const lastIndex = chat.length - 1;
    targetMessageId = lastIndex;
    const originalText = chat[lastIndex].mes;

    // Generate HTML for Modal
    const modalHtml = `
    <div id="html-healer-modal" class="html-healer-overlay">
        <div class="html-healer-box">
            <div class="healer-header">
                <h3>🛠️ HTML & CoT Surgeon</h3>
                <div class="close-btn" onclick="$('#html-healer-modal').remove()">✖</div>
            </div>
            
            <div class="healer-body">
                <div class="control-row">
                    <label><input type="checkbox" id="chk-fix-cot" checked> Fix &lt;think&gt;</label>
                    <label><input type="checkbox" id="chk-fix-html" checked> Fix HTML Tags</label>
                </div>
                
                <div class="comparison-view">
                    <div class="pane">
                        <small>Original Source:</small>
                        <textarea id="healer-original" readonly></textarea>
                    </div>
                    <div class="pane arrow">➡</div>
                    <div class="pane">
                        <small>Preview Result:</small>
                        <textarea id="healer-preview" readonly></textarea>
                    </div>
                </div>
            </div>

            <div class="healer-footer">
                <button id="btn-apply-fix" class="menu_button">✅ Apply Fix</button>
            </div>
        </div>
    </div>
    `;

    // Append to body
    $('body').append(modalHtml);

    // Set Values
    $('#healer-original').val(originalText);
    updatePreview(originalText);

    // Event Listeners
    $('#chk-fix-cot, #chk-fix-html').on('change', () => {
        updatePreview(originalText);
    });

    $('#btn-apply-fix').on('click', async () => {
        const newText = $('#healer-preview').val();
        if (newText && newText !== originalText) {
            chat[targetMessageId].mes = newText;
            await context.saveChat();
            await context.reloadCurrentChat();
            toastr.success("Message repaired successfully!");
        }
        $('#html-healer-modal').remove();
    });
}

function updatePreview(originalText) {
    const fixCot = $('#chk-fix-cot').is(':checked');
    const fixHtml = $('#chk-fix-html').is(':checked');
    
    let mode = 'none';
    if (fixCot && fixHtml) mode = 'both';
    else if (fixCot) mode = 'cot_only';
    else if (fixHtml) mode = 'html_only';

    const fixed = (mode === 'none') ? originalText : healHtml(originalText, mode);
    $('#healer-preview').val(fixed);
}

/**
 * UI: Settings Menu (Updated Button)
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
                    Open the manual surgeon tool to inspect and fix the last message.
                </div>
                <div id="html-healer-open-modal" class="menu_button">
                    <i class="fa-solid fa-stethoscope"></i> Open Manual Fixer
                </div>
            </div>
        </div>
    </div>
    `;
    $('#extensions_settings').append(settingsHtml);
    
    // Bind click
    $('#html-healer-open-modal').on('click', openManualFixer);
}

// Add some basic CSS for the modal via JS (or add to style.css)
const modalStyles = `
<style>
.html-healer-overlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.7); z-index: 9999;
    display: flex; justify-content: center; align-items: center;
}
.html-healer-box {
    background: var(--smart-background-color, #202020);
    border: 1px solid var(--smart-border-color, #444);
    width: 80%; max-width: 900px; height: 80%;
    display: flex; flex-direction: column;
    border-radius: 10px; padding: 15px;
    box-shadow: 0 0 20px rgba(0,0,0,0.5);
}
.healer-header { display: flex; justify-content: space-between; margin-bottom: 10px; }
.healer-header h3 { margin: 0; color: var(--smart-text-color, #eee); }
.close-btn { cursor: pointer; font-size: 1.2em; }
.healer-body { flex: 1; display: flex; flex-direction: column; gap: 10px; overflow: hidden; }
.control-row { display: flex; gap: 20px; justify-content: center; padding: 5px; background: rgba(0,0,0,0.2); border-radius: 5px;}
.comparison-view { display: flex; flex: 1; gap: 10px; height: 100%; }
.pane { flex: 1; display: flex; flex-direction: column; }
.pane.arrow { flex: 0 0 30px; align-items: center; justify-content: center; font-size: 2em; }
.pane textarea { 
    flex: 1; resize: none; 
    background: rgba(0,0,0,0.3); color: var(--smart-text-color, #ccc);
    border: 1px solid var(--smart-border-color, #555);
    font-family: monospace; padding: 10px;
}
.healer-footer { margin-top: 15px; text-align: right; }
</style>
`;
$('head').append(modalStyles);

jQuery(async () => {
    loadSettings();
    console.log(`[${extensionName}] Ready (Manual Modal Mode).`);
});
