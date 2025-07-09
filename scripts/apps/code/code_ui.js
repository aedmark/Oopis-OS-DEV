const CodeUI = (() => {
    "use strict";

    let elements = {};
    let managerCallbacks = {};
    let currentLanguage = 'js';

    function buildAndShow(initialState, callbacks) {
        managerCallbacks = callbacks;

        // --- Create Main Structure ---
        elements.container = Utils.createElement('div', {
            id: 'code-editor-container',
            className: 'code-editor-container'
        });

        // --- Header ---
        elements.titleInput = Utils.createElement('input', {
            id: 'code-editor-title',
            className: 'code-editor-title-input',
            type: 'text',
            value: initialState.currentFilePath || 'untitled.js'
        });

        const header = Utils.createElement('header', {className: 'code-editor-header'}, [elements.titleInput]);

        // --- Main Editor Area ---
        elements.textarea = Utils.createElement('textarea', {
            id: 'code-editor-textarea',
            className: 'code-editor-textarea',
            value: initialState.currentContent,
            spellcheck: 'false',
            autocapitalize: 'none'
        });

        elements.codeBlock = Utils.createElement('code');
        elements.preBlock = Utils.createElement('pre', {
            id: 'code-editor-pre',
            className: 'line-numbers'
        }, [elements.codeBlock]);

        const editorArea = Utils.createElement('div', {className: 'code-editor-main-area'}, [elements.textarea, elements.preBlock]);

        // --- Footer ---
        elements.dirtyStatus = Utils.createElement('span', {id: 'code-editor-dirty-status'});
        elements.languageDisplay = Utils.createElement('span', {id: 'code-editor-language'});
        elements.statusMessage = Utils.createElement('span', {id: 'code-editor-status-message'});
        elements.wordWrapBtn = Utils.createElement('button', {
            id: 'code-editor-word-wrap',
            className: 'code-editor-btn'
        }, ['Word Wrap']);
        const footer = Utils.createElement('footer', {className: 'code-editor-footer'}, [elements.dirtyStatus, elements.languageDisplay, elements.wordWrapBtn, elements.statusMessage]);

        // --- Assemble ---
        elements.container.append(header, editorArea, footer);

        _addEventListeners(initialState);
        updateDirtyStatus(initialState.isDirty);
        updateLanguage(Utils.getFileExtension(initialState.currentFilePath || 'js'));
        setWordWrap(initialState.wordWrap);


        AppLayerManager.show(elements.container);
        elements.textarea.focus();

        // Initial highlight
        updateSyntaxHighlighting(initialState.currentContent);
    }

    function hideAndReset() {
        document.removeEventListener('keydown', _handleGlobalKeyDown, true);
        AppLayerManager.hide();
        elements = {};
        managerCallbacks = {};
    }

    function updateSyntaxHighlighting(content) {
        if (!elements.codeBlock || typeof Prism === 'undefined') return;

        elements.codeBlock.textContent = content + '\n'; // Add newline to ensure last line is highlighted
        Prism.highlightElement(elements.codeBlock);
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

    function updateLanguage(extension) {
        const langMap = {
            'js': 'javascript', 'py': 'python', 'sh': 'bash', 'css': 'css',
            'html': 'markup', 'md': 'markdown', 'json': 'json', 'c': 'c',
            'cpp': 'cpp', 'cs': 'csharp', 'java': 'java', 'rb': 'ruby',
            'go': 'go', 'php': 'php', 'rs': 'rust', 'ts': 'typescript',
            'xml': 'xml', 'yml': 'yaml', 'yaml': 'yaml'
        };
        currentLanguage = langMap[extension] || 'plaintext';
        if (elements.codeBlock) {
            elements.codeBlock.className = `language-${currentLanguage}`;
        }
        if (elements.languageDisplay) {
            elements.languageDisplay.textContent = `Lang: ${currentLanguage}`;
        }
    }

    function setContent(content) {
        if (elements.textarea) {
            elements.textarea.value = content;
        }
    }

    function setWordWrap(enabled) {
        if (elements.textarea && elements.preBlock) {
            const whiteSpaceStyle = enabled ? 'pre-wrap' : 'pre';
            const wordBreakStyle = enabled ? 'break-word' : 'normal';
            elements.textarea.style.whiteSpace = whiteSpaceStyle;
            elements.preBlock.style.whiteSpace = whiteSpaceStyle;
            elements.textarea.style.wordBreak = wordBreakStyle;
            elements.preBlock.style.wordBreak = wordBreakStyle;
            elements.wordWrapBtn.classList.toggle('active', enabled);
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

    const _syncScroll = () => {
        if (elements.preBlock && elements.textarea) {
            elements.preBlock.scrollTop = elements.textarea.scrollTop;
            elements.preBlock.scrollLeft = elements.textarea.scrollLeft;
        }
    };

    const _handleGlobalKeyDown = (e) => {
        if (!CodeManager.isActive()) {
            document.removeEventListener('keydown', _handleGlobalKeyDown, true);
            return;
        }
        ;

        if ((e.ctrlKey || e.metaKey)) {
            switch (e.key.toLowerCase()) {
                case 's':
                    e.preventDefault();
                    managerCallbacks.onSaveRequest();
                    break;
                case 'o':
                    e.preventDefault();
                    managerCallbacks.onExitRequest();
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
        } else if (e.key === 'Escape') {
            e.preventDefault();
            managerCallbacks.onExitRequest();
        } else if (e.key === 'Tab' && e.target === elements.textarea) {
            e.preventDefault();
            const start = elements.textarea.selectionStart;
            const end = elements.textarea.selectionEnd;
            const value = elements.textarea.value;

            elements.textarea.value = value.substring(0, start) + '  ' + value.substring(end);
            elements.textarea.selectionStart = elements.textarea.selectionEnd = start + 2;
            managerCallbacks.onContentChange(elements.textarea.value);
        }
    };

    function _addEventListeners(initialState) {
        elements.textarea.addEventListener('input', () => {
            managerCallbacks.onContentChange(elements.textarea.value);
        });

        elements.titleInput.addEventListener('change', (e) => {
            const newPath = e.target.value;
            if (initialState.currentFilePath !== newPath) {
                initialState.currentFilePath = newPath; // This feels wrong, manager should do this.
                updateLanguage(Utils.getFileExtension(newPath));
                managerCallbacks.onContentChange(elements.textarea.value); // Mark as dirty
            }
        });

        elements.wordWrapBtn.addEventListener('click', managerCallbacks.onWordWrapToggle);
        elements.textarea.addEventListener('scroll', _syncScroll);
        document.addEventListener('keydown', _handleGlobalKeyDown, true);
    }

    return {
        buildAndShow,
        hideAndReset,
        updateSyntaxHighlighting,
        updateDirtyStatus,
        updateWindowTitle,
        updateLanguage,
        setContent,
        setWordWrap,
        updateStatusMessage
    };
})();