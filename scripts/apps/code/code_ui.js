const CodeUI = (() => {
    "use strict";

    let elements = {};
    let managerCallbacks = {};

    function buildAndShow(initialState, callbacks) {
        managerCallbacks = callbacks;

        // --- Create Main Structure ---
        elements.container = Utils.createElement('div', {id: 'code-container', className: 'code-container'});

        // --- Header ---
        elements.titleInput = Utils.createElement('input', {
            id: 'code-title',
            className: 'code-title-input',
            type: 'text',
            value: initialState.currentFilePath || 'Untitled'
        });
        const header = Utils.createElement('header', {className: 'code-header'}, [elements.titleInput]);

        // --- Toolbar ---
        elements.saveBtn = Utils.createElement('button', {className: 'btn', textContent: 'Save'});
        elements.exitBtn = Utils.createElement('button', {className: 'btn', textContent: 'Exit'});

        const toolbarGroup = Utils.createElement('div', {className: 'code-toolbar-group'}, [elements.saveBtn, elements.exitBtn]);
        const toolbar = Utils.createElement('div', {className: 'code-toolbar'}, [toolbarGroup]);


        // --- Main Area ---
        elements.textarea = Utils.createElement('textarea', {
            id: 'code-textarea',
            className: 'code-textarea',
            value: initialState.currentContent,
            spellcheck: "false"
        });
        elements.pre = Utils.createElement('pre', {id: 'code-pre', className: 'code-pre', 'aria-hidden': 'true'});
        elements.code = Utils.createElement('code', {id: 'code-code', className: `language-${initialState.language}`});

        elements.pre.appendChild(elements.code);
        elements.main = Utils.createElement('main', {className: 'code-main'}, [elements.textarea, elements.pre]);

        // --- Footer ---
        elements.dirtyStatus = Utils.createElement('span', {id: 'code-dirty-status'});
        elements.statusMessage = Utils.createElement('span', {id: 'code-status-message'});
        const footer = Utils.createElement('footer', {className: 'code-footer'}, [elements.dirtyStatus, elements.statusMessage]);

        // --- Assemble ---
        elements.container.append(header, toolbar, elements.main, footer);

        _addEventListeners();
        updateDirtyStatus(initialState.isDirty);
        updateWindowTitle(initialState.currentFilePath);
        setContent(initialState.currentContent, initialState.language);

        AppLayerManager.show(elements.container);
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

    function setContent(content, language) {
        if (elements.textarea) {
            elements.textarea.value = content;
        }
        if (elements.code) {
            elements.code.textContent = content;
            elements.code.className = `language-${language}`;
            Prism.highlightElement(elements.code);
        }
    }

    function _addEventListeners() {
        elements.textarea.addEventListener('input', () => {
            managerCallbacks.onContentChange(elements.textarea.value);
        });

        elements.textarea.addEventListener('scroll', () => {
            elements.pre.scrollTop = elements.textarea.scrollTop;
            elements.pre.scrollLeft = elements.textarea.scrollLeft;
        });

        elements.saveBtn.addEventListener('click', () => managerCallbacks.onSaveRequest());
        elements.exitBtn.addEventListener('click', () => managerCallbacks.onExitRequest());

        document.addEventListener('keydown', (e) => {
            if (!CodeManager.isActive()) return;
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
        setContent,
    };
})();