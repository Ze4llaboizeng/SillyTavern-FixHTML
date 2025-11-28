const extensionName = "html-healer";

// --- 0. Global Settings & Persistence ---
const DEFAULT_CUSTOM_TAGS = "scrollborad.zeal, neon-box, chat-bubble";
let userCustomTags = new Set();
let aiSettings = {
    provider: 'main', // 'main' or 'gemini'
    apiKey: '',
    model: 'gemini-2.5-flash',
    autoLearn: true
};

// --- LOGGING SYSTEM ---
const MAX_LOGS = 50;
let logHistory = [];

function addLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = { time: timestamp, msg: message, type: type };
    
    logHistory.unshift(logEntry);
    if (logHistory.length > MAX_LOGS) logHistory.pop();
    
    const prefix = `[${extensionName}]`;
    if (type === 'error') console.error(prefix, message);
    else if (type === 'warn') console.warn(prefix, message);
    else console.log(prefix, message);
}

function showLogViewer() {
    $('#html-healer-logs').remove();

    let logsHtml = logHistory.map(l => {
        let color = '#ccc';
        if (l.type === 'error') color = '#ff6b6b';
        if (l.type === 'warn') color = '#feca57';
        if (l.type === 'success') color = '#1dd1a1';
        return `<div style="border-bottom:1px solid #444; padding:4px 0; color:${color}; font-family:monospace; font-size:0.85em;">
            <span style="opacity:0.6;">[${l.time}]</span> ${l.msg}
        </div>`;
    }).join('');

    if (logsHtml === "") logsHtml = "<div style='text-align:center; opacity:0.5; padding:20px;'>No logs yet.</div>";

    const modalHtml = `
    <div id="html-healer-logs" class="html-healer-overlay">
        <div class="html-healer-box" style="max-width:600px; height:60vh;">
            <div class="healer-header">
                <div class="header-brand">
                    <div class="header-icon"><i class="fa-solid fa-clipboard-list"></i></div>
                    <div class="header-text"><span class="title">Extension Logs</span></div>
                </div>
                <div class="header-controls">
                    <div class="close-btn" onclick="$('#html-healer-logs').remove()"><i class="fa-solid fa-xmark"></i></div>
                </div>
            </div>
            <div class="healer-body" style="background:#111; overflow-y:auto; padding:10px; display:block;">
                ${logsHtml}
            </div>
            <div class="healer-footer">
                <button onclick="copyLogs()" class="menu_button" style="margin-right:5px; flex:1;"><i class="fa-regular fa-copy"></i> Copy</button>
                <button onclick="$('#html-healer-logs').remove()" class="menu_button" style="background:#444; flex:0 0 80px;">Close</button>
            </div>
        </div>
    </div>`;
    
    $(document.body).append(modalHtml);
}

window.copyLogs = () => {
    const text = logHistory.map(l => `[${l.time}] [${l.type.toUpperCase()}] ${l.msg}`).join('\n');
    navigator.clipboard.writeText(text);
    toastr.success("Logs copied to clipboard");
};

function loadSettingsData() {
    const storedTags = localStorage.getItem('html-healer-custom-tags');
    const rawString = storedTags !== null ? storedTags : DEFAULT_CUSTOM_TAGS;
    
    userCustomTags.clear();
    rawString.split(',').forEach(t => {
        const clean = t.trim().toLowerCase();
        if (clean) userCustomTags.add(clean);
    });

    const storedAi = localStorage.getItem('html-healer-ai-settings');
    if (storedAi) {
        try {
            const parsed = JSON.parse(storedAi);
            aiSettings = { ...aiSettings, ...parsed };
        } catch(e) { console.error("Failed to parse AI settings", e); }
    }

    updateSettingsUI();
}

function updateSettingsUI() {
    if ($('#setting_custom_tags').length) {
        $('#setting_custom_tags').val(Array.from(userCustomTags).join(', '));
    }
    if ($('#setting_ai_provider').length) {
        $('#setting_ai_provider').val(aiSettings.provider);
        $('#setting_gemini_key').val(aiSettings.apiKey);
        $('#setting_gemini_model').val(aiSettings.model);
        $('#setting_auto_learn').prop('checked', aiSettings.autoLearn);
        
        if (aiSettings.provider === 'gemini') {
            $('.gemini-settings').slideDown();
        } else {
            $('.gemini-settings').slideUp();
        }
    }
}

