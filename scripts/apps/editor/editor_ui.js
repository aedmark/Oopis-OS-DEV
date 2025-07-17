const EditorUI = (() => {
    "use strict";

    let elements = {};
    let managerCallbacks = {};

    function buildAndShow(initialState, callbacks) {
        managerCallbacks = callbacks;

        elements.container = Utils.createElement('div', {id: 'editor-container', className: 'editor-container'});
        elements.titleInput = Utils.createElement('input', { id: 'editor-title', className: 'editor-title-input', type: 'text', value: initialState.currentFilePath || 'Untitled' });
        const header = Utils.createElement('header', {className: 'editor-header'}, [elements.titleInput]);

        elements.saveBtn = Utils.createElement('button', {className: 'btn', textContent: '💾 Save'});
        elements.exitBtn = Utils.createElement('button', {className: 'btn', textContent: 'Exit'});
        elements.previewBtn = Utils.createElement('button', {className: 'btn', textContent: '👁️ View'});
        elements.undoBtn = Utils.createElement('button', {className: 'btn', textContent: '↩ Undo'});
        elements.redoBtn = Utils.createElement('button', {className: 'btn', textContent: '↪ Redo'});
        elements.wordWrapBtn = Utils.createElement('button', {className: 'btn', textContent: 'Wrap'});
        const toolbarGroup = Utils.createElement('div', {className: 'editor-toolbar-group'}, [elements.previewBtn, elements.wordWrapBtn, elements.undoBtn, elements.redoBtn, elements.saveBtn, elements.exitBtn]);
        const toolbar = Utils.createElement('div', {className: 'editor-toolbar'}, [toolbarGroup]);

        elements.textarea = Utils.createElement('textarea', { id: 'editor-textarea', className: 'editor-textarea', value: initialState.currentContent });
        elements.preview = Utils.createElement('div', {id: 'editor-preview', className: 'editor-preview'});
        elements.main = Utils.createElement('main', {className: 'editor-main'}, [elements.textarea, elements.preview]);

        elements.dirtyStatus = Utils.createElement('span', {id: 'editor-dirty-status'});
        elements.statusMessage = Utils.createElement('span', {id: 'editor-status-message'});
        const footer = Utils.createElement('footer', {className: 'editor-footer'}, [elements.dirtyStatus, elements.statusMessage]);

        elements.container.append(header, toolbar, elements.main, footer);

        _addEventListeners();
        updateDirtyStatus(initialState.isDirty);
        updateWindowTitle(initialState.currentFilePath);
        setWordWrap(initialState.wordWrap);
        setViewMode(initialState.viewMode, initialState.fileMode, initialState.currentContent);

        elements.textarea.focus();

        return elements.container; // Return the created container
    }

    function renderPreview(content, mode) {
        if (!elements.preview) return;

        // Ensure a predictable, clean slate for rendering.
        elements.preview.innerHTML = '';

        if (mode === 'markdown') {
            elements.preview.innerHTML = DOMPurify.sanitize(marked.parse(content));
        } else if (mode === 'html') {
            // Create and append a new iframe for each render to ensure a clean context
            const iframe = Utils.createElement('iframe', {style: 'width: 100%; height: 100%; border: none;'});
            elements.preview.appendChild(iframe);

            // Access contentWindow *after* appending to the DOM
            const iframeDoc = iframe.contentWindow.document;
            iframeDoc.open();
            iframeDoc.write(DOMPurify.sanitize(content)); // Sanitize before writing
            iframeDoc.close();
        }
    }


    function setViewMode(viewMode, fileMode, content) {
        if (!elements.preview || !elements.textarea || !elements.main) return;

        elements.previewBtn.disabled = fileMode === 'text';

        if (fileMode === 'text') {
            viewMode = 'edit'; // Force editor-only mode for plain text
        }

        elements.textarea.style.display = 'none';
        elements.preview.style.display = 'none';
        elements.main.classList.remove('editor-main--split', 'editor-main--full');

        switch (viewMode) {
            case 'edit':
                elements.textarea.style.display = 'block';
                elements.main.classList.add('editor-main--full');
                break;
            case 'preview':
                elements.preview.style.display = 'block';
                elements.main.classList.add('editor-main--full');
                renderPreview(content, fileMode);
                break;
            case 'split':
            default:
                elements.textarea.style.display = 'block';
                elements.preview.style.display = 'block';
                elements.main.classList.add('editor-main--split');
                renderPreview(content, fileMode);
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
            elements.textarea.style.wordBreak = enabled ? 'break-all' : 'normal';
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