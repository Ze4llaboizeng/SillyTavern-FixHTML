export class HtmlHealerLogic {
    constructor() {
        this.voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
    }

    /**
     * วิเคราะห์และแยกส่วนประกอบ Text เป็น Story/Think
     * @param {string} rawText 
     * @returns {object} { segments: Array, isThinkBroken: boolean }
     */
    parseSegments(rawText) {
        if (!rawText) return { segments: [], isThinkBroken: false };
        
        let cleanText = rawText
            .replace(/&lt;think&gt;/gi, "<think>")
            .replace(/&lt;\/think&gt;/gi, "</think>");

        const rawBlocks = cleanText.split(/\n/);
        const hasOpenThink = /<think>/i.test(cleanText);
        const hasCloseThink = /<\/think>/i.test(cleanText);
        // ถ้ามีเปิดแต่ไม่มีปิด ถือว่าพัง
        const isThinkBroken = hasOpenThink && !hasCloseThink;

        let state = isThinkBroken ? 'think' : 'story'; 
        let segments = [];

        rawBlocks.forEach((line, index) => {
            let text = line.trim();
            if (text === "") {
                segments.push({ id: index, text: line, type: state });
                return;
            }

            // State Machine Logic
            if (state === 'story') {
                if (/<think>/i.test(text)) state = 'think';
            } else if (state === 'think') {
                if (/<\/think>/i.test(text)) state = 'story'; 
            } 

            // กรณีเจอปิดในบรรทัดนี้ ให้จบบรรทัดนี้เป็น think แล้วเปลี่ยน state
            if (state === 'think' && /<\/think>/i.test(text)) {
                 segments.push({ id: index, text: line, type: 'think' });
                 state = 'story';
                 return;
            }
            
            segments.push({ id: index, text: line, type: state });
        });

        return { segments, isThinkBroken };
    }

    /**
     * อัลกอริทึมซ่อม HTML (Stack-based)
     * @param {string} text 
     * @returns {string} Fixed text
     */
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

            if (this.voidTags.has(tagName) || isSelfClosing) {
                result += fullTag; continue;
            }

            if (!isClose) {
                stack.push(tagName);
                result += fullTag;
            } else {
                if (stack.length > 0) {
                    const top = stack[stack.length - 1];
                    if (top === tagName) {
                        stack.pop(); result += fullTag;
                    } else {
                        const foundIndex = stack.lastIndexOf(tagName);
                        if (foundIndex !== -1) {
                            // ปิด tag ที่ค้างอยู่ให้หมดจนถึงตัวที่เจอ
                            while (stack.length > foundIndex + 1) {
                                const unclosed = stack.pop();
                                result += `</${unclosed}>`; 
                            }
                            stack.pop(); result += fullTag;
                        }
                    }
                }
            }
        }
        result += text.substring(lastIndex);
        // ปิด tag ที่ยังเหลือใน stack
        while (stack.length > 0) {
            const unclosed = stack.pop(); result += `</${unclosed}>`;
        }
        return result;
    }

    countWords(str) {
        if (!str) return 0;
        return str.trim().split(/\s+/).length;
    }
}