function saveAllSettings() {
    const tagsVal = $('#setting_custom_tags').val();
    
    userCustomTags.clear();
    tagsVal.split(',').forEach(t => {
        const clean = t.trim().toLowerCase();
        if (clean) userCustomTags.add(clean);
    });
    localStorage.setItem('html-healer-custom-tags', Array.from(userCustomTags).join(', '));
    
    aiSettings.provider = $('#setting_ai_provider').val();
    aiSettings.apiKey = $('#setting_gemini_key').val().trim();
    aiSettings.model = $('#setting_gemini_model').val();
    aiSettings.autoLearn = $('#setting_auto_learn').is(':checked');
    
    localStorage.setItem('html-healer-ai-settings', JSON.stringify(aiSettings));

    loadSettingsData();
    toastr.success("Settings Saved!");
    addLog("Settings updated by user.", "info");
}

// --- 1. Core Logic (Analysis & Fix) ---

let initialSegments = []; 
let currentSegments = []; 

function parseSegments(rawText) {
    if (!rawText) return [];
    let cleanText = rawText
        .replace(/&lt;think&gt;/gi, "<think>")
        .replace(/&lt;\/think&gt;/gi, "</think>");

    const rawBlocks = cleanText.split(/\n/).filter(line => line.trim() !== "");
    
    let isThinking = false;
    let hasFoundStoryStart = false;

    return rawBlocks.map((block, index) => {
        let text = block.trim();
        const startsWithComplexTag = /^<[^/](?!br|i|b|em|strong|span|p)[^>]*>?/i.test(text);
        const hasCloseThink = /<\/think>|Close COT|End of thought/i.test(text);
        let assignedType = 'story'; 

        if (!hasFoundStoryStart) {
            if (startsWithComplexTag || /<think>/i.test(text) || isThinking) {
                assignedType = 'think';
                isThinking = true;
            }
            if (hasCloseThink) {
                isThinking = false;
                hasFoundStoryStart = true;
                assignedType = 'think';
            }
        } else {
            assignedType = 'story';
        }
        
        if (index === 0 && !isThinking && !startsWithComplexTag) assignedType = 'story';

        return { id: index, text: text, type: assignedType };
    });
}

function applySplitPoint(startIndex) {
    currentSegments.forEach((seg) => {
        if (seg.id < startIndex) {
            seg.type = 'think';
        } else {
            seg.type = 'story';
        }
    });
}

const STANDARD_TAGS_LIST = new Set([
    "a", "abbr", "address", "article", "aside", "audio", "b", "base", "bdi", "bdo", 
    "blockquote", "body", "br", "button", "canvas", "caption", "cite", "code", "col", 
    "colgroup", "data", "datalist", "dd", "del", "details", "dfn", "dialog", "div", 
    "dl", "dt", "em", "embed", "fieldset", "figcaption", "figure", "footer", "form", 
    "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hr", "html", "i", "iframe", 
    "img", "input", "ins", "kbd", "label", "legend", "li", "link", "main", "map", 
    "mark", "meta", "meter", "nav", "noscript", "object", "ol", "optgroup", "option", 
    "output", "p", "param", "picture", "pre", "progress", "q", "rp", "rt", "ruby", "s", 
    "samp", "script", "section", "select", "small", "source", "span", "strong", "style", 
    "sub", "summary", "sup", "svg", "table", "tbody", "td", "template", "textarea", 
    "tfoot", "th", "thead", "time", "title", "tr", "track", "u", "ul", "var", "video", 
    "wbr", "font", "center", "strike", "tt", "big", "think"
]);

