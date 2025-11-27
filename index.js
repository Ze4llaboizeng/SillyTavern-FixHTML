const extensionName = "html-healer";
const defaultDepth = 1;

/**
 * LOGIC 1: The Specialized CoT Fixer
 * Rules:
 * - Only 1 <think> and 1 </think> allowed.
 * - Detect "Close COT" only if it doesn't already have a tag.
 * - Case-insensitive checks to prevent double tagging.
 * - Ensures </think> is followed by a new line.
 */
function fixChainOfThought(text) {
    if (!text) return "";

    // Step A: Count how many <think> tags exist (Case Insensitive)
    const openMatches = text.match(/<think>/gi) || [];
    const openCount = openMatches.length;
    
    // If there are NO <think> tags, we don't need to do anything CoT related.
    if (openCount === 0) return text;

    // Step B: Enforce "Only One <think>"
    if (openCount > 1) {
        console.log(`[${extensionName}] Found multiple <think> tags. Cleaning extras.`);
        const firstIndex = text.search(/<think>/i);
        const firstTag = text.match(/<think>/i)[0];
        
        let before = text.slice(0, firstIndex + firstTag.length);
        let after = text.slice(firstIndex + firstTag.length).replace(/<think>/gi, ""); 
        text = before + after;
    }

    // Step C: Check if it is already closed (Case Insensitive)
    if (/<\/think>/i.test(text)) {
        // Optional: Ensure there is only one closing tag too
        const closeMatches = text.match(/<\/think>/gi) || [];
        if (closeMatches.length > 1) {
             const firstCloseIndex = text.search(/<\/think>/i);
             const firstCloseTag = text.match(/<\/think>/i)[0];

             let before = text.slice(0, firstCloseIndex + firstCloseTag.length);
             let after = text.slice(firstCloseIndex + firstCloseTag.length).replace(/<\/think>/gi, "");
             text = before + after;
        }

        // FORMATTING FIX: Ensure </think> is followed by a new line
        // We replace "</think>" + any immediate whitespace with "</think>\n"
        text = text.replace(/<\/think>\s*/i, "</think>\n");

        return text; 
    }

    // Step D: It is NOT closed. Let's find where to close it.
    const stopPhrases = [
        "Close COT",
        "CLOSE COT",
        "close cot",
        "End of thought",
        "Analysis complete"
    ];

    // Regex: Match phrase if NOT followed by </think> later
    const regexPattern = new RegExp(`(${stopPhrases.join("|")})(?![\\s\\S]*<\\/think>)`, "i");

    if (regexPattern.test(text)) {
        console.log(`[${extensionName}] Found CoT stop phrase. Closing tag.`);
        // Added \n before and after </think> for spacing
        return text.replace(regexPattern, "$1\n</think>\n");
    }

    // Step E: Fallback - Close at end if no phrase found
    console.log(`[${extensionName}] No stop phrase. Force closing at end.`);
    // Added \n before and after
    return text + "\n</think>\n";
}

/**
 * LOGIC 2: General HTML Healer
 * Fixes divs, spans, etc.
 */
function healHtml(dirtyHtml) {
    if (!dirtyHtml) return "";

    // 1. First, fix the CoT Logic strictly
    let preProcessed = fixChainOfThought(dirtyHtml);

    // --- PROTECTION STEP ---
    // Extract <think>...<think> so DOMParser doesn't touch it
    const cotRegex = /<think>[\s\S]*?<\/think>/i;
    const cotMatch = preProcessed.match(cotRegex);
    let storedCot = "";
    let placeholder = "";

    if (cotMatch) {
        storedCot = cotMatch[0];
        preProcessed = preProcessed.replace(cotMatch[0], placeholder);
    }

    // 2. Now use DOMParser for the rest
    const parser = new DOMParser();
    const doc = parser.parseFromString(preProcessed, 'text/html');
    
    // Safety: Remove scripts
    const scripts = doc.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
        scripts[i].parentNode.removeChild(scripts[i]);
    }

    let healedHtml = doc.body.innerHTML;

    // --- RESTORATION STEP ---
    if (storedCot) {
        healedHtml = healedHtml.replace(placeholder, storedCot);
    }

    return healedHtml;
}

/**
 * ACTION: Loop through messages
 */
