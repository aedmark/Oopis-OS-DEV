// scripts/apps/editor/editor_ui.js
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
        elements.saveBtn = Utils.createElement('button', {className: 'btn', textContent: '💾'});
        elements.exitBtn = Utils.createElement('button', {className: 'btn', textContent: 'Exit'});
        elements.previewBtn = Utils.createElement('button', {className: 'btn', textContent: 'View️'});
        elements.undoBtn = Utils.createElement('button', {className: 'btn', textContent: '↩'});
        elements.redoBtn = Utils.createElement('button', {className: 'btn', textContent: '↪'});
        elements.wordWrapBtn = Utils.createElement('button', {className: 'btn', textContent: 'Wrap'});

        const toolbarGroup = Utils.createElement('div', {className: 'editor-toolbar-group'}, [elements.previewBtn, elements.wordWrapBtn, elements.undoBtn, elements.redoBtn, elements.saveBtn, elements.exitBtn]);
        const toolbar = Utils.createElement('div', {className: 'editor-toolbar'}, [toolbarGroup]);


        // --- Main Area ---
        elements.textarea = Utils.createElement('textarea', {
            id: 'editor-textarea',
            className: 'editor-textarea',
        });
        elements.textarea.value = initialState.currentContent;
        elements.preview = Utils.createElement('div', {id: 'editor-preview', className: 'editor-preview'});
        elements.main = Utils.createElement('main', {className: 'editor-main'}, [elements.textarea, elements.preview]);

        // --- Footer ---
        elements.dirtyStatus = Utils.createElement('span', {id: 'editor-dirty-status'});
        elements.statusMessage = Utils.createElement('span', {id: 'editor-status-message'});
        const footer = Utils.createElement('footer', {className: 'editor-footer'}, [elements.dirtyStatus, elements.statusMessage]);

        // --- Assemble ---
        elements.container.append(header, toolbar, elements.main, footer);

        _addEventListeners();
        updateDirtyStatus(initialState.isDirty);
        updateWindowTitle(initialState.currentFilePath);
        setWordWrap(initialState.wordWrap);
        setViewMode(initialState.viewMode, initialState.fileType, initialState.currentContent, managerCallbacks.onContentChange);


        AppLayerManager.show(elements.container);
        elements.textarea.focus();
    }

    function renderPreview(content, fileType, highlighterFn) {
        if (!elements.preview) return;
        elements.preview.innerHTML = '';

        switch (fileType) {
            case 'markdown':
                elements.preview.innerHTML = DOMPurify.sanitize(marked.parse(content));
                break;
            case 'html':
                const iframe = Utils.createElement('iframe', {style: 'width: 100%; height: 100%; border: none;'});
                elements.preview.appendChild(iframe);
                const iframeDoc = iframe.contentWindow.document;
                iframeDoc.open();
                iframeDoc.write(DOMPurify.sanitize(content));
                iframeDoc.close();
                break;
            case 'code':
                elements.preview.innerHTML = highlighterFn(content);
                break;
            default:
                elements.preview.textContent = content;
                break;
        }
    }


    function setViewMode(viewMode, fileType, content, highlighterFn) {
        if (!elements.preview || !elements.textarea || !elements.main) return;

        elements.previewBtn.disabled = (fileType === 'text' || fileType === 'code');
        if (fileType === 'text' || fileType === 'code') {
            viewMode = 'edit';
        }

        elements.textarea.style.display = 'none';
        elements.preview.style.display = 'none';
        elements.main.classList.remove('editor-main--split', 'editor-main--full');
        elements.preview.classList.remove('code-highlighter');

        switch (viewMode) {
            case 'edit':
                elements.textarea.style.display = 'block';
                elements.main.classList.add('editor-main--full');
                break;
            case 'preview':
                elements.preview.style.display = 'block';
                elements.main.classList.add('editor-main--full');
                if (fileType === 'code') elements.preview.classList.add('code-highlighter');
                renderPreview(content, fileType, highlighterFn);
                break;
            case 'split':
            default:
                elements.textarea.style.display = 'block';
                elements.preview.style.display = 'block';
                elements.main.classList.add('editor-main--split');
                if (fileType === 'code') elements.preview.classList.add('code-highlighter');
                renderPreview(content, fileType, highlighterFn);
                break;
        }
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

    function setContent(content) {
        if (elements.textarea) {
            elements.textarea.value = content;
        }
    }

    function setWordWrap(enabled) {
        if (elements.textarea) {
            elements.textarea.style.whiteSpace = enabled ? 'pre-wrap' : 'pre';
            elements.textarea.style.wordBreak = enabled ? 'break-word' : 'normal';
            elements.wordWrapBtn.classList.toggle('active', enabled);
        }
    }

    function _addEventListeners() {
        elements.textarea.addEventListener('input', () => {
            managerCallbacks.onContentChange(elements.textarea.value);
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
        setViewMode,
        renderPreview,
        setContent,
        setWordWrap
    };
})();