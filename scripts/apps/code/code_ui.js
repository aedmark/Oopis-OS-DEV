/**
 * code_ui.js
 *
 * The presentation layer for the Code editor.
 * It is responsible for building all DOM elements, rendering the editor,
 * and forwarding all user events to the CodeManager.
 */
'use strict';

const CodeUI = (function () {

    // A null void. We will populate this with the elements of our world.
    let elements = {
        container: null,
        header: null,
        filePathDisplay: null,
        saveButton: null,
        exitButton: null,
        main: null,
        contentWrapper: null,
        lineNumbers: null,
        highlightOutput: null,
        codeInput: null,
        footer: null
    };

    // The bridge to the manager's mind.
    let managerCallbacks = null;

    /**
     * Synchronizes the scroll position of the input textarea with the
     * background highlight view and the line numbers. This is the key
     * to the illusion.
     */
    function syncScroll() {
        const scrollTop = elements.codeInput.scrollTop;
        const scrollLeft = elements.codeInput.scrollLeft;

        elements.lineNumbers.scrollTop = scrollTop;
        // The <pre> element inside will scroll naturally with the wrapper
        elements.contentWrapper.scrollLeft = scrollLeft;
    }

    /**
     * Handles the 'input' event. It informs the manager of the change,
     * then re-renders the entire view.
     */
    function handleInput() {
        const content = elements.codeInput.value;
        if (managerCallbacks && managerCallbacks.onContentChange) {
            managerCallbacks.onContentChange(content);
        }
        render(content);
    }

    /**
     * Intercepts the Tab key to insert a tab character instead of changing focus.
     * @param {KeyboardEvent} e The keyboard event.
     */
    function handleKeyDown(e) {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = e.target.selectionStart;
            const end = e.target.selectionEnd;

            // Insert a tab character at the cursor position
            e.target.value = e.target.value.substring(0, start) + '\t' + e.target.value.substring(end);

            // Move cursor
            e.target.selectionStart = e.target.selectionEnd = start + 1;

            handleInput(); // Treat tab as content change
        }
    }

    /**
     * Renders the editor content. It gets highlighted code from the manager
     * and updates the line numbers.
     * @param {string} content The raw code to render.
     */
    function render(content) {
        const state = managerCallbacks.getInitialState();

        // 1. Get highlighted HTML from the manager
        const highlightedHtml = CodeManager.highlight(content, state.fileMode);
        elements.highlightOutput.innerHTML = highlightedHtml;

        // 2. Update line numbers
        const lineCount = content.split('\n').length || 1;
        const lineNumbersHtml = Array.from({length: lineCount}, (_, i) =>
            `<div class="line-number">${i + 1}</div>`
        ).join('');
        elements.lineNumbers.innerHTML = lineNumbersHtml;

        // 3. Ensure scroll is synchronized
        syncScroll();
    }


    // The public API for the UI module.
    const publicApi = {

        /**
         * Builds the entire DOM structure for the editor and displays it.
         * This is called only once, by CodeManager.enter().
         * @param {object} callbacks Callbacks from the CodeManager.
         */
        buildAndShow: function (callbacks) {
            if (elements.container) return; // Already built.

            managerCallbacks = callbacks;
            const initialState = managerCallbacks.getInitialState();

            // Create the container
            elements.container = document.createElement('div');
            elements.container.id = 'code-container';

            // --- Header ---
            elements.header = document.createElement('header');
            elements.header.id = 'code-header';
            elements.filePathDisplay = document.createElement('span');
            elements.filePathDisplay.id = 'code-file-path';
            const buttonsContainer = document.createElement('div');
            elements.saveButton = document.createElement('button');
            elements.saveButton.className = 'button';
            elements.saveButton.textContent = 'Save';
            elements.exitButton = document.createElement('button');
            elements.exitButton.className = 'button';
            elements.exitButton.textContent = 'Exit';
            buttonsContainer.append(elements.saveButton, elements.exitButton);
            elements.header.append(elements.filePathDisplay, buttonsContainer);

            // --- Main Content Area ---
            elements.main = document.createElement('main');
            elements.main.id = 'code-main';

            // This wrapper holds the input textarea and the visible content side-by-side
            const editorWrapper = document.createElement('div');
            editorWrapper.id = 'code-editor-content-wrapper';

            elements.lineNumbers = document.createElement('div');
            elements.lineNumbers.id = 'code-line-numbers';

            // The <pre><code> block for displaying the highlighted output
            const pre = document.createElement('pre');
            pre.id = 'code-highlight-output';
            elements.highlightOutput = document.createElement('code');
            pre.appendChild(elements.highlightOutput);

            // The invisible textarea for actual text input
            elements.codeInput = document.createElement('textarea');
            elements.codeInput.id = 'code-textarea-input';
            elements.codeInput.setAttribute('spellcheck', 'false');
            elements.codeInput.setAttribute('autocorrect', 'off');
            elements.codeInput.setAttribute('autocapitalize', 'off');

            editorWrapper.append(elements.lineNumbers, pre);
            elements.main.append(editorWrapper, elements.codeInput);

            // --- Footer ---
            elements.footer = document.createElement('footer');
            elements.footer.id = 'code-footer';
            // Placeholder, could be used for stats like line/col number
            elements.footer.textContent = `Mode: ${initialState.fileMode}`;

            // --- Assemble and Append ---
            elements.container.append(elements.header, elements.main, elements.footer);
            document.body.appendChild(elements.container);

            // --- Initial State & Render ---
            elements.codeInput.value = initialState.content;
            this.updateDirtyStatus(initialState.isDirty, initialState.filePath);
            render(initialState.content);

            // --- Attach Event Listeners ---
            elements.saveButton.addEventListener('click', managerCallbacks.onSave);
            elements.exitButton.addEventListener('click', managerCallbacks.onExit);
            elements.codeInput.addEventListener('input', handleInput);
            elements.codeInput.addEventListener('scroll', syncScroll);
            elements.codeInput.addEventListener('keydown', handleKeyDown);

            // Give focus to the editor
            elements.codeInput.focus();
        },

        /**
         * Updates the UI to show the file's dirty status.
         * @param {boolean} isDirty Whether the file has unsaved changes.
         * @param {string} filePath The path to the file.
         */
        updateDirtyStatus: function (isDirty, filePath) {
            elements.filePathDisplay.textContent = filePath || '[untitled]';
            if (isDirty) {
                elements.filePathDisplay.classList.add('dirty');
                elements.filePathDisplay.textContent += ' *';
            } else {
                elements.filePathDisplay.classList.remove('dirty');
            }
        },

        /**
         * Tears down the UI, removes elements and event listeners.
         * This is called by CodeManager.exit().
         */
        hideAndReset: function () {
            if (!elements.container) return;

            // Remove listeners to prevent memory leaks
            elements.saveButton.removeEventListener('click', managerCallbacks.onSave);
            elements.exitButton.removeEventListener('click', managerCallbacks.onExit);
            elements.codeInput.removeEventListener('input', handleInput);
            elements.codeInput.removeEventListener('scroll', syncScroll);
            elements.codeInput.removeEventListener('keydown', handleKeyDown);

            // Remove the container from the DOM
            document.body.removeChild(elements.container);

            // Reset the state to nothingness.
            elements = Object.keys(elements).reduce((acc, key) => {
                acc[key] = null;
                return acc;
            }, {});
            managerCallbacks = null;
        }
    };

    return publicApi;

})();