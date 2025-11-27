const extensionName = "html-healer";

// --- Helper: แยกส่วนประกอบข้อความ ---
function splitContent(rawText) {
    // 1. ลองหา <think>...</think> คู่แรก
    const match = rawText.match(/<think>([\s\S]*?)<\/think>/i);
    if (match) {
        return {
            cot: match[1].trim(), // เอาไส้ในออกมา
            main: rawText.replace(match[0], "").trim() // เอาส่วนที่เหลือ (ลบ think ออกแล้ว)
        };
    }

    // 2. ถ้าเจอแต่ <think> เปิด แต่ไม่มีปิด (Broken CoT)
    const openIndex = rawText.search(/<think>/i);
    if (openIndex !== -1) {
        // สมมติว่าตั้งแต่ <think> ไปจนจบคือ CoT ที่ยังไม่ปิด
        const cotContent = rawText.substring(openIndex + 7).trim(); // +7 คือความยาว <think>
        const preContent = rawText.substring(0, openIndex).trim();
        return {
            cot: cotContent,
            main: preContent
        };
    }

    // 3. ถ้าไม่เจออะไรเลย
    return { cot: "", main: rawText };
}

// --- Helper: ซ่อม HTML เฉพาะส่วนเนื้อหา ---
function healHtmlContent(htmlContent) {
    if (!htmlContent) return "";
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    
    // ลบ scripts เพื่อความปลอดภัย
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

    // แยกส่วนข้อความเพื่อนำไปใส่ในกล่อง
    const parts = splitContent(originalText);

    const modalHtml = `
    <div id="html-healer-modal" class="html-healer-overlay">
        <div class="html-healer-box split-mode">
            <div class="healer-header">
                <h3>🧠 CoT & HTML Split Editor</h3>
                <div class="close-btn" onclick="$('#html-healer-modal').remove()">✖</div>
            </div>
            
            <div class="healer-body">
                <div class="editor-section">
                    <div class="section-label">
                        <span><i class="fa-solid fa-brain"></i> Thinking Process (Inner Content)</span>
                        <div class="mini-btn" id="btn-clean-cot">Trim & Clean</div>
                    </div>
                    <textarea id="editor-cot" placeholder="Content inside <think> tags goes here...">${parts.cot}</textarea>
                </div>

                <div class="editor-section">
                    <div class="section-label">
                        <span><i class="fa-solid fa-comment-dots"></i> Main Output (HTML)</span>
                        <div class="mini-btn" id="btn-heal-html">Auto-Heal HTML</div>
                    </div>
                    <textarea id="editor-main" placeholder="Main story content goes here...">${parts.main}</textarea>
                </div>
            </div>

            <div class="healer-footer">
                <div style="font-size: 0.8em; opacity: 0.7; margin-right: auto;">
                    *Cut & Paste text between boxes if the split is wrong.
                </div>
                <button id="btn-save-split" class="menu_button">💾 Merge & Save</button>
            </div>
        </div>
    </div>
    `;

    $('body').append(modalHtml);

    // Event: ปุ่ม Trim CoT
    $('#btn-clean-cot').on('click', () => {
        let val = $('#editor-cot').val();
        // ลบแท็ก <think> ที่อาจจะติดมาออก
        val = val.replace(/<\/?think>/gi, "").trim();
        $('#editor-cot').val(val);
        toastr.info("Cleaned CoT whitespace.");
    });

    // Event: ปุ่ม Heal HTML
    $('#btn-heal-html').on('click', () => {
        let val = $('#editor-main').val();
        let fixed = healHtmlContent(val);
        $('#editor-main').val(fixed);
        toastr.success("HTML Structure Repaired!");
    });

    // Event: Save
    $('#btn-save-split').on('click', async () => {
        const cot = $('#editor-cot').val().trim();
        const main = $('#editor-main').val(); // ไม่ trim main เพราะบางทีต้องการเว้นวรรค
        
        let finalMes = "";
        
        // ประกอบร่างกลับ: ถ้ามี CoT ให้ห่อแท็กให้ด้วย
        if (cot) {
            finalMes += `<think>\n${cot}\n</think>\n`;
        }
        finalMes += main;

        if (chat[targetMessageId].mes !== finalMes) {
            chat[targetMessageId].mes = finalMes;
            await context.saveChat();
            await context.reloadCurrentChat();
            toastr.success("Message updated successfully!");
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
                    Manually split and fix the Thinking Process and Main Content.
                </div>
                <div id="html-healer-open-split" class="menu_button">
                    <i class="fa-solid fa-scissors"></i> Open Split Editor
                </div>
            </div>
        </div>
    </div>
    `;
    $('#extensions_settings').append(settingsHtml);
    
    $('#html-healer-open-split').on('click', openSplitEditor);
}

// CSS สำหรับหน้าต่างแบบใหม่
const splitStyles = `
<style>
.html-healer-overlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.8); z-index: 9999;
    display: flex; justify-content: center; align-items: center;
}
.html-healer-box.split-mode {
    background: var(--smart-background-color, #202020);
    border: 1px solid var(--smart-border-color, #444);
    width: 90%; max-width: 800px; height: 90%;
    display: flex; flex-direction: column;
    border-radius: 10px; padding: 15px;
    box-shadow: 0 0 25px rgba(0,0,0,0.7);
}
.healer-header { display: flex; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px solid #444; padding-bottom: 5px;}
.healer-header h3 { margin: 0; color: var(--smart-text-color, #eee); }
.close-btn { cursor: pointer; font-size: 1.2em; color: #ff5555; }

.healer-body { flex: 1; display: flex; flex-direction: column; gap: 15px; overflow-y: auto; padding-right: 5px; }

.editor-section { display: flex; flex-direction: column; flex: 1; min-height: 200px; }
.section-label { 
    display: flex; justify-content: space-between; align-items: center; 
    margin-bottom: 5px; font-weight: bold; color: var(--smart-text-color);
}
.mini-btn {
    background: #444; color: white; padding: 2px 8px; border-radius: 4px; 
    font-size: 0.8em; cursor: pointer; border: 1px solid #666;
}
.mini-btn:hover { background: #666; }

.editor-section textarea { 
    flex: 1; resize: none; 
    background: rgba(0,0,0,0.2); color: var(--smart-text-color, #ccc);
    border: 1px solid var(--smart-border-color, #555);
    font-family: monospace; padding: 10px; border-radius: 5px;
    line-height: 1.4;
}

.healer-footer { margin-top: 15px; display: flex; align-items: center; }
</style>
`;
$('head').append(splitStyles);

jQuery(async () => {
    loadSettings();
    console.log(`[${extensionName}] Ready (Split Editor Mode).`);
});