async function fixMessages() {
    const context = SillyTavern.getContext();
    const chat = context.chat;

    if (!chat || chat.length === 0) {
        toastr.warning("No messages to fix.");
        return;
    }

    let depth = parseInt($('#html-healer-depth').val());
    if (isNaN(depth) || depth < 1) depth = 1;

    let fixCount = 0;
    
    for (let i = 0; i < depth; i++) {
        const targetIndex = chat.length - 1 - i;
        if (targetIndex < 0) break;

        const originalMes = chat[targetIndex].mes;
        const healedMes = healHtml(originalMes);

        if (originalMes !== healedMes) {
            chat[targetIndex].mes = healedMes;
            fixCount++;
        }
    }

    if (fixCount === 0) {
        toastr.info(`Checked last ${depth} messages. Logic & HTML are healthy.`);
    } else {
        await context.saveChat();
        await context.reloadCurrentChat();
        toastr.success(`Repaired ${fixCount} message(s)!`, "HTML Healer");
    }
}

/**
 * UI: Settings Menu
 */
function loadSettings() {
    const settingsHtml = `
    <div class="html-healer-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>HTML & CoT Healer</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            
            <div class="inline-drawer-content">
                <div class="styled_description_block">
                    Ensures single &lt;think&gt; tags and closes generic HTML.
                </div>
                
                <div class="healer-controls">
                    <label for="html-healer-depth">Scan Depth:</label>
                    <input id="html-healer-depth" type="number" class="text_pole" min="1" max="50" value="${defaultDepth}" />
                </div>

                <div id="html-healer-btn" class="menu_button">
                    <i class="fa-solid fa-brain"></i> Fix Logic & HTML
                </div>
            </div>
        </div>
    </div>
    `;

    $('#extensions_settings').append(settingsHtml);
    $('#html-healer-btn').on('click', () => fixMessages());
}

jQuery(async () => {
    loadSettings();
    console.log(`[${extensionName}] Ready (Formatted CoT).`);
});
             const firstCloseIndex = text.search(/<\/think>/i);
             const firstCloseTag = text.match(/<\/think>/i)[0];

             let before = text.slice(0, firstCloseIndex + firstCloseTag.length);
             let after = text.slice(firstCloseIndex + firstCloseTag.length).replace(/<\/think>/gi, "");
             text = before + after;
        }

        // FORMATTING: Ensure </think> is followed by a new line
        text = text.replace(/<\/think>\s*/i, "</think>\n");
        return text; 
    }

    // Step D: It is NOT closed. Check for Explicit Stop Phrases.
    const stopPhrases = [
        "Close COT",
        "CLOSE COT",
        "close cot",
        "End of thought",
        "Analysis complete"
    ];
    // Regex: Match phrase if NOT followed by </think> later
    const stopRegex = new RegExp(`(${stopPhrases.join("|")})(?![\\s\\S]*<\\/think>)`, "i");

    if (stopRegex.test(text)) {
        console.log(`[${extensionName}] Found CoT stop phrase. Closing tag.`);
        return text.replace(stopRegex, "$1\n</think>\n");
    }

    // Step E: (NEW) Check for Implicit "Story Starters"
    // If we see a Double Newline followed by a Quote (") or Asterisk (*), 
    // it's highly likely the story has started. We close the thought BEFORE that.
    // Explanation:
    // \n\n       -> Looks for a paragraph break
    // (?=["*])   -> Lookahead: Is the next character a " or * ?
    const storyStartRegex = /\n\n(?=["*])/;
    
    if (storyStartRegex.test(text)) {
        console.log(`[${extensionName}] Found story starter (Quote/Asterisk). Closing thought before it.`);
        // We replace the \n\n with \n</think>\n\n to close it cleanly before the story
        return text.replace(storyStartRegex, "\n</think>\n\n");
    }

    // Step F: Fallback - Close at end if absolutely nothing else was found
    console.log(`[${extensionName}] No stop phrase or story start found. Force closing at end.`);
    return text + "\n</think>\n";
}

/**
 * LOGIC 2: General HTML Healer
 * Fixes divs, spans, etc.
 */
function healHtml(dirtyHtml) {
    if (!dirtyHtml) return "";

    // 1. First, fix the CoT Logic strictly
    let preProcessed = fixChainOfThought(dirtyHtml);

    // --- PROTECTION STEP ---
    // Extract <think>...<think> so DOMParser doesn't touch it
    const cotRegex = /<think>[\s\S]*?<\/think>/i;
    const cotMatch = preProcessed.match(cotRegex);
    let storedCot = "";
    let placeholder = "";

    if (cotMatch) {
        storedCot = cotMatch[0];
        preProcessed = preProcessed.replace(cotMatch[0], placeholder);
    }

    // 2. Now use DOMParser for the rest
    const parser = new DOMParser();
    const doc = parser.parseFromString(preProcessed, 'text/html');
    
    // Safety: Remove scripts
    const scripts = doc.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
        scripts[i].parentNode.removeChild(scripts[i]);
    }

    let healedHtml = doc.body.innerHTML;

    // --- RESTORATION STEP ---
    if (storedCot) {
        healedHtml = healedHtml.replace(placeholder, storedCot);
    }

    return healedHtml;
}

