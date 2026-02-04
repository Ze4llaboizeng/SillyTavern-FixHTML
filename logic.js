export class HtmlHealerLogic {
    constructor() {
        this.voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
        this.codeBlockRegex = /(```\w*\n\s*<div[\s\S]*?)(\n```)/g;
    }

    // --- SCANNER SYSTEM (NEW) ---
    /**
     * สแกนข้อความทั้งแชทเพื่อหาปัญหาตามประเภทที่ระบุ
     * @param {Array} chatArray - Array ของข้อความ
     * @param {string} type - 'html' หรือ 'codeblock'
     * @returns {Array} - รายการ Candidates [{ index, original, fixed }]
     */
    scanForIssues(chatArray, type) {
        let candidates = [];

        chatArray.forEach((msg, index) => {
            if (!msg.mes) return; // ข้าม System/Image prompts

            const original = msg.mes;
            let fixed = original;
            let foundIssue = false;

            if (type === 'html') {
                // เช็ค HTML ทั่วไป
                fixed = this.fixHtml(original);
                // เช็คว่าแก้ไขแล้วต่างจากเดิมไหม
                if (fixed !== original) foundIssue = true;
            } else if (type === 'codeblock') {
                // เช็ค Code Block
                this.codeBlockRegex.lastIndex = 0;
                if (this.codeBlockRegex.test(original)) {
                    fixed = this.fixUnclosedDivsInCodeBlock(original);
                    if (fixed !== original) foundIssue = true;
                }
            }

            if (foundIssue) {
                candidates.push({
                    index: index,
                    name: msg.name || "User",
                    original: original,
                    fixed: fixed,
                    preview: original.substring(0, 80).replace(/\n/g, " ") + "..."
                });
            }
        });

        return candidates;
    }

    // --- EXISTING LOGIC ---
    parseSegments(rawText) {
        if (!rawText) return { segments: [], isThinkBroken: false };
        let cleanText = rawText.replace(/&lt;think&gt;/gi, "<think>").replace(/&lt;\/think&gt;/gi, "</think>");
        const rawBlocks = cleanText.split(/\n/);
        const hasOpenThink = /<think>/i.test(cleanText);
        const hasCloseThink = /<\/think>/i.test(cleanText);
        const isThinkBroken = hasOpenThink && !hasCloseThink;
        let state = isThinkBroken ? 'think' : 'story'; 
        let segments = [];
        rawBlocks.forEach((line, index) => {
            let text = line.trim();
            if (text === "") { segments.push({ id: index, text: line, type: state }); return; }
            if (state === 'story') { if (/<think>/i.test(text)) state = 'think'; } 
            else if (state === 'think') { if (/<\/think>/i.test(text)) state = 'story'; } 
            if (state === 'think' && /<\/think>/i.test(text)) { segments.push({ id: index, text: line, type: 'think' }); state = 'story'; return; }
            segments.push({ id: index, text: line, type: state });
        });
        return { segments, isThinkBroken };
    }

    fixHtml(text) {
        if (!text) return "";
        const tagRegex = /<(\/?)([a-zA-Z0-9\-\_\.\:]+)([^>]*?)(\/?)>/g;
        let stack = [];
        let result = "";
        let lastIndex = 0;
        let match;
        while ((match = tagRegex.exec(text)) !== null) {
            const fullTag = match[0];
            const isClose = match[1] === "/";
            const tagName = match[2].toLowerCase(); 
            const isSelfClosing = match[4] === "/";
            const offset = match.index;
            result += text.substring(lastIndex, offset);
            lastIndex = tagRegex.lastIndex;
            if (this.voidTags.has(tagName) || isSelfClosing) { result += fullTag; continue; }
            if (!isClose) { stack.push(tagName); result += fullTag; } 
            else {
                if (stack.length > 0) {
                    const top = stack[stack.length - 1];
                    if (top === tagName) { stack.pop(); result += fullTag; } 
                    else {
                        const foundIndex = stack.lastIndexOf(tagName);
                        if (foundIndex !== -1) {
                            while (stack.length > foundIndex + 1) { const unclosed = stack.pop(); result += `</${unclosed}>`; }
                            stack.pop(); result += fullTag;
                        }
                    }
                }
            }
        }
        result += text.substring(lastIndex);
        while (stack.length > 0) { const unclosed = stack.pop(); result += `</${unclosed}>`; }
        return result;
    }

    fixUnclosedDivsInCodeBlock(text) {
        if (!text) return text;
        this.codeBlockRegex.lastIndex = 0;
        if (!this.codeBlockRegex.test(text)) return text;
        return text.replace(this.codeBlockRegex, '$1\n</html>$2');
    }

    countWords(str) {
        if (!str) return 0;
        return str.trim().split(/\s+/).length;
    }
}
