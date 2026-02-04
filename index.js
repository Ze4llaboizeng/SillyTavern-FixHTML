// FixHTML extension by ze4llaboizeng, Modified to work with JS Slash Runner
(function () {
    const extensionName = "SillyTavern-FixHTML";
    const extensionPath = `scripts/extensions/third-party/${extensionName}`;

    // ฟังก์ชันสำหรับค้นหาและแก้ไข Code Block
    function addFixButton() {
        // หาข้อความทั้งหมดในแชท
        const messages = Array.from(document.querySelectorAll('.mes_text'));

        messages.forEach(msg => {
            // หา Code block ที่ยังไม่มีปุ่ม Fix
            const codeBlocks = msg.querySelectorAll('pre code');
            
            codeBlocks.forEach(codeBlock => {
                const preElement = codeBlock.parentElement;
                
                // เช็คว่ามีปุ่มหรือยัง ถ้ามีแล้วข้าม
                if (preElement.querySelector('.fix-html-btn')) return;

                // สร้าง Container สำหรับปุ่ม
                const btnContainer = document.createElement('div');
                btnContainer.className = 'fix-html-actions';
                btnContainer.style.display = 'flex';
                btnContainer.style.gap = '5px';
                btnContainer.style.marginTop = '5px';

                // 1. ปุ่ม Fix HTML (แสดงผลเลย - แบบเดิม)
                const fixBtn = document.createElement('button');
                fixBtn.className = 'menu_button fix-html-btn';
                fixBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Render HTML';
                fixBtn.title = "Render this HTML in-place";
                fixBtn.onclick = () => {
                    const htmlContent = codeBlock.textContent;
                    const renderedDiv = document.createElement('div');
                    renderedDiv.innerHTML = htmlContent;
                    renderedDiv.style.border = '1px dashed #ccc';
                    renderedDiv.style.padding = '10px';
                    renderedDiv.style.marginTop = '10px';
                    
                    // แทรก div ที่ render แล้วต่อท้าย pre
                    preElement.after(renderedDiv);
                };

                // 2. ปุ่ม Send to JS Runner (พระเอกของเรา - อัปเกรดแล้ว)
                const runnerBtn = document.createElement('button');
                runnerBtn.className = 'menu_button fix-html-runner-btn';
                runnerBtn.innerHTML = '<i class="fa-solid fa-play"></i> Send to JS Runner';
                runnerBtn.style.backgroundColor = '#2c3e50'; // สีต่างนิดหน่อยให้แยกออก
                runnerBtn.title = "Send this code to JS Runner Scratchpad/New Script (Auto-wraps HTML fragments)";
                
                runnerBtn.onclick = async () => {
                    let codeContent = codeBlock.textContent;

                    // --- ส่วนที่เพิ่มใหม่: Auto-Fill HTML Structure ---
                    // ตรวจสอบว่าเป็น HTML Fragment หรือไม่ (มีแท็กเปิด <... แต่ไม่มี <!DOCTYPE หรือ <html)
                    const isHtmlFragment = codeContent.trim().match(/^\s*<[a-z][\s\S]*>/i) && 
                                         !codeContent.includes('<!DOCTYPE') && 
                                         !codeContent.includes('<html');

                    if (isHtmlFragment) {
                        // เติมโครงสร้าง HTML มาตรฐานเพื่อให้ JS Runner ทำงานเป็น Frontend Script ได้สมบูรณ์
                        codeContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generated View</title>
    <style>
        /* ตั้งค่าพื้นฐานให้เข้ากับ Dark Mode ของ SillyTavern และ JS Runner */
        body { 
            margin: 0; 
            padding: 10px; 
            background-color: transparent; /* ให้สีพื้นหลังโปร่งใสเพื่อให้เห็นพื้นหลังของ Runner */
            color: #e0e0e0; 
            font-family: sans-serif;
            height: 100vh;
            box-sizing: border-box;
        }
        /* ถ้าใน code block มี body style อยู่แล้ว มันจะทับ style นี้ */
    </style>
</head>
<body>
<!-- Original Fragment Start -->
${codeContent}
<!-- Original Fragment End -->
</body>
</html>`;
                        toastr.info("Added HTML boilerplate for JS Runner compatibility.", "Auto-Fixed Code");
                    }
                    // -----------------------------------------------

                    // พยายามส่งค่าไปที่ JS Slash Runner
                    
                    // วิธี 1: Copy to Clipboard (ชัวร์สุด)
                    try {
                        await navigator.clipboard.writeText(codeContent);
                        toastr.success("Code copied! Open JS Runner and paste it.", "Sent to Clipboard");
                        
                        // พยายามเปิด Panel ของ JS Runner (ถ้าทำได้)
                        const jsRunnerToggle = document.querySelector('div[title*="JS Slash Runner"]'); 
                        if (jsRunnerToggle) {
                            jsRunnerToggle.click();
                        }
                    } catch (err) {
                        console.error('Failed to copy: ', err);
                        toastr.error("Failed to copy code.", "Error");
                    }
                };

                // เพิ่มปุ่มลงใน Container
                btnContainer.appendChild(fixBtn);
                btnContainer.appendChild(runnerBtn);

                // แทรก Container ต่อท้าย pre
                preElement.after(btnContainer);
            });
        });
    }

    // Observer เพื่อคอยดูข้อความใหม่ที่เข้ามา
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.addedNodes.length > 0) {
                addFixButton();
            }
        });
    });

    // เริ่มทำงานเมื่อโหลดหน้าเว็บเสร็จ
    $(document).ready(function () {
        // ใส่ CSS เพิ่มเติมสำหรับปุ่ม
        const style = document.createElement('style');
        style.textContent = `
            .fix-html-actions button {
                font-size: 0.8em;
                padding: 4px 8px;
                cursor: pointer;
                border-radius: 4px;
                border: 1px solid var(--smart-theme-border);
                background-color: var(--smart-theme-bg);
                color: var(--smart-theme-text);
                margin-right: 5px;
            }
            .fix-html-actions button:hover {
                background-color: var(--smart-theme-accent);
            }
            .fix-html-runner-btn:hover {
                 filter: brightness(1.2);
            }
        `;
        document.head.appendChild(style);

        // เริ่ม Observe การเปลี่ยนแปลงใน chat
        const chatContainer = document.querySelector('#chat');
        if (chatContainer) {
            observer.observe(chatContainer, { childList: true, subtree: true });
        }
        
        // รันครั้งแรกเผื่อมีข้อความเก่าอยู่แล้ว
        addFixButton();
    });
})();