/**
 * ACTION: Loop through messages
 */
async function fixMessages() {
    const context = SillyTavern.getContext();
    const chat = context.chat;

    if (!chat || chat.length === 0) {
        toastr.warning("No messages to fix.");
        return;
    }

    let depth = parseInt($('#html-healer-depth').val());
    if (isNaN(depth) || depth < 1) depth = 1;

    let fixCount = 0;
    
    for (let i = 0; i < depth; i++) {
        const targetIndex = chat.length - 1 - i;
        if (targetIndex < 0) break;

        const originalMes = chat[targetIndex].mes;
        const healedMes = healHtml(originalMes);

        if (originalMes !== healedMes) {
            chat[targetIndex].mes = healedMes;
            fixCount++;
        }
    }

    if (fixCount === 0) {
        toastr.info(`Checked last ${depth} messages. Logic & HTML are healthy.`);
    } else {
        await context.saveChat();
        await context.reloadCurrentChat();
        toastr.success(`Repaired ${fixCount} message(s)!`, "HTML Healer");
    }
}

/**
 * UI: Settings Menu
 */
function loadSettings() {
    const settingsHtml = `
    <div class="html-healer-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>HTML & CoT Healer</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            
            <div class="inline-drawer-content">
                <div class="styled_description_block">
                    Ensures single &lt;think&gt; tags and closes generic HTML.
                </div>
                
                <div class="healer-controls">
                    <label for="html-healer-depth">Scan Depth:</label>
                    <input id="html-healer-depth" type="number" class="text_pole" min="1" max="50" value="${defaultDepth}" />
                </div>

                <div id="html-healer-btn" class="menu_button">
                    <i class="fa-solid fa-brain"></i> Fix Logic & HTML
                </div>
            </div>
        </div>
    </div>
    `;

    $('#extensions_settings').append(settingsHtml);
    $('#html-healer-btn').on('click', () => fixMessages());
}

