// scripts/apps/code/code_ui.js
const CodeUI = (() => {
    "use strict";

    let elements = {};
    let callbacks = {};
    let onReadyCallback = null;

    function buildAndShow(initialState, onReady, cb) {
        callbacks = cb;
        onReadyCallback = onReady;

        elements.titleInput = Utils.createElement('input', {
            id: 'code-editor-title',
            className: 'code-editor-title-input',
            type: 'text',
            value: initialState.filePath || 'Untitled'
        });

        const saveBtn = Utils.createElement('button', {className: 'btn btn--confirm', textContent: 'Save & Exit'});
        const exitBtn = Utils.createElement('button', {className: 'btn btn--cancel', textContent: 'Exit'});
        saveBtn.addEventListener('click', () => callbacks.onSave(elements.titleInput.value, elements.textarea.value));
        exitBtn.addEventListener('click', () => callbacks.onExit());

        const header = Utils.createElement('header', {className: 'code-editor-header'}, [
            elements.titleInput,
            Utils.createElement('div', {className: 'editor-toolbar-group'}, [saveBtn, exitBtn])
        ]);

        // --- PHASE 1: Structural Realignment ---
        elements.textarea = Utils.createElement('textarea', {
            id: 'code-editor-textarea',
            className: 'code-editor-textarea', // New class for styling
            spellcheck: 'false',
            autocapitalize: 'none',
            textContent: initialState.fileContent || ""
        });

        elements.highlighter = Utils.createElement('pre', { // Using <pre> for better code formatting
            id: 'code-editor-highlighter',
            className: 'code-editor-highlighter', // New class for styling
            'aria-hidden': 'true' // Hide from screen readers
        });

        const editorWrapper = Utils.createElement('div', {
            className: 'code-editor-wrapper' // New wrapper for positioning
        }, [elements.highlighter, elements.textarea]);
        // --- END PHASE 1 ---

        const main = Utils.createElement('main', {className: 'code-editor-main'}, editorWrapper);
        elements.container = Utils.createElement('div', {
            id: 'code-editor-container',
            className: 'code-editor-container'
        }, [header, main]);

        // Defer setup that depends on the editor element
        _addEventListeners();
        AppLayerManager.show(elements.container);

        // Notify the manager that the editor element is ready and do initial highlight
        if (typeof onReadyCallback === 'function') {
            onReadyCallback(elements.textarea, elements.highlighter);
        }

        elements.textarea.focus();
    }

    function hideAndReset() {
        AppLayerManager.hide();
        elements = {};
        callbacks = {};
        onReadyCallback = null;
    }

    function _addEventListeners() {
        // --- PHASE 4: Restoring Functionality (Tab Key) ---
        elements.textarea.addEventListener('keydown', e => {
            if (e.key === 'Tab') {
                e.preventDefault();
                callbacks.onTab(e.target);
            }
        });
        // --- END PHASE 4 ---

        // Centralized content handling
        elements.textarea.addEventListener('input', (e) => {
            callbacks.onInput(e.target.value);
        });

        // --- PHASE 2: The Dance of Synchronization ---
        elements.textarea.addEventListener('scroll', () => {
            elements.highlighter.scrollTop = elements.textarea.scrollTop;
            elements.highlighter.scrollLeft = elements.textarea.scrollLeft;
        });
        // --- END PHASE 2 ---

        elements.textarea.addEventListener('paste', e => {
            e.preventDefault();
            const pastedText = (e.clipboardData || window.clipboardData).getData('text/plain');
            callbacks.onPaste(e.target, pastedText);
        });
    }

    return {buildAndShow, hideAndReset};
})();