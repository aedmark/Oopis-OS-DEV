// aedmark/oopis-os-dev/Oopis-OS-DEV-33c780ad7f3af576fec163e3a060e1960f4bc842/scripts/output_manager.js
const OutputManager = (() => {
    "use strict";

    let isEditorActive = false; // This remains a global concept for now.

    const originalConsoleLog = console.log;
    const originalConsoleWarn = console.warn;
    const originalConsoleError = console.error;

    function setEditorActive(status) {
        isEditorActive = status;
    }

    async function appendToOutput(text, options = {}) {
        const {sessionContext} = options;
        if (!sessionContext) {
            originalConsoleError("OutputManager.appendToOutput: called without a sessionContext. Message:", text);
            return;
        }
        const outputDiv = sessionContext.domElements.output;

        if (isEditorActive && options.typeClass !== Config.CSS_CLASSES.EDITOR_MSG && !options.isCompletionSuggestion)
            return;

        if (!outputDiv) {
            originalConsoleError("OutputManager.appendToOutput: sessionContext.domElements.output is not defined. Message:", text);
            return;
        }

        const { typeClass = null, isBackground = false } = options;

        const {inputLine, prompt: promptContainer, input} = sessionContext.domElements;

        if (isBackground && inputLine && !inputLine.classList.contains(Config.CSS_CLASSES.HIDDEN)) {
            const promptText = promptContainer ? promptContainer.textContent : '> ';
            const currentInputVal = input ? input.textContent : '';

            const echoLine = Utils.createElement("div", {
                className: Config.CSS_CLASSES.OUTPUT_LINE,
                textContent: `${promptText}${currentInputVal}`,
            });
            outputDiv.appendChild(echoLine);
        }

        const lines = String(text).split("\n");
        const fragment = document.createDocumentFragment();

        for (const line of lines) {
            const lineClasses = Config.CSS_CLASSES.OUTPUT_LINE.split(" ");
            const lineAttributes = {
                classList: [...lineClasses],
                textContent: line,
            };

            if (typeClass) {
                typeClass.split(" ").forEach((cls) => {
                    if (cls) lineAttributes.classList.push(cls);
                });
            }

            fragment.appendChild(Utils.createElement("div", lineAttributes));
        }

        outputDiv.appendChild(fragment);
        outputDiv.scrollTop = outputDiv.scrollHeight;
    }

    function clearOutput(sessionContext) {
        if (!sessionContext) {
            console.error("clearOutput called without a sessionContext.");
            return;
        }
        const outputDiv = sessionContext.domElements.output;
        if (!isEditorActive && outputDiv) outputDiv.innerHTML = "";
    }

    function _consoleLogOverride(...args) {
        const activeSession = typeof TerminalManager !== 'undefined' ? TerminalManager.getActiveSession() : null;
        if (activeSession && typeof Utils !== "undefined" && typeof Utils.formatConsoleArgs === "function")
            void appendToOutput(`LOG: ${Utils.formatConsoleArgs(args)}`, {
                typeClass: Config.CSS_CLASSES.CONSOLE_LOG_MSG,
                sessionContext: activeSession
            });
        originalConsoleLog.apply(console, args);
    }

    function _consoleWarnOverride(...args) {
        const activeSession = typeof TerminalManager !== 'undefined' ? TerminalManager.getActiveSession() : null;
        if (activeSession && typeof Utils !== "undefined" && typeof Utils.formatConsoleArgs === "function")
            void appendToOutput(`WARN: ${Utils.formatConsoleArgs(args)}`, {
                typeClass: Config.CSS_CLASSES.WARNING_MSG,
                sessionContext: activeSession
            });
        originalConsoleWarn.apply(console, args);
    }

    function _consoleErrorOverride(...args) {
        const activeSession = typeof TerminalManager !== 'undefined' ? TerminalManager.getActiveSession() : null;
        if (activeSession && typeof Utils !== "undefined" && typeof Utils.formatConsoleArgs === "function")
            void appendToOutput(`ERROR: ${Utils.formatConsoleArgs(args)}`, {
                typeClass: Config.CSS_CLASSES.ERROR_MSG,
                sessionContext: activeSession
            });
        originalConsoleError.apply(console, args);
    }

    function initializeConsoleOverrides() {
        if (typeof Utils === "undefined" || typeof Utils.formatConsoleArgs !== "function") {
            originalConsoleError("OutputManager: Cannot initialize console overrides, Utils or Utils.formatConsoleArgs is not defined.");
            return;
        }
        console.log = _consoleLogOverride;
        console.warn = _consoleWarnOverride;
        console.error = _consoleErrorOverride;
    }

    return {
        setEditorActive,
        appendToOutput,
        clearOutput,
        initializeConsoleOverrides,
    };
})();