jQuery(async () => {
    loadSettings();
    console.log(`[${extensionName}] Ready (Smart Story Detection).`);
});
        if (closeMatches.length > 1) {
             const firstCloseIndex = text.search(/<\/think>/i);
             const firstCloseTag = text.match(/<\/think>/i)[0];

             let before = text.slice(0, firstCloseIndex + firstCloseTag.length);
             let after = text.slice(firstCloseIndex + firstCloseTag.length).replace(/<\/think>/gi, "");
             text = before + after;
        }

        // FORMATTING: Ensure </think> is followed by a new line
        text = text.replace(/<\/think>\s*/i, "</think>\n");
        return text; 
    }

    // Step D: It is NOT closed. Check for Explicit Stop Phrases.
    const stopPhrases = [
        "Close COT",
        "CLOSE COT",
        "close cot",
        "End of thought",
        "Analysis complete"
    ];
    // Regex: Match phrase if NOT followed by </think> later
    const stopRegex = new RegExp(`(${stopPhrases.join("|")})(?![\\s\\S]*<\\/think>)`, "i");

    if (stopRegex.test(text)) {
        console.log(`[${extensionName}] Found CoT stop phrase. Closing tag.`);
        return text.replace(stopRegex, "$1\n</think>\n");
    }

    // Step E: Check for Implicit "Story Starters"
    // If we see a Double Newline followed by a Quote (") or Asterisk (*), 
    // it's highly likely the story has started. We close the thought BEFORE that.
    const storyStartRegex = /\n\n(?=["*])/;
    
    if (storyStartRegex.test(text)) {
        console.log(`[${extensionName}] Found story starter (Quote/Asterisk). Closing thought before it.`);
        return text.replace(storyStartRegex, "\n</think>\n\n");
    }

    // Step F: Check for ANY HTML tag that indicates content start
    // We look for '<' followed by a letter or '/' that is NOT 'think' or '/think'.
    // Use new RegExp to be safe against copy-paste syntax errors
    const htmlTagRegex = new RegExp("<(?!/?think\\b)[a-zA-Z/]", "i");

    if (htmlTagRegex.test(text)) {
        console.log(`[${extensionName}] Found HTML tag start. Closing thought before it.`);
        // Find the index of this tag to insert </think> right before it
        const matchIndex = text.search(htmlTagRegex);
        const before = text.slice(0, matchIndex);
        const after = text.slice(matchIndex);
        return before + "\n</think>\n" + after;
    }

    // Step G: Fallback - Close at end if absolutely nothing else was found
    console.log(`[${extensionName}] No stop phrase, story start, or HTML tag found. Force closing at end.`);
    return text + "\n</think>\n";
}

/**
 * LOGIC 2: General HTML Healer
 * Fixes divs, spans, etc.
 */
function healHtml(dirtyHtml) {
    if (!dirtyHtml) return "";

    // 1. First, fix the CoT Logic strictly
    let preProcessed = fixChainOfThought(dirtyHtml);

    // --- PROTECTION STEP ---
    // Extract <think>...<think> so DOMParser doesn't touch it
    const cotRegex = /<think>[\s\S]*?<\/think>/i;
    const cotMatch = preProcessed.match(cotRegex);
    let storedCot = "";
    let placeholder = "";

    if (cotMatch) {
        storedCot = cotMatch[0];
        preProcessed = preProcessed.replace(cotMatch[0], placeholder);
    }

    // 2. Now use DOMParser for the rest
    const parser = new DOMParser();
    const doc = parser.parseFromString(preProcessed, 'text/html');
    
    // Safety: Remove scripts
    const scripts = doc.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
        scripts[i].parentNode.removeChild(scripts[i]);
    }

    let healedHtml = doc.body.innerHTML;

    // --- RESTORATION STEP ---
    if (storedCot) {
        healedHtml = healedHtml.replace(placeholder, storedCot);
    }

    return healedHtml;
}

/**
 * ACTION: Loop through messages
 */
async function fixMessages() {
    const context = SillyTavern.getContext();
    const chat = context.chat;

    if (!chat || chat.length === 0) {
        toastr.warning("No messages to fix.");
        return;
    }

    let depth = parseInt($('#html-healer-depth').val());
    if (isNaN(depth) || depth < 1) depth = 1;

    let fixCount = 0;
    
    for (let i = 0; i < depth; i++) {
        const targetIndex = chat.length - 1 - i;
        if (targetIndex < 0) break;

        const originalMes = chat[targetIndex].mes;
        const healedMes = healHtml(originalMes);

        if (originalMes !== healedMes) {
            chat[targetIndex].mes = healedMes;
            fixCount++;
        }
    }

    if (fixCount === 0) {
        toastr.info(`Checked last ${depth} messages. Logic & HTML are healthy.`);
    } else {
        await context.saveChat();
        await context.reloadCurrentChat();
        toastr.success(`Repaired ${fixCount} message(s)!`, "HTML Healer");
    }
}

/**
 * UI: Settings Menu
 */
function loadSettings() {
    const settingsHtml = `
    <div class="html-healer-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>HTML & CoT Healer</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            
            <div class="inline-drawer-content">
                <div class="styled_description_block">
                    Ensures single &lt;think&gt; tags and closes generic HTML.
                </div>
                
                <div class="healer-controls">
                    <label for="html-healer-depth">Scan Depth:</label>
                    <input id="html-healer-depth" type="number" class="text_pole" min="1" max="50" value="${defaultDepth}" />
                </div>

                <div id="html-healer-btn" class="menu_button">
                    <i class="fa-solid fa-brain"></i> Fix Logic & HTML
                </div>
            </div>
        </div>
    </div>
    `;

    $('#extensions_settings').append(settingsHtml);
    $('#html-healer-btn').on('click', () => fixMessages());
}

