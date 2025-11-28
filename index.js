const extensionName = "html-healer";
const extensionAuthor = "Zealllll";

// --- 1. Global State & Settings ---
let userCustomTags = new Set(["scrollborad.zeal", "neon-box", "chat-bubble"]);

// --- 2. Logic: Universal Fixer ---
function smartLineFix(fullText) {
    if (!fullText) return "";
    
    const tagRegex = /(<\/?(?:[a-zA-Z0-9\.\-\_:]+)[^>]*>)/g;
    const tokens = fullText.split(tagRegex);
    const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
    
    let stack = [];     
    let fixedText = ""; 

    for (let token of tokens) {
        if (!token) continue; 
        
        if (token.startsWith("<") && token.endsWith(">")) {
            const match = token.match(/^<\/?([a-zA-Z0-9\.\-\_:]+)/);
            if (!match || !/^[a-zA-Z]/.test(match[1])) { fixedText += token; continue; }

            const tagName = match[1].toLowerCase();
            const isClosing = token.startsWith("</");
            const isSelfClosing = /\/>$/.test(token.trim());

            if (voidTags.has(tagName) || isSelfClosing) {
                fixedText += token;
            } else if (isClosing) {
                let foundIdx = -1;
                for (let i = stack.length - 1; i >= 0; i--) {
                    if (stack[i] === tagName) { foundIdx = i; break; }
                }
                if (foundIdx !== -1) {
                    while (stack.length > foundIdx + 1) {
                        const top = stack.pop();
                        fixedText += `</${top}>`;
                    }
                    stack.pop();
                    fixedText += token;
                } else {
                    fixedText += token;
                }
            } else {
                stack.push(tagName);
                fixedText += token;
            }
        } else {
            fixedText += token;
        }
    }
    while (stack.length > 0) {
        const top = stack.pop();
        fixedText += `</${top}>`;
    }
    return fixedText;
}

// --- 3. UI: Magic Wand Button Injection ---
function addWandToMessage(mesBlock) {
    const btnContainer = mesBlock.find('.mes_edit_buttons, .mes_buttons').first();
    if (btnContainer.find('.healer-wand-btn').length > 0) return;

    const wandBtn = $(`<div class="healer-wand-btn" title="HTML Healer Menu">
        <i class="fa-solid fa-wand-magic-sparkles"></i>
    </div>`);

    wandBtn.on('click', function(e) {
        e.stopPropagation();
        const mesId = mesBlock.attr('mesid');
        const rect = this.getBoundingClientRect();
        showWandMenu(mesId, rect.left, rect.bottom);
    });

    // แทรกปุ่มไว้หน้าสุดของแถวปุ่ม (Prepend)
    btnContainer.prepend(wandBtn);
}

function initMessageObserver() {
    // ใส่ปุ่มให้ข้อความที่มีอยู่แล้ว
    $('.mes').each(function() { addWandToMessage($(this)); });

    // เฝ้าดูข้อความใหม่ที่กำลังจะมา
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.addedNodes.length) {
                $(mutation.addedNodes).each(function() {
                    if ($(this).hasClass('mes')) {
                        addWandToMessage($(this));
                    } else if ($(this).find) {
                        $(this).find('.mes').each(function() { addWandToMessage($(this)); });
                    }
                });
            }
        });
    });

    const chatContainer = document.querySelector('#chat');
    if (chatContainer) {
        observer.observe(chatContainer, { childList: true, subtree: true });
    }
}

