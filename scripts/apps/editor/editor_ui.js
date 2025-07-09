const EditorUI = (() => {
    "use strict";

    let elements = {};
    let managerCallbacks = {};

    function buildAndShow(initialState, callbacks) {
        managerCallbacks = callbacks;

        // --- Create Main Structure ---
        elements.container = Utils.createElement('div', {id: 'editor-container', className: 'editor-container'});

        // --- Header ---
        elements.titleInput = Utils.createElement('input', {
            id: 'editor-title',
            className: 'editor-title-input',
            type: 'text',
            value: initialState.currentFilePath || 'Untitled'
        });
        const header = Utils.createElement('header', {className: 'editor-header'}, [elements.titleInput]);

        // --- Toolbar ---
        elements.saveBtn = Utils.createElement('button', {className: 'btn', textContent: 'Save (Ctrl+S)'});
        elements.exitBtn = Utils.createElement('button', {className: 'btn', textContent: 'Exit (Ctrl+O)'});
        elements.previewBtn = Utils.createElement('button', {className: 'btn', textContent: 'Toggle Preview (Ctrl+P)'});
        elements.undoBtn = Utils.createElement('button', {className: 'btn', textContent: 'Undo'});
        elements.redoBtn = Utils.createElement('button', {className: 'btn', textContent: 'Redo'});
        elements.wordWrapBtn = Utils.createElement('button', {className: 'btn', textContent: 'Word Wrap'});

        const toolbarGroup = Utils.createElement('div', {className: 'editor-toolbar-group'}, [elements.saveBtn, elements.previewBtn, elements.undoBtn, elements.redoBtn, elements.wordWrapBtn, elements.exitBtn]);
        const toolbar = Utils.createElement('div', {className: 'editor-toolbar'}, [toolbarGroup]);


        // --- Main Area ---
        elements.textarea = Utils.createElement('textarea', {
            id: 'editor-textarea',
            className: 'editor-textarea',
            value: initialState.currentContent
        });
        elements.preview = Utils.createElement('div', {id: 'editor-preview', className: 'editor-preview hidden'});
        const mainArea = Utils.createElement('main', {className: 'editor-main'}, [elements.textarea, elements.preview]);

        // --- Footer ---
        elements.dirtyStatus = Utils.createElement('span', {id: 'editor-dirty-status'});
        elements.statusMessage = Utils.createElement('span', {id: 'editor-status-message'});
        const footer = Utils.createElement('footer', {className: 'editor-footer'}, [elements.dirtyStatus, elements.statusMessage]);

        // --- Assemble ---
        elements.container.append(header, toolbar, mainArea, footer);

        _addEventListeners();
        updateDirtyStatus(initialState.isDirty);
        updateWindowTitle(initialState.currentFilePath);
        setWordWrap(initialState.wordWrap);
        togglePreview(initialState.isPreviewMode, initialState.fileMode);

        AppLayerManager.show(elements.container); // Use AppLayerManager to display
        elements.textarea.focus();
    }

    function hideAndReset() {
        AppLayerManager.hide();
        elements = {};
        managerCallbacks = {};
    }

    function updateDirtyStatus(isDirty) {
        if (elements.dirtyStatus) {
            elements.dirtyStatus.textContent = isDirty ? 'UNSAVED' : 'SAVED';
            elements.dirtyStatus.style.color = isDirty ? 'var(--color-warning)' : 'var(--color-success)';
        }
    }

    function updateWindowTitle(filePath) {
        if (elements.titleInput) {
            elements.titleInput.value = filePath || 'Untitled';
        }
    }

    function updateStatusMessage(message) {
        if (elements.statusMessage) {
            elements.statusMessage.textContent = message;
            setTimeout(() => {
                if (elements.statusMessage) elements.statusMessage.textContent = '';
            }, 3000);
        }
    }

    function togglePreview(isPreview, mode) {
        if (!elements.preview || !elements.textarea) return;
        if (mode === 'text') {
            elements.preview.classList.add('hidden');
            elements.textarea.classList.remove('hidden');
            elements.textarea.style.width = '100%';
            elements.previewBtn.disabled = true;
            return;
        }

        elements.previewBtn.disabled = false;
        if (isPreview) {
            elements.textarea.classList.add('hidden');
            elements.preview.classList.remove('hidden');
            _renderPreviewContent(mode);
        } else {
            elements.textarea.classList.remove('hidden');
            elements.preview.classList.add('hidden');
        }
    }

    function setContent(content) {
        if (elements.textarea) {
            elements.textarea.value = content;
            _renderPreviewContent(state.fileMode);
        }
    }

    function setWordWrap(enabled) {
        if (elements.textarea) {
            elements.textarea.style.whiteSpace = enabled ? 'pre-wrap' : 'pre';
            elements.textarea.style.wordBreak = enabled ? 'break-all' : 'normal';
            elements.wordWrapBtn.classList.toggle('active', enabled);
        }
    }


    function _renderPreviewContent(mode) {
        if (!elements.preview) return;
        const content = elements.textarea.value;
        if (mode === 'markdown') {
            elements.preview.innerHTML = DOMPurify.sanitize(marked.parse(content));
        } else if (mode === 'html') {
            const iframe = Utils.createElement('iframe', {style: {width: '100%', height: '100%', border: 'none'}});
            elements.preview.innerHTML = '';
            elements.preview.appendChild(iframe);
            iframe.contentWindow.document.open();
            iframe.contentWindow.document.write(content);
            iframe.contentWindow.document.close();
        }
    }

    function _addEventListeners() {
        elements.textarea.addEventListener('input', () => {
            managerCallbacks.onContentChange(elements.textarea.value);
            if (state.isPreviewMode) {
                _renderPreviewContent(state.fileMode);
            }
        });

        elements.saveBtn.addEventListener('click', () => managerCallbacks.onSaveRequest());
        elements.exitBtn.addEventListener('click', () => managerCallbacks.onExitRequest());
        elements.previewBtn.addEventListener('click', () => managerCallbacks.onTogglePreview());
        elements.undoBtn.addEventListener('click', () => managerCallbacks.onUndo());
        elements.redoBtn.addEventListener('click', () => managerCallbacks.onRedo());
        elements.wordWrapBtn.addEventListener('click', () => managerCallbacks.onWordWrapToggle());

        document.addEventListener('keydown', (e) => {
            if (!EditorManager.isActive()) return;
            if (e.ctrlKey || e.metaKey) {
                switch (e.key.toLowerCase()) {
                    case 's':
                        e.preventDefault();
                        managerCallbacks.onSaveRequest();
                        break;
                    case 'o':
                        e.preventDefault();
                        managerCallbacks.onExitRequest();
                        break;
                    case 'p':
                        e.preventDefault();
                        managerCallbacks.onTogglePreview();
                        break;
                    case 'z':
                        e.preventDefault();
                        e.shiftKey ? managerCallbacks.onRedo() : managerCallbacks.onUndo();
                        break;
                    case 'y':
                        e.preventDefault();
                        managerCallbacks.onRedo();
                        break;
                }
            }
        });
    }

    return {
        buildAndShow,
        hideAndReset,
        updateDirtyStatus,
        updateStatusMessage,
        updateWindowTitle,
        togglePreview,
        setContent,
        setWordWrap
    };
})();