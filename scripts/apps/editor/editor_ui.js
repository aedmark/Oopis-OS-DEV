/**
 * @file Manages the DOM and user interaction for the OopisOS text editor.
 * This module is the "hands" of the editor; it only renders state and forwards events.
 * @author Andrew Edmark
 * @author Gemini
 */
const EditorUI = (() => {
    "use strict";

    let elements = {};
    let managerCallbacks = {};

    function buildAndShow(initialState, callbacks) {
        managerCallbacks = callbacks;

        elements.container = Utils.createElement('div', { id: 'editor-container', className: 'editor-container' });

        // Header and Toolbar
        elements.fileName = Utils.createElement('div', { className: 'editor-filename' });
        elements.wordWrapButton = Utils.createElement('button', { className: 'btn', textContent: 'Wrap' });
        elements.previewButton = Utils.createElement('button', { className: 'btn', textContent: 'Preview' });
        elements.findButton = Utils.createElement('button', { className: 'btn', textContent: 'Find' });

        // Build the formatting toolbar (initially hidden)
        _buildFormattingToolbar();

        const rightToolbar = Utils.createElement('div', { className: 'editor-toolbar' }, [elements.findButton, elements.wordWrapButton, elements.previewButton]);
        elements.header = Utils.createElement('header', { className: 'editor-header' }, [elements.fileName, elements.formattingToolbar, rightToolbar]);


        // Find/Replace Bar
        _buildFindBar();

        elements.codeArea = Utils.createElement('code', {
            id: 'editor-code-area',
            className: `language-${initialState.fileMode}` // Set initial language for Prism
        });
        elements.textArea = Utils.createElement('pre', {
            id: 'editor-text-area',
            className: 'editor-textarea', // Keep class for styling
            contenteditable: 'true',
            spellcheck: 'false'
        }, [elements.codeArea]);

        // Main content area
        elements.lineNumbers = Utils.createElement('div', { className: 'editor-linenumbers' });
        const editorWrapper = Utils.createElement('div', { className: 'editor-pane-wrapper' }, [elements.lineNumbers, elements.textArea]);
        elements.previewPane = Utils.createElement('div', { className: 'editor-preview' });
        elements.mainArea = Utils.createElement('main', { className: 'editor-main' }, [editorWrapper, elements.previewPane]);

        // Status Bar
        elements.statusBar = Utils.createElement('div', { className: 'editor-statusbar' });
        elements.statusFileName = Utils.createElement('span');
        elements.statusDirty = Utils.createElement('span', { className: 'editor-dirty-indicator' });
        elements.statusInfo = Utils.createElement('span');
        elements.statusBar.append(elements.statusFileName, elements.statusDirty, elements.statusInfo);

        elements.container.append(elements.header, elements.findBar, elements.mainArea, elements.statusBar);

        _addEventListeners();
        _render(initialState);

        AppLayerManager.show(elements.container);
        elements.textArea.focus();
    }

    function _buildFormattingToolbar() {
        const createButton = (text, title, action) => {
            const button = Utils.createElement('button', { className: 'btn', textContent: text, title });
            button.addEventListener('click', action);
            return button;
        };

        elements.formattingToolbar = Utils.createElement('div', { className: 'editor-toolbar editor-format-toolbar hidden' }, [
            createButton('B', 'Bold (Ctrl+B)', () => _wrapSelection('**')),
            createButton('I', 'Italic (Ctrl+I)', () => _wrapSelection('*')),
            createButton('H', 'Heading (Ctrl+H)', () => _prefixLine('# ')),
            createButton('“', 'Blockquote', () => _prefixLine('> ')),
            createButton('🔗', 'Link', () => _insertLink()),
            createButton('img', 'Image', () => _insertImage()),
        ]);
    }


    function _buildFindBar() {
        elements.findInput = Utils.createElement('input', { type: 'text', placeholder: 'Find...', className: 'editor-find-input' });
        elements.findNextButton = Utils.createElement('button', { className: 'btn', textContent: 'Next' });
        elements.findPrevButton = Utils.createElement('button', { className: 'btn', textContent: 'Prev' });
        elements.findCloseButton = Utils.createElement('button', { className: 'btn', textContent: '×' });
        elements.findInfo = Utils.createElement('span', { className: 'editor-find-info' });
        elements.findError = Utils.createElement('span', { className: 'editor-find-error' });
        elements.caseSensitiveToggle = Utils.createElement('button', { className: 'btn', textContent: 'Aa', title: 'Case Sensitive' });
        elements.regexToggle = Utils.createElement('button', { className: 'btn', textContent: '.*', title: 'Use Regular Expression' });

        elements.findBar = Utils.createElement('div', { className: 'editor-findbar hidden' }, [
            elements.findInput, elements.findPrevButton, elements.findNextButton, elements.findInfo,
            elements.caseSensitiveToggle, elements.regexToggle, elements.findError,
            elements.findCloseButton
        ]);
    }

    function hideAndReset() {
        AppLayerManager.hide();
        elements = {};
        managerCallbacks = {};
    }

    function _render(state) {
        elements.fileName.textContent = state.currentFilePath;
        elements.codeArea.textContent = state.currentContent;
        _applySyntaxHighlighting(state.currentContent, state.fileMode); // Apply initial highlighting

        elements.formattingToolbar.classList.toggle('hidden', state.fileMode !== 'markdown');
        elements.previewButton.classList.toggle('hidden', state.fileMode !== 'markdown' && state.fileMode !== 'html');
        updateStatusBar(state);
        updateLineNumbers(state.currentContent);
        renderPreview(state.fileMode, state.currentContent);
        applySettings(state.editorSettings);
        applyViewMode(state.viewMode);
    }

    function updateStatusBar(state) {
        if (!elements.statusFileName || !state) return;

        elements.statusFileName.textContent = state.currentFilePath || '...';
        elements.statusDirty.textContent = state.isDirty ? '*' : '';

        const content = state.currentContent || "";
        const lineCount = content.split('\n').length;
        const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

        // --- Start of Corrected Logic ---
        let cursorPos = '';
        if (elements.textArea) {
            // Use the existing helper to get the character offset
            const charPos = _getCursorPosition();
            // Use the known state content to calculate line and column
            const textToCursor = content.substring(0, charPos);
            const linesToCursor = textToCursor.split('\n');
            const lineNum = linesToCursor.length;
            const colNum = linesToCursor.length > 0 ? linesToCursor[linesToCursor.length - 1].length + 1 : 1;
            cursorPos = `Ln ${lineNum}, Col ${colNum}`;
        }
        // --- End of Corrected Logic ---

        elements.statusInfo.textContent = `Lines: ${lineCount} | Words: ${wordCount} | ${cursorPos}`;

        if (state.statusMessage) {
            elements.statusInfo.textContent += ` | ${state.statusMessage}`;
            setTimeout(() => {
                if (elements.statusInfo && state && !state.statusMessage.startsWith("Error")) {
                    updateStatusBar({ ...state, statusMessage: null });
                }
            }, 3000);
        }
    }


    function updateLineNumbers(content) {
        if (!elements.lineNumbers) return;
        const lineCount = content.split('\n').length || 1;
        elements.lineNumbers.innerHTML = Array.from({ length: lineCount }, (_, i) => `<span>${i + 1}</span>`).join('');
    }

    function renderPreview(fileMode, content) {
        if (!elements.previewPane) return;
        if (fileMode === 'markdown') {
            elements.previewPane.innerHTML = DOMPurify.sanitize(marked.parse(content));
        } else if (fileMode === 'html') {
            elements.previewPane.innerHTML = `<iframe srcdoc="${DOMPurify.sanitize(content)}" class="editor-html-preview" sandbox></iframe>`;
        } else {
            elements.previewPane.innerHTML = '';
        }
    }

    function applySettings(settings) {
        if (!elements.textArea) return;
        elements.textArea.style.whiteSpace = settings.wordWrap ? 'pre-wrap' : 'pre';
        elements.textArea.style.overflowWrap = settings.wordWrap ? 'break-word' : 'normal';
        elements.textArea.style.wordBreak = 'normal';
        elements.wordWrapButton.classList.toggle('active', settings.wordWrap);
    }

    function applyViewMode(viewMode) {
        if (!elements.mainArea) return;
        elements.mainArea.dataset.viewMode = viewMode;
        elements.previewButton.classList.toggle('active', viewMode !== 'editor');
    }

    function setContent(content) {
        if (!elements.codeArea) return;
        const cursorPos = _getCursorPosition();
        elements.codeArea.textContent = content; // Set raw text
        _applySyntaxHighlighting(content, managerCallbacks.getState().fileMode); // Re-highlight
        _setCursorPosition(cursorPos);
        managerCallbacks.onContentUpdate(elements.textArea.textContent);
    }

    function _getCursorPosition() {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return 0;
        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(elements.textArea);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        return preCaretRange.toString().length;
    }

    function _setCursorPosition(pos) {
        const selection = window.getSelection();
        const range = document.createRange();
        let charCount = 0;
        let foundNode = false;

        function findTextNode(node) {
            if (foundNode) return;
            if (node.nodeType === Node.TEXT_NODE) {
                const nextCharCount = charCount + node.length;
                if (pos >= charCount && pos <= nextCharCount) {
                    range.setStart(node, pos - charCount);
                    range.collapse(true);
                    foundNode = true;
                }
                charCount = nextCharCount;
            } else {
                for (const child of node.childNodes) {
                    findTextNode(child);
                }
            }
        }

        findTextNode(elements.textArea);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    function _applySyntaxHighlighting(content, language) {
        if (!Prism.languages[language]) {
            elements.codeArea.innerHTML = Utils.escapeHtml(content); // Fallback for unloaded languages
            return;
        }
        const highlightedHtml = Prism.highlight(content, Prism.languages[language], language);
        const pos = _getCursorPosition();
        elements.codeArea.innerHTML = highlightedHtml;
        _setCursorPosition(pos);
    }

    function _wrapSelection(wrapper, defaultText = 'text') {
        const { textArea } = elements;
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        const selectedText = range.toString();
        const textToInsert = selectedText || defaultText;

        range.deleteContents();
        range.insertNode(document.createTextNode(wrapper + textToInsert + wrapper));

        // Move the cursor to select the inserted text
        if (selectedText) {
            range.setStart(range.endContainer, range.endOffset - wrapper.length - selectedText.length);
            range.setEnd(range.endContainer, range.endOffset - wrapper.length);
        } else {
            range.setStart(range.endContainer, range.endOffset - wrapper.length - defaultText.length);
            range.setEnd(range.endContainer, range.endOffset - wrapper.length);
        }

        selection.removeAllRanges();
        selection.addRange(range);

        managerCallbacks.onContentUpdate(textArea.textContent);
    }

    function _prefixLine(prefix) {
        const { textArea } = elements;
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        const startContainer = range.startContainer;
        let lineStartNode = startContainer;
        let offset = 0;

        while (lineStartNode) {
            if (lineStartNode.nodeType === Node.TEXT_NODE) {
                const index = lineStartNode.textContent.lastIndexOf('\n');
                if (index !== -1) {
                    offset = index + 1;
                    break;
                }
            } else if (lineStartNode === textArea) {
                break;
            }
            if (lineStartNode.previousSibling) {
                lineStartNode = lineStartNode.previousSibling;
            } else {
                lineStartNode = lineStartNode.parentNode;
            }
        }

        const insertRange = document.createRange();
        insertRange.setStart(lineStartNode, offset);
        insertRange.insertNode(document.createTextNode(prefix));

        managerCallbacks.onContentUpdate(textArea.textContent);
    }

    async function _insertLink() {
        const url = await new Promise(r => ModalManager.request({
            context: 'graphical-input',
            messageLines: ["Enter URL:"],
            onConfirm: r,
            onCancel: () => r(null)
        }));
        if (!url) return;
        _wrapSelection(`[`, `link text](${url})`);
    }

    async function _insertImage() {
        const url = await new Promise(r => ModalManager.request({
            context: 'graphical-input',
            messageLines: ["Enter Image URL:"],
            onConfirm: r,
            onCancel: () => r(null)
        }));
        if (!url) return;
        _wrapSelection(`![`, `alt text](${url})`);
    }


    function highlightMatch(match) {
        if (!elements.textArea || !match) return;
        _setCursorPosition(match.start);
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        range.setEnd(range.startContainer, range.startOffset + (match.end - match.start));
        selection.removeAllRanges();
        selection.addRange(range);
    }

    function updateFindUI(findState) {
        const { matches, currentIndex, error } = findState;
        if (matches.length > 0) {
            elements.findInfo.textContent = `${currentIndex + 1} / ${matches.length}`;
            elements.findInfo.classList.remove('no-match');
        } else {
            elements.findInfo.textContent = 'No results';
            elements.findInfo.classList.add('no-match');
        }
        if (error) {
            elements.findError.textContent = error;
            elements.findError.classList.add('visible');
        } else {
            elements.findError.classList.remove('visible');
        }
    }

    function _addEventListeners() {
        elements.textArea.addEventListener('input', () => {
            managerCallbacks.onContentUpdate(elements.textArea.textContent);
        });
        elements.textArea.addEventListener('scroll', () => { elements.lineNumbers.scrollTop = elements.textArea.scrollTop; });
        elements.textArea.addEventListener('keyup', () => updateStatusBar(managerCallbacks.getState ? managerCallbacks.getState() : {}));
        elements.textArea.addEventListener('click', () => updateStatusBar(managerCallbacks.getState ? managerCallbacks.getState() : {}));

        // Toolbar
        elements.findButton.addEventListener('click', () => {
            elements.findBar.classList.toggle('hidden');
            if (!elements.findBar.classList.contains('hidden')) {
                elements.findInput.focus();
                elements.findInput.select();
            }
        });
        elements.wordWrapButton.addEventListener('click', () => managerCallbacks.onToggleWordWrap());
        elements.previewButton.addEventListener('click', () => managerCallbacks.onToggleViewMode());

        // Find Bar
        const triggerFind = () => {
            managerCallbacks.onFind(elements.findInput.value, {
                isCaseSensitive: elements.caseSensitiveToggle.classList.contains('active'),
                isRegex: elements.regexToggle.classList.contains('active')
            });
        };

        elements.findInput.addEventListener('input', triggerFind);

        elements.findInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (managerCallbacks.getState && managerCallbacks.getState().findState.matches.length > 0) {
                    managerCallbacks.onFindNext();
                } else {
                    triggerFind();
                }
            }
        });

        elements.findNextButton.addEventListener('click', () => managerCallbacks.onFindNext());
        elements.findPrevButton.addEventListener('click', () => managerCallbacks.onFindPrev());

        elements.caseSensitiveToggle.addEventListener('click', (e) => {
            e.currentTarget.classList.toggle('active');
            triggerFind();
        });
        elements.regexToggle.addEventListener('click', (e) => {
            e.currentTarget.classList.toggle('active');
            triggerFind();
        });

        elements.findCloseButton.addEventListener('click', () => elements.findBar.classList.add('hidden'));

        // Keyboard shortcuts
        elements.container.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key.toLowerCase()) {
                    case 's': e.preventDefault(); managerCallbacks.onSaveRequest(); break;
                    case 'o': e.preventDefault(); managerCallbacks.onExitRequest(); break;
                    case 'z': e.preventDefault(); e.shiftKey ? managerCallbacks.onRedoRequest() : managerCallbacks.onUndoRequest(); break;
                    case 'y': e.preventDefault(); managerCallbacks.onRedoRequest(); break;
                    case 'p': e.preventDefault(); managerCallbacks.onToggleViewMode(); break;
                    case 'f':
                        e.preventDefault();
                        elements.findBar.classList.toggle('hidden');
                        if (!elements.findBar.classList.contains('hidden')) {
                            elements.findInput.focus();
                            elements.findInput.select();
                        }
                        break;
                    case 'b': e.preventDefault(); _wrapSelection('**'); break;
                    case 'i': e.preventDefault(); _wrapSelection('*'); break;
                    case 'h': e.preventDefault(); _prefixLine('# '); break;
                }
            } else if (e.key === 'Escape') {
                if (!elements.findBar.classList.contains('hidden')) {
                    e.preventDefault();
                    elements.findBar.classList.add('hidden');
                } else {
                    managerCallbacks.onExitRequest();
                }
            }
        });
    }

    return {
        buildAndShow,
        hideAndReset,
        updateStatusBar,
        setContent,
        applySettings,
        applyViewMode,
        renderPreview,
        updateLineNumbers,
        highlightMatch,
        updateFindUI,
        applySyntaxHighlighting: _applySyntaxHighlighting
    };
})();