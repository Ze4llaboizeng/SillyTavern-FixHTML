export class HtmlHealerLogic {
    constructor() {
        this.voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
        
        // Regex ตามที่คุณต้องการ: จับ Code Block ที่เริ่มด้วย <div และปิดท้าย
        // Group 1: เปิด code block + เนื้อหา
        // Group 2: ปิด code block (\n```)
        this.codeBlockRegex = /(```\w*\n\s*<div[\s\S]*?)(\n```)/g;
    }

    // ... (ฟังก์ชันเดิม parseSegments, fixHtml, countWords เก็บไว้เหมือนเดิม) ...

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

    countWords(str) {
        if (!str) return 0;
        return str.trim().split(/\s+/).length;
    }

    // --- NEW FEATURE ---
    /**
     * ตรวจสอบว่ามี Code Block ที่ตรงเงื่อนไขหรือไม่
     */
    hasBrokenCodeBlock(text) {
        // Reset lastIndex เพราะใช้ global flag
        this.codeBlockRegex.lastIndex = 0; 
        return this.codeBlockRegex.test(text);
    }

    /**
     * ทำการแทรก </html> ลงไปก่อนปิด block
     */
    fixUnclosedDivsInCodeBlock(text) {
        this.codeBlockRegex.lastIndex = 0;
        // Replacement: ใส่ </html> คั่นกลางระหว่างเนื้อหากับตัวปิด
        return text.replace(this.codeBlockRegex, '$1\n</html>$2');
    }
}
