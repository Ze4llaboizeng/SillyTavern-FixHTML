export class HtmlHealerUI {
    constructor(authorConfig) {
        this.config = authorConfig;
    }

    _getHeaderHtml(title, icon) {
        return `
        <div class="healer-header">
            <div class="header-brand">
                <div class="header-icon">${icon}</div>
                <div class="header-text"><span class="title">${title}</span></div>
            </div>
            <div class="header-controls">
                 <div class="author-pill">
                    <img src="${this.config.avatarUrl}" onerror="this.style.display='none'">
                    <span class="author-name">${this.config.name}</span>
                </div>
                <div class="close-btn" id="healer-close-btn"><i class="fa-solid fa-xmark"></i></div>
            </div>
        </div>`;
    }

    renderEditorModal(segments, callbacks) {
        const modalHtml = `
        <div id="html-healer-modal" class="html-healer-overlay">
            <div class="html-healer-box">
                ${this._getHeaderHtml('Editor (Clean Cut)', '<i class="fa-solid fa-layer-group"></i>')}
                <div class="healer-toolbar-top">
                     <button class="reset-btn" id="btn-reset-split" title="Reset"><i class="fa-solid fa-rotate-left"></i> Reset Segments</button>
                </div>
                <div class="segment-picker-area">
                    <div class="segment-scroller" id="segment-container"></div>
                    <div class="picker-instruction"><i class="fa-solid fa-arrow-pointer"></i> Click on the first Story line</div>
                </div>
                <div class="healer-body">
                    <div class="view-section active">
                        <div class="editor-group think-group">
                            <div class="group-toolbar think-bg"><span class="label think-color"><i class="fa-solid fa-brain"></i> Thinking</span><span class="word-count" id="count-cot">0w</span></div>
                            <textarea id="editor-cot" class="think-border" placeholder="Thinking process..."></textarea>
                        </div>
                        <div class="editor-group main-group">
                            <div class="group-toolbar story-bg"><span class="label story-color"><i class="fa-solid fa-comments"></i> Story</span><span class="word-count" id="count-main">0w</span></div>
                            <textarea id="editor-main" class="story-border" placeholder="Story content..."></textarea>
                        </div>
                    </div>
                </div>
                <div class="healer-footer">
                    <button id="btn-save-split" class="save-button"><i class="fa-solid fa-floppy-disk"></i> Merge & Save</button>
                </div>
            </div>
        </div>`;
        $('#html-healer-modal').remove();
        $(document.body).append(modalHtml);
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
            const isStartStory = (index === firstStoryIndex);
            container.append(`<div class="segment-block ${classes}" data-id="${seg.id}"><div class="seg-icon">${icon}</div><div class="seg-text">${seg.text.substring(0, 60) || "(empty line)"}</div>${isStartStory ? '<div class="seg-badge">Start Story</div>' : ''}</div>`);
        });
    }

    renderHighlightModal(originalText, callbacks) {
         const modalHtml = `
        <div id="html-healer-modal" class="html-healer-overlay">
            <div class="html-healer-box highlight-mode">
                ${this._getHeaderHtml("Split (Highlight)", '<i class="fa-solid fa-highlighter"></i>')}
                <div class="healer-body">
                    <div class="view-section active">
                        <div class="editor-group main-group highlight-border">
                            <div class="group-toolbar highlight-bg">
                                <span class="label highlight-text-color"><i class="fa-solid fa-i-cursor"></i> Highlight broken part</span>
                                <div class="toolbar-actions">
                                    <button class="action-btn" id="btn-heal-selection"><i class="fa-solid fa-wand-magic-sparkles"></i> Fix Selection</button>
                                </div>
                            </div>
                            <textarea id="editor-targeted" placeholder="Message content...">${originalText}</textarea>
                        </div>
                    </div>
                </div>
                <div class="healer-footer">
                    <button id="btn-save-targeted" class="save-button highlight-btn-bg"><i class="fa-solid fa-floppy-disk"></i> Save Changes</button>
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

    closeModal() { $('#html-healer-modal').remove(); }
    updateWordCounts(cotCount, mainCount) { $('#count-cot').text(cotCount + "w"); $('#count-main').text(mainCount + "w"); }
    setEditorValues(thinkText, storyText) { $('#editor-cot').val(thinkText); $('#editor-main').val(storyText); if (!thinkText) $('.think-group').hide(); else $('.think-group').show(); }
}
