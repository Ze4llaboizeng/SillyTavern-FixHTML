export class HtmlHealerUI {
    constructor(authorConfig) {
        this.config = authorConfig;
    }

    _getHeaderHtml(title, icon) {
        return `
        <div class="healer-header">
            <div class="header-brand">
                <div class="header-icon">${icon}</div>
                <span>${title}</span>
            </div>
            <div class="header-controls">
                <div class="close-btn" id="healer-close-btn"><i class="fa-solid fa-xmark"></i></div>
            </div>
        </div>`;
    }

    // --- NEW: Checklist Modal ---
    renderChecklistModal(title, candidates, onApply) {
        const modalHtml = `
        <div id="html-healer-modal" class="html-healer-overlay">
            <div class="html-healer-box">
                ${this._getHeaderHtml(title, '<i class="fa-solid fa-list-check"></i>')}
                
                <div class="healer-body">
                    <div style="padding: 10px 20px; background: rgba(0,0,0,0.2); font-size: 0.9em; color: #aaa;">
                        Found <b>${candidates.length}</b> messages with issues. Select the ones you want to fix.
                    </div>
                    <div class="checklist-container" id="healer-checklist">
                        <!-- Items injected via JS -->
                    </div>
                </div>

                <div class="healer-footer">
                    <button class="btn btn-secondary" id="btn-select-all">Select All</button>
                    <button class="btn btn-primary" id="btn-apply-fix">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> Fix Selected
                    </button>
                </div>
            </div>
        </div>`;

        $('#html-healer-modal').remove();
        $(document.body).append(modalHtml);

        const container = $('#healer-checklist');
        
        // Render List Items
        candidates.forEach(c => {
            const itemHtml = `
            <label class="checklist-item">
                <input type="checkbox" class="checklist-checkbox" data-index="${c.index}" checked>
                <div class="item-info">
                    <div class="item-id">#${c.index} • ${c.name}</div>
                    <div class="item-preview">${this.escapeHtml(c.preview)}</div>
                </div>
                <div class="item-badge">Fix Available</div>
            </label>`;
            container.append(itemHtml);
        });

        // Event Listeners
        $('#healer-close-btn').on('click', () => this.closeModal());
        
        $('#btn-select-all').on('click', () => {
            const checkboxes = $('.checklist-checkbox');
            const allChecked = checkboxes.length === checkboxes.filter(':checked').length;
            checkboxes.prop('checked', !allChecked);
        });

        $('#btn-apply-fix').on('click', () => {
            const selectedIndices = [];
            $('.checklist-checkbox:checked').each(function() {
                selectedIndices.push(parseInt($(this).data('index')));
            });
            onApply(selectedIndices);
        });
    }

    // --- EXISTING EDITOR ---
    renderEditorModal(segments, callbacks) {
        const modalHtml = `
        <div id="html-healer-modal" class="html-healer-overlay">
            <div class="html-healer-box">
                ${this._getHeaderHtml('Editor (Clean Cut)', '<i class="fa-solid fa-layer-group"></i>')}
                
                <div class="healer-body">
                    <div class="segment-picker-area">
                        <div class="segment-scroller" id="segment-container"></div>
                    </div>
                    
                    <div class="view-section">
                        <div class="editor-group think-group">
                            <div class="group-toolbar">
                                <span><i class="fa-solid fa-brain"></i> Thinking</span>
                                <span class="word-count" id="count-cot">0w</span>
                            </div>
                            <textarea id="editor-cot" placeholder="Thinking process..."></textarea>
                        </div>

                        <div class="editor-group main-group">
                            <div class="group-toolbar">
                                <span><i class="fa-solid fa-comments"></i> Story</span>
                                <span class="word-count" id="count-main">0w</span>
                            </div>
                            <textarea id="editor-main" placeholder="Story content..."></textarea>
                        </div>
                    </div>
                </div>

                <div class="healer-footer">
                    <button class="btn btn-secondary" id="btn-reset-split"><i class="fa-solid fa-rotate-left"></i> Reset</button>
                    <button class="btn btn-primary" id="btn-save-split"><i class="fa-solid fa-floppy-disk"></i> Save</button>
                </div>
            </div>
        </div>`;
        
        $('#html-healer-modal').remove();
        $(document.body).append(modalHtml);
        
        // Bind Events
        $('#healer-close-btn').on('click', () => this.closeModal());
        $('#btn-save-split').on('click', callbacks.onSave);
        $('#btn-reset-split').on('click', callbacks.onReset);
        $('#segment-container').on('click', '.segment-block', function() { callbacks.onSegmentClick($(this).data('id')); });
        $('#editor-cot, #editor-main').on('input', callbacks.onInput);
    }

    renderSegmentsList(segments) {
        const container = $('#segment-container');
        container.empty();
        const firstStoryIndex = segments.findIndex(s => s.type === 'story');
        segments.forEach((seg, index) => {
            const isThink = seg.type === 'think';
            const icon = isThink ? '<i class="fa-solid fa-brain"></i>' : '<i class="fa-solid fa-comment"></i>';
            const classes = isThink ? 'type-think' : 'type-story';
            const style = isThink 
                ? 'background:rgba(33,150,243,0.1); border-left:3px solid #2196f3; color:#90caf9;' 
                : 'background:rgba(76,175,80,0.1); border-left:3px solid #4caf50; color:#a5d6a7;';
            
            container.append(`
            <div class="segment-block" data-id="${seg.id}" style="padding:8px; border-radius:4px; cursor:pointer; display:flex; gap:10px; font-size:0.85em; ${style}">
                <div>${icon}</div>
                <div style="flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">${this.escapeHtml(seg.text.substring(0, 60))}</div>
            </div>`);
        });
    }

    renderHighlightModal(originalText, callbacks) {
        const modalHtml = `
        <div id="html-healer-modal" class="html-healer-overlay">
            <div class="html-healer-box">
                ${this._getHeaderHtml("Split (Highlight)", '<i class="fa-solid fa-highlighter"></i>')}
                <div class="healer-body">
                    <div class="view-section">
                        <div class="editor-group main-group" style="border-color:var(--healer-accent);">
                            <div class="group-toolbar" style="background:rgba(179, 157, 219, 0.1);">
                                <span style="color:var(--healer-accent);"><i class="fa-solid fa-i-cursor"></i> Highlight broken part</span>
                                <button class="btn btn-primary" id="btn-heal-selection" style="padding:2px 8px; font-size:0.75em;">
                                    <i class="fa-solid fa-wand-magic-sparkles"></i> Fix Selection
                                </button>
                            </div>
                            <textarea id="editor-targeted" style="height:300px;">${originalText}</textarea>
                        </div>
                    </div>
                </div>
                <div class="healer-footer">
                     <button class="btn btn-primary" id="btn-save-targeted"><i class="fa-solid fa-floppy-disk"></i> Save</button>
                </div>
            </div>
        </div>`;
        $('#html-healer-modal').remove();
        $(document.body).append(modalHtml);
        $('#healer-close-btn').on('click', () => this.closeModal());
        $('#btn-heal-selection').on('mousedown', (e) => e.preventDefault());
        $('#btn-heal-selection').on('click', callbacks.onFixSelection);
        $('#btn-save-targeted').on('click', callbacks.onSave);
    }

    closeModal() { $('#html-healer-modal').addClass('closing'); setTimeout(() => $('#html-healer-modal').remove(), 200); }
    updateWordCounts(cotCount, mainCount) { $('#count-cot').text(cotCount + "w"); $('#count-main').text(mainCount + "w"); }
    setEditorValues(thinkText, storyText) { $('#editor-cot').val(thinkText); $('#editor-main').val(storyText); if (!thinkText) $('.think-group').hide(); else $('.think-group').show(); }
    escapeHtml(text) { return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
}