jQuery(async () => {
    try {
        loadSettings();
        console.log(`[${extensionName}] Ready (HTML Tag Detection Mode).`);
    } catch (e) {
        console.error(`[${extensionName}] ERROR:`, e);
        if (typeof toastr !== "undefined") {
            toastr.error("HTML Healer failed to load. Check console.", "Extension Error");
        }
    }
});
        const closeMatches = text.match(/<\/think>/gi) || [];
        if (closeMatches.length > 1) {
             const firstCloseIndex = text.search(/<\/think>/i);
             const firstCloseTag = text.match(/<\/think>/i)[0];

             let before = text.slice(0, firstCloseIndex + firstCloseTag.length);
             let after = text.slice(firstCloseIndex + firstCloseTag.length).replace(/<\/think>/gi, "");
             text = before + after;
        }

        // FORMATTING: Ensure </think> is followed by a new line
        text = text.replace(/<\/think>\s*/i, "</think>\n");
        return text; 
    }

    // Step D: It is NOT closed. Check for Explicit Stop Phrases.
    const stopPhrases = [
        "Close COT",
        "CLOSE COT",
        "close cot",
        "End of thought",
        "Analysis complete"
    ];
    // Regex: Match phrase if NOT followed by </think> later
    const stopRegex = new RegExp(`(${stopPhrases.join("|")})(?![\\s\\S]*<\\/think>)`, "i");

    if (stopRegex.test(text)) {
        console.log(`[${extensionName}] Found CoT stop phrase. Closing tag.`);
        return text.replace(stopRegex, "$1\n</think>\n");
    }

    // Step E: Check for Implicit "Story Starters"
    // If we see a Double Newline followed by a Quote (") or Asterisk (*), 
    // it's highly likely the story has started. We close the thought BEFORE that.
    const storyStartRegex = /\n\n(?=["*])/;
    
    if (storyStartRegex.test(text)) {
        console.log(`[${extensionName}] Found story starter (Quote/Asterisk). Closing thought before it.`);
        return text.replace(storyStartRegex, "\n</think>\n\n");
    }

    // Step F: (NEW) Check for ANY HTML tag that indicates content start
    // We look for any '<' followed by a letter or '/' that is NOT 'think' or '/think'.
    // Examples: <div, <span, <br>, </div>, <p>
    // Regex breakdown:
    // <               -> Match opening bracket
    // (?!\/?think\b)  -> Negative lookahead: Ensure it's NOT <think or </think
    // [a-zA-Z\/]      -> Match the start of a tag name or closing slash
    const htmlTagRegex = /<(?!\/?think\b)[a-zA-Z\/]/i;

    if (htmlTagRegex.test(text)) {
        console.log(`[${extensionName}] Found HTML tag start. Closing thought before it.`);
        // Find the index of this tag to insert </think> right before it
        const matchIndex = text.search(htmlTagRegex);
        const before = text.slice(0, matchIndex);
        const after = text.slice(matchIndex);
        return before + "\n</think>\n" + after;
    }

    // Step G: Fallback - Close at end if absolutely nothing else was found
    console.log(`[${extensionName}] No stop phrase, story start, or HTML tag found. Force closing at end.`);
    return text + "\n</think>\n";
}

/**
 * LOGIC 2: General HTML Healer
 * Fixes divs, spans, etc.
 */
function healHtml(dirtyHtml) {
    if (!dirtyHtml) return "";

    // 1. First, fix the CoT Logic strictly
    let preProcessed = fixChainOfThought(dirtyHtml);

    // --- PROTECTION STEP ---
    // Extract <think>...<think> so DOMParser doesn't touch it
    const cotRegex = /<think>[\s\S]*?<\/think>/i;
    const cotMatch = preProcessed.match(cotRegex);
    let storedCot = "";
    let placeholder = "";

    if (cotMatch) {
        storedCot = cotMatch[0];
        preProcessed = preProcessed.replace(cotMatch[0], placeholder);
    }

    // 2. Now use DOMParser for the rest
    const parser = new DOMParser();
    const doc = parser.parseFromString(preProcessed, 'text/html');
    
    // Safety: Remove scripts
    const scripts = doc.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
        scripts[i].parentNode.removeChild(scripts[i]);
    }

    let healedHtml = doc.body.innerHTML;

    // --- RESTORATION STEP ---
    if (storedCot) {
        healedHtml = healedHtml.replace(placeholder, storedCot);
    }

    return healedHtml;
}

/**
 * ACTION: Loop through messages
 */