function smartLineFix(fullText) {
    if (!fullText) return "";
    addLog("Starting Robust Stack Fix (Universal Mode)...", "info");

    const tagRegex = /(<\/?(?:[a-zA-Z0-9\.\-\_:]+)[^>]*>)/g;
    const tokens = fullText.split(tagRegex);

    const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
    
    let stack = [];     
    let fixedText = ""; 

    for (let token of tokens) {
        if (!token) continue; 

        if (token.startsWith("<") && token.endsWith(">")) {
            const match = token.match(/^<\/?([a-zA-Z0-9\.\-\_:]+)/);
            
            if (!match || !/^[a-zA-Z]/.test(match[1])) {
                fixedText += token; 
                continue;
            }

            const tagName = match[1].toLowerCase();
            const isClosing = token.startsWith("</");
            const isSelfClosing = /\/>$/.test(token.trim());

            if (voidTags.has(tagName) || isSelfClosing) {
                fixedText += token;
            } else if (isClosing) {
                let foundIdx = -1;
                for (let i = stack.length - 1; i >= 0; i--) {
                    if (stack[i] === tagName) {
                        foundIdx = i;
                        break;
                    }
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

function countWords(str) {
    if (!str) return 0;
    return str.trim().split(/\s+/).length;
}

// --- 2. AI & Learning Logic ---

function learnTagsFromAiOutput(fixedText) {
    if (!aiSettings.autoLearn) return;

    const tagRegex = /<\/?([a-zA-Z0-9\.\-\_:]+)[^>]*>/g;
    let match;
    let newTagsFound = 0;
    let learnedList = [];

    while ((match = tagRegex.exec(fixedText)) !== null) {
        const tagName = match[1].toLowerCase();
        
        if (!STANDARD_TAGS_LIST.has(tagName) && !userCustomTags.has(tagName)) {
            if (/^[a-z][a-z0-9\.\-\_]*$/.test(tagName)) {
                userCustomTags.add(tagName);
                newTagsFound++;
                learnedList.push(tagName);
            }
        }
    }

    if (newTagsFound > 0) {
        localStorage.setItem('html-healer-custom-tags', Array.from(userCustomTags).join(', '));
        if ($('#setting_custom_tags').length) {
            $('#setting_custom_tags').val(Array.from(userCustomTags).join(', '));
        }
        addLog(`Learned ${newTagsFound} new tags: ${learnedList.join(', ')}`, "success");
        toastr.success(`Learned ${newTagsFound} new tags!`);
    }
}

async function callGeminiAPI(prompt, apiKey) {
    if (!apiKey) throw new Error("Missing Gemini API Key in settings.");
    
    const model = aiSettings.model || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    addLog(`Calling Gemini API (${model})...`, "info");
    
    const payload = {
        contents: [{
            parts: [{ text: prompt }]
        }]
    };

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const err = await response.json();
        const errMsg = err.error?.message || "Request failed";
        addLog(`Gemini API Error: ${errMsg}`, "error");
        throw new Error(errMsg);
    }

    const data = await response.json();
    try {
        const result = data.candidates[0].content.parts[0].text;
        addLog("Gemini response received.", "success");
        return result;
    } catch (e) {
        addLog("Failed to parse Gemini response.", "error");
        throw new Error("Unexpected response format from Gemini.");
    }
}

async function runAiFixLogic(textToFix) {
    if (!textToFix || !textToFix.trim()) throw new Error("No text to fix.");

    const prompt = `You are an expert HTML repair tool.
Task: Fix the malformed HTML in the provided text below.
Rules:
1. Close any unclosed tags correctly.
2. Fix broken attributes.
3. PRESERVE <think>...</think> tags and their content exactly as is. DO NOT modify thought process.
4. DO NOT change the story content, dialogue, or descriptions.
5. DO NOT add any conversational text.
6. Return ONLY the raw fixed text.

[TEXT START]
${textToFix}
[TEXT END]`;

    let fixedText = "";
    if (aiSettings.provider === 'gemini') {
        fixedText = await callGeminiAPI(prompt, aiSettings.apiKey);
    } else {
        if (typeof generateQuietPrompt !== 'function') throw new Error("ST Main API unavailable.");
        addLog("Calling Main API (Quiet Prompt)...", "info");
        fixedText = await generateQuietPrompt(prompt, true, false); 
    }
    
    if (!fixedText) throw new Error("AI returned empty response.");
    
    let cleanFixed = fixedText.trim();
    cleanFixed = cleanFixed.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '');
    
    learnTagsFromAiOutput(cleanFixed);
    
    return cleanFixed;
}

async function performAiFixEditor() {
    const mainText = $('#editor-main').val();
    if (!mainText) return toastr.warning("No story text.");

    toastr.info("Sending to AI...", "Fixing");
    addLog("Editor: Initiating AI Fix...", "info");

    try {
        const fixed = await runAiFixLogic(mainText);
        $('#editor-main').val(fixed).trigger('input');
        toastr.success("AI Fix Applied!");
        addLog("Editor: AI Fix successful.", "success");
    } catch (err) {
        console.error(err);
        toastr.error("AI Fix Failed: " + err.message);
        addLog(`Editor: AI Fix Failed: ${err.message}`, "error");
    }
}

// --- 2.5 Quick Fix Selection Logic (Global Button) ---

function showQuickFixPopup() {
    $('#html-healer-qf-popup').remove();
    
    const popupHtml = `
    <div id="html-healer-qf-popup" class="html-healer-overlay">
        <div class="html-healer-box" style="max-width:400px; height:auto; padding:20px;">
            <div style="text-align:center; margin-bottom:15px;">
                <h3 style="margin:0; color:var(--lavender-text);">Choose Fix Method</h3>
                <small style="opacity:0.7;">Select how you want to repair HTML</small>
            </div>
            
            <div style="display:flex; flex-direction:column; gap:10px;">
                <button id="qf-btn-code" class="menu_button" style="padding:15px; text-align:left; display:flex; align-items:center; gap:10px;">
                    <i class="fa-solid fa-code" style="font-size:1.2em; color:#a6b1e1;"></i>
                    <div>
                        <div style="font-weight:bold;">Code Fix</div>
                        <div style="font-size:0.8em; opacity:0.6;">Fast, Offline, Universal Logic</div>
                    </div>
                </button>
                
                <button id="qf-btn-ai" class="menu_button" style="padding:15px; text-align:left; display:flex; align-items:center; gap:10px; border:1px solid var(--smart-theme-color);">
                    <i class="fa-solid fa-robot" style="font-size:1.2em; color:var(--smart-theme-color);"></i>
                    <div>
                        <div style="font-weight:bold; color:var(--smart-theme-color);">AI Fix (Auto-Learn)</div>
                        <div style="font-size:0.8em; opacity:0.6;">Smarter + Learns new tags</div>
                    </div>
                </button>
            </div>
            
            <div style="margin-top:15px; text-align:center;">
                <button onclick="$('#html-healer-qf-popup').remove()" style="background:none; border:none; color:#666; cursor:pointer;">Cancel</button>
            </div>
        </div>
    </div>`;

    $(document.body).append(popupHtml);

    $('#qf-btn-code').on('click', () => {
        $('#html-healer-qf-popup').remove();
        runQuickFix('code');
    });

    $('#qf-btn-ai').on('click', () => {
        $('#html-healer-qf-popup').remove();
        runQuickFix('ai');
    });
}

async function runQuickFix(mode) {
    const context = SillyTavern.getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return toastr.warning("No messages.");

    const lastIndex = chat.length - 1;
    const originalText = chat[lastIndex].mes;
    const hasThinking = /<think|&lt;think|&lt;\/think|<\/think>/i.test(originalText);

    if (mode === 'code') {
        if (hasThinking) {
            toastr.info("Thinking detected! Opening editor for safety.");
            addLog("QuickFix(Code): Thinking detected. Opening editor.", "warn");
            openSplitEditor();
        } else {
            const fixedText = smartLineFix(originalText);
            if (fixedText !== originalText) {
                chat[lastIndex].mes = fixedText;
                await context.saveChat();
                await context.reloadCurrentChat();
                toastr.success("HTML Fixed (Code Hybrid)!");
                addLog("QuickFix(Code): Applied Fix.", "success");
            } else {
                toastr.success("HTML looks good.");
            }
        }
    } else {
        toastr.info("AI is fixing message...", "Please wait");
        addLog("QuickFix(AI): Starting...", "info");
        try {
            const fixedText = await runAiFixLogic(originalText);
            if (fixedText && fixedText !== originalText) {
                chat[lastIndex].mes = fixedText;
                await context.saveChat();
                await context.reloadCurrentChat();
                toastr.success("HTML Fixed by AI!");
                addLog("QuickFix(AI): Success.", "success");
            } else {
                toastr.info("AI made no changes.");
            }
        } catch (err) {
            console.error(err);
            toastr.error("AI Fix Failed: " + err.message);
            addLog(`QuickFix(AI) Failed: ${err.message}`, "error");
        }
    }
}

// --- 3. UI Builder (Split Editor) ---

let targetMessageId = null;

const authorConfig = {
    name: "Zealllll",
    avatarUrl: "scripts/extensions/third-party/SillyTavern-FixHTML/avatar.png"
};

function openSplitEditor() {
    const context = SillyTavern.getContext();
    const chat = context.chat;
    if (!chat || chat.length === 0) return toastr.warning("No messages to fix.");

    const lastIndex = chat.length - 1;
    openTargetedSplitEditor(lastIndex);
}

function openTargetedSplitEditor(msgId) {
    const context = SillyTavern.getContext();
    const chat = context.chat;
    const targetMsg = chat[msgId];
    
    if (!targetMsg) {
        toastr.error("Message not found.");
        return;
    }

    targetMessageId = msgId;
    initialSegments = parseSegments(targetMsg.mes);
    currentSegments = JSON.parse(JSON.stringify(initialSegments));

    const modalHtml = `
    <div id="html-healer-modal" class="html-healer-overlay">
        <div class="html-healer-box">
            <div class="healer-header">
                <div class="header-brand">
                    <div class="header-icon"><i class="fa-solid fa-layer-group"></i></div>
                    <div class="header-text">
                        <span class="title">Seg. Selector (Msg #${msgId})</span>
                    </div>
                </div>

                <div class="header-controls">
                     <button class="reset-btn" id="btn-reset-split" title="Reset">
                        <i class="fa-solid fa-rotate-left"></i>
                     </button>
                     <div class="author-pill">
                        <img src="${authorConfig.avatarUrl}" onerror="this.style.display='none'">
                        <span class="author-name">${authorConfig.name}</span>
                    </div>
                    <div class="close-btn" onclick="$('#html-healer-modal').remove()">
                        <i class="fa-solid fa-xmark"></i>
                    </div>
                </div>
            </div>

            <div class="segment-picker-area">
                <div class="segment-scroller" id="segment-container"></div>
                <div class="picker-instruction">
                    <i class="fa-solid fa-arrow-pointer"></i> Select Start of Story Content
                </div>
            </div>
            
            <div class="healer-body">
                <div id="view-editor" class="view-section active">
                    <div class="editor-group think-group">
                        <div class="group-toolbar">
                            <span class="label"><i class="fa-solid fa-brain"></i> Thinking</span>
                            <div class="toolbar-actions">
                                <span class="word-count" id="count-cot">0w</span>
                                <button class="action-btn" onclick="copyText('editor-cot')"><i class="fa-regular fa-copy"></i></button>
                            </div>
                        </div>
                        <textarea id="editor-cot" placeholder="Thinking process..."></textarea>
                    </div>

                    <div class="editor-group main-group">
                        <div class="group-toolbar">
                            <span class="label"><i class="fa-solid fa-comments"></i> Story</span>
                            <div class="toolbar-actions">
                                <span class="word-count" id="count-main">0w</span>
                                <button class="action-btn" id="btn-ai-fix" style="border-color: var(--smart-theme-color); color:var(--smart-theme-color);">
                                    <i class="fa-solid fa-robot"></i> AI Fix
                                </button>
                                <button class="action-btn" id="btn-heal-html"><i class="fa-solid fa-wand-magic-sparkles"></i> Code Fix</button>
                            </div>
                        </div>
                        <textarea id="editor-main" placeholder="Story content..."></textarea>
                    </div>
                </div>
            </div>

            <div class="healer-footer">
                <button id="btn-save-split" class="save-button">
                    <span class="btn-content"><i class="fa-solid fa-floppy-disk"></i> Save Changes</span>
                </button>
            </div>
        </div>
    </div>
    `;

    $(document.body).append(modalHtml);
    renderSegments();

    $('#segment-container').on('click', '.segment-block', function() {
        const id = $(this).data('id');
        applySplitPoint(id); 
        renderSegments(); 
    });

    $('#btn-reset-split').on('click', () => {
        currentSegments = JSON.parse(JSON.stringify(initialSegments));
        renderSegments();
        toastr.info("Reset to initial detection.");
    });

    $('#btn-heal-html').on('click', () => {
        let val = $('#editor-main').val();
        let fixed = smartLineFix(val);
        $('#editor-main').val(fixed).trigger('input');
        toastr.success("Fixed with Universal Logic");
    });

    $('#btn-ai-fix').on('click', performAiFixEditor);

    $('#editor-cot, #editor-main').on('input', updateCounts);

    $('#btn-save-split').on('click', async () => {
        let cot = $('#editor-cot').val().trim();
        const main = $('#editor-main').val();
        let finalMes = "";

        if (cot) {
            if (!/^<think>/i.test(cot)) { cot = `<think>\n${cot}`; }
            if (!/<\/think>$/i.test(cot)) { cot = `${cot}\n</think>`; }
            finalMes = `${cot}\n${main}`;
        } else {
            finalMes = main;
        }

        if (chat[targetMessageId].mes !== finalMes) {
            chat[targetMessageId].mes = finalMes;
            await context.saveChat();
            await context.reloadCurrentChat();
            toastr.success("Saved!");
            addLog("Editor: Changes saved.", "success");
        }
        $('#html-healer-modal').remove();
    });
}

function renderSegments() {
    const container = $('#segment-container');
    container.empty();
    
    currentSegments.forEach(seg => {
        const isThink = seg.type === 'think';
        const icon = isThink ? '<i class="fa-solid fa-brain"></i>' : '<i class="fa-solid fa-comment"></i>';
        
        container.append(`
            <div class="segment-block type-${seg.type}" data-id="${seg.id}">
                <div class="seg-icon">${icon}</div>
                <div class="seg-text">${seg.text.substring(0, 60)}...</div>
                ${!isThink ? '<div class="seg-badge">Start</div>' : ''} 
            </div>
        `);
    });
    
    $('.seg-badge').hide();
    $('.segment-block.type-story').first().find('.seg-badge').show();

    const thinkText = currentSegments.filter(s => s.type === 'think').map(s => s.text).join('\n');
    const storyText = currentSegments.filter(s => s.type === 'story').map(s => s.text).join('\n');
    
    $('#editor-cot').val(thinkText);
    $('#editor-main').val(storyText);
    updateCounts();
}

const updateCounts = () => {
    $('#count-cot').text(countWords($('#editor-cot').val()) + "w");
    $('#count-main').text(countWords($('#editor-main').val()) + "w");
};

window.copyText = (id) => {
    const el = document.getElementById(id);
    el.select(); navigator.clipboard.writeText(el.value);
    toastr.success("Copied!");
};

// --- 4. Professional Context Menu ---
let contextMenuTargetId = null;

function initContextMenu() {
    $(document).off('contextmenu', '.mes_text');
    $(document).on('contextmenu', '.mes_text', function(e) {
        if (!e.ctrlKey) {
            e.preventDefault();
            const messageBlock = $(this).closest('.mes');
            const mesIdAttr = messageBlock.attr('mesid');
            if (typeof mesIdAttr !== 'undefined') {
                contextMenuTargetId = parseInt(mesIdAttr, 10);
                showContextMenu(e.pageX, e.pageY);
            }
        }
    });

    $(document).on('click', function(e) {
        if (!$(e.target).closest('#html-healer-ctx-menu').length) {
            $('#html-healer-ctx-menu').remove();
        }
    });
}

function showContextMenu(x, y) {
    $('#html-healer-ctx-menu').remove();
    const winWidth = $(window).width();
    const menuWidth = 200; 
    if (x + menuWidth > winWidth) x = winWidth - menuWidth - 10;
    
    const menuHtml = `
    <div id="html-healer-ctx-menu" style="
        position: absolute; top: ${y}px; left: ${x}px; z-index: 100000;
        background: var(--lavender-darker, #1e1b24);
        border: 1px solid var(--lavender-secondary, #a6b1e1);
        border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.5);
        padding: 5px; width: ${menuWidth}px; display: flex; flex-direction: column; gap: 2px;
        backdrop-filter: blur(5px);
    ">
        <div style="padding: 8px 12px; font-size: 0.85em; color: var(--lavender-secondary, #a6b1e1); border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 2px; font-weight: bold;">
            <i class="fa-solid fa-user-doctor"></i> HTML Healer
        </div>
        <button onclick="ctxAction('fix')" class="menu_button" style="text-align:left; padding:10px; border:none; background:transparent; display:flex; gap:10px;">
            <i class="fa-solid fa-wand-magic-sparkles" style="color: #98c379;"></i> <span>Quick Fix Here</span>
        </button>
        <button onclick="ctxAction('edit')" class="menu_button" style="text-align:left; padding:10px; border:none; background:transparent; display:flex; gap:10px;">
            <i class="fa-solid fa-layer-group" style="color: #61afef;"></i> <span>Open Editor</span>
        </button>
    </div>`;
    $('body').append(menuHtml);
}

window.ctxAction = async (action) => {
    $('#html-healer-ctx-menu').remove();
    if (contextMenuTargetId === null) return;
    const context = SillyTavern.getContext();
    const chat = context.chat;
    
    if (action === 'fix') {
        const originalText = chat[contextMenuTargetId].mes;
        addLog(`ContextMenu: Fixing Msg #${contextMenuTargetId}...`, "info");
        const fixedText = smartLineFix(originalText);
        if (fixedText !== originalText) {
            chat[contextMenuTargetId].mes = fixedText;
            await context.saveChat();
            await context.reloadCurrentChat();
            toastr.success(`Fixed Msg #${contextMenuTargetId}`);
            addLog("ContextMenu: Fix applied.", "success");
        } else {
            toastr.info("HTML looks good.");
        }
    } else if (action === 'edit') {
        openTargetedSplitEditor(contextMenuTargetId);
    }
};

// --- 5. Main Initialization ---

function loadSettings() {
    if ($('.html-healer-settings').length > 0) return;
    loadSettingsData();

    const modelOptions = ["gemini-2.5-flash", "gemini-2.5-pro"]
        .map(m => `<option value="${m}">${m}</option>`).join('');

    $('#extensions_settings').append(`
        <div class="html-healer-settings">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>HTML Healer</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <div class="styled_description_block">Editor by ${authorConfig.name}</div>
                    
                    <div style="margin: 10px 0;">
                        <label style="font-weight:bold; font-size:0.9em;">Custom Tags (Manual):</label>
                        <textarea id="setting_custom_tags" rows="2" 
                            style="width:100%; margin-top:5px; background:rgba(0,0,0,0.2); color:#fff; border:1px solid #444; border-radius:5px; padding:5px;"
                            placeholder="e.g. scrollborad.zeal"></textarea>
                    </div>

                    <div style="margin-bottom:10px; display:flex; align-items:center; gap:8px;">
                        <input type="checkbox" id="setting_auto_learn" style="width:16px; height:16px; cursor:pointer;">
                        <label for="setting_auto_learn" style="cursor:pointer; font-size:0.9em;">Auto-learn tags from AI</label>
                    </div>

                    <div style="margin: 10px 0;">
                        <label style="font-weight:bold; font-size:0.9em;">AI Provider:</label>
                        <select id="setting_ai_provider" class="text_pole" style="width:100%; margin-top:5px;">
                            <option value="main">SillyTavern Main API (Default)</option>
                            <option value="gemini">Direct Gemini API (Recommended)</option>
                        </select>
                        <div class="gemini-settings" style="display:none; margin-top:10px; padding-left:10px; border-left:2px solid #4caf50;">
                            <label style="font-size:0.85em;">Gemini API Key:</label>
                            <input type="password" id="setting_gemini_key" class="text_pole" style="width:100%; margin-bottom:5px;" placeholder="AIzaSy...">
                            <label style="font-size:0.85em;">Model Name:</label>
                            <select id="setting_gemini_model" class="text_pole" style="width:100%;">
                                ${modelOptions}
                            </select>
                        </div>
                    </div>

                    <div style="display:flex; gap:5px; margin-top:10px;">
                        <button id="btn_save_all" class="menu_button" style="flex:2; padding:8px; font-weight:bold;">
                            <i class="fa-solid fa-floppy-disk"></i> Save Settings
                        </button>
                        <button id="btn_view_logs" class="menu_button" style="flex:1; padding:8px; background:#444;">
                            <i class="fa-solid fa-list"></i> Logs
                        </button>
                    </div>
                    <hr style="opacity:0.2;">
                    <div style="display:flex; gap:5px; margin-top:5px;">
                        <div id="html-healer-quick-fix" class="menu_button" style="flex:1; background-color: var(--smart-theme-color, #4caf50);">
                            <i class="fa-solid fa-wand-magic-sparkles"></i> Quick Fix (Latest)
                        </div>
                        <div id="html-healer-open-split" class="menu_button" style="flex:1;">
                            <i class="fa-solid fa-layer-group"></i> Open Editor
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `);
    
    $('#setting_ai_provider').on('change', function() {
        if ($(this).val() === 'gemini') $('.gemini-settings').slideDown();
        else $('.gemini-settings').slideUp();
    });

    $('#html-healer-open-split').on('click', openSplitEditor);
    $('#html-healer-quick-fix').on('click', showQuickFixPopup); 
    $('#btn_save_all').on('click', saveAllSettings);
    $('#btn_view_logs').on('click', showLogViewer);
}

jQuery(async () => {
    loadSettings();
    setTimeout(initContextMenu, 2000); 
    console.log(`[${extensionName}] Ready.`);
    addLog(`${extensionName} loaded successfully.`);
});
