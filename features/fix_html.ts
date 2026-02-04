import { sleep } from '../function/util';

/**
 * Checks if the code block content looks like the target HTML (e.g., div with styles)
 */
function isTargetHTML(code: string): boolean {
    // Basic check for HTML tags often used in these "Iron Decree" style blocks
    return /<div/i.test(code) && /style=/i.test(code);
}

/**
 * Transforms raw HTML into a JS Runner compatible block
 * Wraps the HTML in a print command inside a javascript code block
 */
function convertToJSRunnerCode(html: string): string {
    // Escape backticks to prevent breaking the template string
    const safeHtml = html.replace(/`/g, '\\`').replace(/\$/g, '\\$');
    
    // Construct the JS Runner block
    // We use 'print' assuming it's the standard function in JS Runner to output HTML/Text
    return `\`\`\`javascript
// Fixed for JS Runner
print(\`${safeHtml}\`);
\`\`\``;
}

/**
 * Handles the "Fix" button click
 */
function handleFixClick(event: Event, codeElement: HTMLElement) {
    event.stopPropagation();
    event.preventDefault();

    const rawCode = codeElement.innerText;
    const newCode = convertToJSRunnerCode(rawCode);

    // Replace the content of the code block visually
    // Note: In a full reactive env, we might want to update the data model, 
    // but replacing innerText usually triggers JS Runner if it observes DOM changes or on re-render.
    codeElement.innerText = newCode;
    
    // Change the class to javascript to ensure syntax highlighting update if possible
    codeElement.className = 'language-javascript';
    
    // Remove the button after fixing
    const btn = (event.target as HTMLElement).closest('.js-runner-fix-btn');
    if (btn) btn.remove();
}

/**
 * Adds the fix button to a code block
 */
function addFixButton(preElement: HTMLElement, codeElement: HTMLElement) {
    if (preElement.querySelector('.js-runner-fix-btn')) return;

    const btn = document.createElement('button');
    btn.className = 'js-runner-fix-btn';
    btn.innerHTML = '🔧 Fix for JS Runner';
    btn.title = 'Convert HTML to JS Runner Script';
    
    btn.addEventListener('click', (e) => handleFixClick(e, codeElement));

    // Ensure the pre element is positioned to hold the absolute button
    if (getComputedStyle(preElement).position === 'static') {
        preElement.style.position = 'relative';
    }

    preElement.appendChild(btn);
}

/**
 * Main observer function
 */
export async function initFixHtmlExtension() {
    console.log('[JS Runner] Initializing Fix HTML Extension...');
    
    // Wait for DOM to be somewhat ready
    await sleep(1000);

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node instanceof HTMLElement) {
                    // Check if the added node is a code block or contains one
                    const codeBlocks = node.querySelectorAll ? node.querySelectorAll('pre code') : [];
                    
                    if (node.tagName === 'PRE' && node.querySelector('code')) {
                        processBlock(node as HTMLElement);
                    }
                    
                    codeBlocks.forEach((codeBlock) => {
                        const pre = codeBlock.parentElement;
                        if (pre) processBlock(pre);
                    });
                }
            });
        });
    });

    const chatContainer = document.querySelector('#chat') || document.body;
    observer.observe(chatContainer, { childList: true, subtree: true });

    // Initial scan
    document.querySelectorAll('pre code').forEach((codeBlock) => {
        const pre = codeBlock.parentElement;
        if (pre) processBlock(pre);
    });
}

function processBlock(pre: HTMLElement) {
    const code = pre.querySelector('code');
    if (!code) return;

    // Check if it's HTML
    const isHTML = code.classList.contains('language-html') || code.classList.contains('xml') || code.innerText.trim().startsWith('<');
    
    if (isHTML && isTargetHTML(code.innerText)) {
        addFixButton(pre, code);
    }
}
