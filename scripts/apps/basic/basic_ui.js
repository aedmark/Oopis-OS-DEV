// scripts/apps/basic/basic_ui.js

const BasicUI = (() => {
    "use strict";
    let elements = {};
    let callbacks = {}; // To store callbacks from the manager

    function buildLayout(cb) {
        callbacks = cb; // Store the manager's callbacks

        // --- Create DOM elements ---
        elements.output = Utils.createElement('div', { id: 'basic-app-output', className: 'basic-app__output' });
        elements.input = Utils.createElement('input', { id: 'basic-app-input', className: 'basic-app__input', type: 'text', spellcheck: 'false', autocapitalize: 'none' });
        const inputContainer = Utils.createElement('div', { className: 'basic-app__input-line' },
            Utils.createElement('span', { textContent: '>' }),
            elements.input
        );
        elements.exitBtn = Utils.createElement('button', {
            className: 'basic-app__exit-btn',
            textContent: '×',
            title: 'Exit BASIC (EXIT)',
        });
        const header = Utils.createElement('header', { className: 'basic-app__header' },
            Utils.createElement('h2', { className: 'basic-app__title', textContent: 'Oopis BASIC v1.0' }),
            elements.exitBtn
        );
        elements.container = Utils.createElement('div', { id: 'basic-app-container', className: 'basic-app__container' }, header, elements.output, inputContainer);

        // --- Add Event Listeners ---
        elements.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const command = elements.input.value;
                elements.input.value = '';
                callbacks.onInput(command); // Use callback
            }
        });
        elements.exitBtn.addEventListener('click', () => callbacks.onExit()); // Use callback

        return elements.container; // Return the created container
    }

    function write(text) {
        if (elements.output) {
            elements.output.textContent += text;
            elements.output.scrollTop = elements.output.scrollHeight;
        }
    }

    function writeln(text) {
        if (elements.output) {
            elements.output.textContent += text + '\n';
            elements.output.scrollTop = elements.output.scrollHeight;
        }
    }

    function focusInput() {
        if (elements.input) {
            elements.input.focus();
        }
    }

    function reset() {
        // Clear references to allow garbage collection
        elements = {};
        callbacks = {};
    }

    return { buildLayout, write, writeln, focusInput, reset };
})();