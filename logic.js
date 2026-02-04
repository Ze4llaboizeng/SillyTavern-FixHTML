export class HtmlHealerLogic {
    constructor() {
        this.voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
        
        // Regex Pattern: จับ Code Block ที่เริ่มด้วย <div
        // จับ group 1 (เนื้อหา) และ group 2 (ปิด block) เพื่อรอแทรก </html>
        this.codeBlockRegex = /(```\w*\n\s*<div[\s\S]*?)(\n```)/g;
    }

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

    // Fix 1: แก้ HTML ทั่วไป (Stack Logic)
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

    countWords(str) {
        if (!str) return 0;
        return str.trim().split(/\s+/).length;
    }

    // Fix 2: แก้ Code Block (Manual Trigger)
    // ฟังก์ชันนี้จะถูกเรียกเมื่อกดปุ่ม "Complete Block" เท่านั้น
    fixUnclosedDivsInCodeBlock(text) {
        if (!text) return text;
        
        // Reset lastIndex
        this.codeBlockRegex.lastIndex = 0;
        
        // ถ้าไม่เจอ Code block ที่เข้าข่าย ก็คืนค่าเดิมไปเลย
        if (!this.codeBlockRegex.test(text)) return text;

        // ถ้าเจอ ให้แทรก </html> เข้าไปก่อนปิด block
        return text.replace(this.codeBlockRegex, '$1\n</html>$2');
    }
}
