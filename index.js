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
