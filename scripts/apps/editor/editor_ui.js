const EditorUI = (() => {
    "use strict";

    let elements = {};
    let managerCallbacks = {};

    function buildAndShow(initialState, callbacks) {
        managerCallbacks = callbacks;

        const template = document.getElementById('editor-template');
        const clone = template.content.cloneNode(true);
        elements.container = clone.querySelector('#editor-container');

        // Cache elements from the cloned template
        elements.titleInput = elements.container.querySelector('#editor-title');
        elements.saveBtn = elements.container.querySelector('#editor-save-btn');
        elements.exitBtn = elements.container.querySelector('#editor-exit-btn');
        elements.previewBtn = elements.container.querySelector('#editor-preview-btn');
        elements.wordWrapBtn = elements.container.querySelector('#editor-word-wrap-btn');
        elements.undoBtn = elements.container.querySelector('#editor-undo-btn');
        elements.redoBtn = elements.container.querySelector('#editor-redo-btn');
        elements.textarea = elements.container.querySelector('#editor-textarea');
        elements.preview = elements.container.querySelector('#editor-preview');
        elements.main = elements.container.querySelector('.editor-main');
        elements.dirtyStatus = elements.container.querySelector('#editor-dirty-status');
        elements.statusMessage = elements.container.querySelector('#editor-status-message');

        // Set initial values
        elements.titleInput.value = initialState.currentFilePath || 'Untitled';
        elements.textarea.value = initialState.currentContent;

        _addEventListeners();
        updateDirtyStatus(initialState.isDirty);
        updateWindowTitle(initialState.currentFilePath);
        setWordWrap(initialState.wordWrap);
        setViewMode(initialState.viewMode, initialState.fileMode, initialState.currentContent);

        elements.textarea.focus();

        return elements.container;
    }

    function renderPreview(content, mode) {
        if (!elements.preview) return;

        elements.preview.innerHTML = '';

        if (mode === 'markdown') {
            elements.preview.innerHTML = DOMPurify.sanitize(marked.parse(content));
        } else if (mode === 'html') {
            const iframe = Utils.createElement('iframe', {style: 'width: 100%; height: 100%; border: none;'});
            elements.preview.appendChild(iframe);

            const iframeDoc = iframe.contentWindow.document;
            iframeDoc.open();
            iframeDoc.write(DOMPurify.sanitize(content));
            iframeDoc.close();
        }
    }

    function setViewMode(viewMode, fileMode, content) {
        if (!elements.preview || !elements.textarea || !elements.main) return;

        elements.previewBtn.disabled = fileMode === 'text';

        if (fileMode === 'text') {
            viewMode = 'edit';
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