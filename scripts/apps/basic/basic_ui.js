const BasicUI = (() => {
    "use strict";
    let elements = {};
    let callbacks = {};

    function buildLayout(cb) {
        callbacks = cb;
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
            eventListeners: { click: () => callbacks.onExit() }
        });

        const header = Utils.createElement('header', { className: 'basic-app__header' },
            Utils.createElement('h2', { className: 'basic-app__title', textContent: 'Oopis BASIC v1.0' }),
            elements.exitBtn
        );

        elements.container = Utils.createElement('div', { id: 'basic-app-container', className: 'basic-app__container' }, header, elements.output, inputContainer);

        elements.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const command = elements.input.value;
                elements.input.value = '';
                callbacks.onInput(command);
            }
        });

        return elements.container;
    }

    function appendOutput(text, withNewline = true) {
        if (!elements.output) return;
        elements.output.textContent += text + (withNewline ? '\n' : '');
        elements.output.scrollTop = elements.output.scrollHeight;
    }

    function write(text) {
        appendOutput(text, false);
    }

    function writeln(text) {
        appendOutput(text, true);
    }

    function focusInput() {
        if (elements.input) {
            elements.input.focus();
        }
    }

    function reset() {
        elements = {};
        callbacks = {};
    }

    return { buildLayout, write, writeln, focusInput, reset };
})();