async function fixMessages() {
    const context = SillyTavern.getContext();
    const chat = context.chat;

    if (!chat || chat.length === 0) {
        toastr.warning("No messages to fix.");
        return;
    }

    let depth = parseInt($('#html-healer-depth').val());
    if (isNaN(depth) || depth < 1) depth = 1;

    let fixCount = 0;
    
    for (let i = 0; i < depth; i++) {
        const targetIndex = chat.length - 1 - i;
        if (targetIndex < 0) break;

        const originalMes = chat[targetIndex].mes;
        const healedMes = healHtml(originalMes);

        if (originalMes !== healedMes) {
            chat[targetIndex].mes = healedMes;
            fixCount++;
        }
    }

    if (fixCount === 0) {
        toastr.info(`Checked last ${depth} messages. Logic & HTML are healthy.`);
    } else {
        await context.saveChat();
        await context.reloadCurrentChat();
        toastr.success(`Repaired ${fixCount} message(s)!`, "HTML Healer");
    }
}

/**
 * UI: Settings Menu
 */
function loadSettings() {
    const settingsHtml = `
    <div class="html-healer-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>HTML & CoT Healer</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            
            <div class="inline-drawer-content">
                <div class="styled_description_block">
                    Ensures single &lt;think&gt; tags and closes generic HTML.
                </div>
                
                <div class="healer-controls">
                    <label for="html-healer-depth">Scan Depth:</label>
                    <input id="html-healer-depth" type="number" class="text_pole" min="1" max="50" value="${defaultDepth}" />
                </div>

                <div id="html-healer-btn" class="menu_button">
                    <i class="fa-solid fa-brain"></i> Fix Logic & HTML
                </div>
            </div>
        </div>
    </div>
    `;

    $('#extensions_settings').append(settingsHtml);
    $('#html-healer-btn').on('click', () => fixMessages());
}

jQuery(async () => {
    loadSettings();
    console.log(`[${extensionName}] Ready (HTML Tag Detection Mode).`);
});
             let after = text.slice(firstCloseIndex + firstCloseTag.length).replace(/<\/think>/gi, "");
             text = before + after;
        }

        // FORMATTING: Ensure </think> is followed by a new line
        text = text.replace(/<\/think>\s*/i, "</think>\n");
        return text; 
    }

    // Step D: It is NOT closed. Check for Explicit Stop Phrases.
    const stopPhrases = [
        "Close COT",
        "CLOSE COT",
        "close cot",
        "End of thought",
        "Analysis complete"
    ];
    // Regex: Match phrase if NOT followed by </think> later
    const stopRegex = new RegExp(`(${stopPhrases.join("|")})(?![\\s\\S]*<\\/think>)`, "i");

    if (stopRegex.test(text)) {
        console.log(`[${extensionName}] Found CoT stop phrase. Closing tag.`);
        return text.replace(stopRegex, "$1\n</think>\n");
    }

    // Step E: Check for Implicit "Story Starters"
    // If we see a Double Newline followed by a Quote (") or Asterisk (*), 
    // it's highly likely the story has started. We close the thought BEFORE that.
    const storyStartRegex = /\n\n(?=["*])/;
    
    if (storyStartRegex.test(text)) {
        console.log(`[${extensionName}] Found story starter (Quote/Asterisk). Closing thought before it.`);
        return text.replace(storyStartRegex, "\n</think>\n\n");
    }

    // Step F: (NEW) Check for ANY HTML tag that indicates content start
    // We look for any '<' followed by a letter or '/' that is NOT 'think' or '/think'.
    // Examples: <div, <span, <br>, </div>, <p>
    // Regex breakdown:
    // <               -> Match opening bracket
    // (?!\/?think\b)  -> Negative lookahead: Ensure it's NOT <think or </think
    // [a-zA-Z\/]      -> Match the start of a tag name or closing slash
    const htmlTagRegex = /<(?!\/?think\b)[a-zA-Z\/]/i;

    if (htmlTagRegex.test(text)) {
        console.log(`[${extensionName}] Found HTML tag start. Closing thought before it.`);
        // Find the index of this tag to insert </think> right before it
        const matchIndex = text.search(htmlTagRegex);
        const before = text.slice(0, matchIndex);
        const after = text.slice(matchIndex);
        return before + "\n</think>\n" + after;
    }

    // Step G: Fallback - Close at end if absolutely nothing else was found
    console.log(`[${extensionName}] No stop phrase, story start, or HTML tag found. Force closing at end.`);
    return text + "\n</think>\n";
}

/**
 * LOGIC 2: General HTML Healer
 * Fixes divs, spans, etc.
 */
function healHtml(dirtyHtml) {
    if (!dirtyHtml) return "";

    // 1. First, fix the CoT Logic strictly
    let preProcessed = fixChainOfThought(dirtyHtml);

    // --- PROTECTION STEP ---
    // Extract <think>...<think> so DOMParser doesn't touch it
    const cotRegex = /<think>[\s\S]*?<\/think>/i;
    const cotMatch = preProcessed.match(cotRegex);
    let storedCot = "";
    let placeholder = "";

    if (cotMatch) {
        storedCot = cotMatch[0];
        preProcessed = preProcessed.replace(cotMatch[0], placeholder);
    }

    // 2. Now use DOMParser for the rest
    const parser = new DOMParser();
    const doc = parser.parseFromString(preProcessed, 'text/html');
    
    // Safety: Remove scripts
    const scripts = doc.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
        scripts[i].parentNode.removeChild(scripts[i]);
    }

    let healedHtml = doc.body.innerHTML;

    // --- RESTORATION STEP ---
    if (storedCot) {
        healedHtml = healedHtml.replace(placeholder, storedCot);
    }

    return healedHtml;
}