// --- 4. UI: Popover Menu ---
function showWandMenu(mesId, x, y) {
    $('.healer-popover').remove();

    const context = SillyTavern.getContext();
    const msg = context.chat[mesId];
    if (!msg) return;

    const selection = window.getSelection().toString().trim();
    const hasSelection = selection.length > 0;
    
    const menuHtml = `
    <div class="healer-popover" style="left:${x}px; top:${y + 10}px;">
        <div class="healer-menu-header">
            <span>MSG #${mesId}</span>
            <span style="opacity:0.5; cursor:pointer;" onclick="$('.healer-popover').remove()">✕</span>
        </div>
        
        <div class="healer-menu-item" id="wand-quick-fix">
            <i class="fa-solid fa-code" style="color:#98c379;"></i>
            <div>
                <div style="font-weight:bold;">Quick Fix (Code)</div>
                <div style="font-size:0.8em; opacity:0.6;">${hasSelection ? 'Fix Selected / Context' : 'Fix Entire Message'}</div>
            </div>
        </div>

        <div class="healer-menu-item" id="wand-open-editor">
            <i class="fa-solid fa-layer-group" style="color:#61afef;"></i>
            <div>
                <div style="font-weight:bold;">Open Split Editor</div>
                <div style="font-size:0.8em; opacity:0.6;">Edit Story & Thoughts</div>
            </div>
        </div>
    </div>`;

    $('body').append(menuHtml);

    // ปรับตำแหน่งไม่ให้หลุดจอขวา
    const $menu = $('.healer-popover');
    if (x + $menu.width() > $(window).width()) {
        $menu.css('left', $(window).width() - $menu.width() - 20 + 'px');
    }

    // Event Handlers
    $('#wand-quick-fix').on('click', async () => {
        $('.healer-popover').remove();
        let originalText = msg.mes;
        // Logic: ถ้ามีการคลุมดำ -> fix ทั้งข้อความอยู่ดีเพื่อความชัวร์ของโครงสร้าง (Safe Mode)
        // หรือถ้าอยาก Advance ค่อยเขียน Regex แทรก แต่เบื้องต้น fix all ปลอดภัยสุด
        let newText = smartLineFix(originalText);

        if (newText !== originalText) {
            msg.mes = newText;
            await context.saveChat();
            await context.reloadCurrentChat();
            toastr.success("HTML Fixed!");
        } else {
            toastr.success("HTML looks good (No changes).");
        }
    });

    $('#wand-open-editor').on('click', () => {
        $('.healer-popover').remove();
        openEditorModal(mesId);
    });

    setTimeout(() => {
        $(document).on('click.healerMenu', function(e) {
            if (!$(e.target).closest('.healer-popover').length) {
                $('.healer-popover').remove();
                $(document).off('click.healerMenu');
            }
        });
    }, 100);
}

// --- 5. UI: Split Editor Modal ---
function openEditorModal(mesId) {
    const context = SillyTavern.getContext();
    const msg = context.chat[mesId];
    if (!msg) return;

    let fullText = msg.mes;
    let thinkContent = "";
    let storyContent = fullText;

    const thinkMatch = fullText.match(/<think>([\s\S]*?)<\/think>/i);
    if (thinkMatch) {
        thinkContent = thinkMatch[1].trim();
        storyContent = fullText.replace(thinkMatch[0], "").trim();
    }

    const modalHtml = `
    <div id="healer-editor-modal" class="html-healer-overlay">
        <div class="html-healer-box">
            <div class="healer-header">
                <div style="font-weight:bold;">
                    <i class="fa-solid fa-pen-to-square"></i> Edit Message #${mesId}
                </div>
                <div style="cursor:pointer;" onclick="$('#healer-editor-modal').remove()">
                    <i class="fa-solid fa-xmark"></i>
                </div>
            </div>
            
            <div class="healer-body">
                <div class="editor-row" style="flex: 0 0 30%;">
                    <div class="toolbar">
                        <span><i class="fa-solid fa-brain"></i> Thinking Process</span>
                        <span style="font-size:0.8em; cursor:pointer; opacity:0.7;" onclick="$('#editor-think').val('')">Clear</span>
                    </div>
                    <textarea id="editor-think" class="healer-input" placeholder="No thought content...">${thinkContent}</textarea>
                </div>

                <div class="editor-row" style="flex: 1;">
                    <div class="toolbar">
                        <span><i class="fa-solid fa-comments"></i> Story Content</span>
                        <div style="display:flex; gap:10px;">
                            <span style="cursor:pointer; color:var(--smart-theme-color, #98c379);" id="btn-editor-fix">
                                <i class="fa-solid fa-wand-magic-sparkles"></i> Auto-Fix HTML
                            </span>
                        </div>
                    </div>
                    <textarea id="editor-story" class="healer-input" placeholder="Story content...">${storyContent}</textarea>
                </div>
            </div>

            <div class="healer-footer">
                <button class="btn-save" id="btn-editor-save"><i class="fa-solid fa-floppy-disk"></i> Save Changes</button>
            </div>
        </div>
    </div>`;

    $('body').append(modalHtml);

    $('#btn-editor-fix').on('click', () => {
        let val = $('#editor-story').val();
        let fixed = smartLineFix(val);
        $('#editor-story').val(fixed);
        toastr.success("Applied HTML Fix to Editor");
    });

    $('#btn-editor-save').on('click', async () => {
        let newThink = $('#editor-think').val().trim();
        let newStory = $('#editor-story').val();
        
        let finalMsg = newStory;
        if (newThink) {
            finalMsg = `<think>\n${newThink}\n</think>\n${newStory}`;
        }

        msg.mes = finalMsg;
        await context.saveChat();
        await context.reloadCurrentChat();
        
        $('#healer-editor-modal').remove();
        toastr.success("Message Saved!");
    });
}

// --- 6. Initialization ---
jQuery(() => {
    console.log(`[${extensionName}] Loading...`);
    setTimeout(initMessageObserver, 1000); // รอให้แชทโหลดเสร็จก่อนค่อยแปะปุ่ม
});