/**
 * ACTION: Loop through messages
 */
async function fixMessages() {
    const context = SillyTavern.getContext();
    const chat = context.chat;

    if (!chat || chat.length === 0) {
        toastr.warning("No messages to fix.");
        return;
    }

    let depth = parseInt($('#html-healer-depth').val());
    if (isNaN(depth) || depth < 1) depth = 1;

    let fixCount = 0;
    
    for (let i = 0; i < depth; i++) {
        const targetIndex = chat.length - 1 - i;
        if (targetIndex < 0) break;

        const originalMes = chat[targetIndex].mes;
        const healedMes = healHtml(originalMes);

        if (originalMes !== healedMes) {
            chat[targetIndex].mes = healedMes;
            fixCount++;
        }
    }

    if (fixCount === 0) {
        toastr.info(`Checked last ${depth} messages. Logic & HTML are healthy.`);
    } else {
        await context.saveChat();
        await context.reloadCurrentChat();
        toastr.success(`Repaired ${fixCount} message(s)!`, "HTML Healer");
    }
}

/**
 * UI: Settings Menu
 */
function loadSettings() {
    const settingsHtml = `
    <div class="html-healer-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>HTML & CoT Healer</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            
            <div class="inline-drawer-content">
                <div class="styled_description_block">
                    Ensures single &lt;think&gt; tags and closes generic HTML.
                </div>
                
                <div class="healer-controls">
                    <label for="html-healer-depth">Scan Depth:</label>
                    <input id="html-healer-depth" type="number" class="text_pole" min="1" max="50" value="${defaultDepth}" />
                </div>

                <div id="html-healer-btn" class="menu_button">
                    <i class="fa-solid fa-brain"></i> Fix Logic & HTML
                </div>
            </div>
        </div>
    </div>
    `;

    $('#extensions_settings').append(settingsHtml);
    $('#html-healer-btn').on('click', () => fixMessages());
}

jQuery(async () => {
    loadSettings();
    console.log(`[${extensionName}] Ready (HTML Tag Detection Mode).`);
});
`Checked last ${depth} messages. Logic & HTML are healthy.`);
    } else {
        await context.saveChat();
        await context.reloadCurrentChat();
        toastr.success(`Repaired ${fixCount} message(s)!`, "HTML Healer");
    }
}

/**
 * UI: Settings Menu
 */
function loadSettings() {
    const settingsHtml = `
    <div class="html-healer-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>HTML & CoT Healer</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            
            <div class="inline-drawer-content">
                <div class="styled_description_block">
                    Ensures single &lt;think&gt; tags and closes generic HTML.
                </div>
                
                <div class="healer-controls">
                    <label for="html-healer-depth">Scan Depth:</label>
                    <input id="html-healer-depth" type="number" class="text_pole" min="1" max="50" value="${defaultDepth}" />
                </div>

                <div id="html-healer-btn" class="menu_button">
                    <i class="fa-solid fa-brain"></i> Fix Logic & HTML
                </div>
            </div>
        </div>
    </div>
    `;

    $('#extensions_settings').append(settingsHtml);
    $('#html-healer-btn').on('click', () => fixMessages());
}

jQuery(async () => {
    loadSettings();
    console.log(`[${extensionName}] Ready (Strict Mode + Protected CoT).`);
});
