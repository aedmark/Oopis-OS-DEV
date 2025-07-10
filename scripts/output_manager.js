const OutputManager = (() => {
    "use strict";

    let isEditorActive = false;

    const originalConsoleLog = console.log;
    const originalConsoleWarn = console.warn;
    const originalConsoleError = console.error;

    function setEditorActive(status) {
        isEditorActive = status;
    }

    async function appendToOutput(text, options = {}) {
        const outputDiv = options.outputEl || DOM.outputDiv; // MODIFIED: Use specific output element if provided

        if (
            isEditorActive &&
            options.typeClass !== Config.CSS_CLASSES.EDITOR_MSG &&
            !options.isCompletionSuggestion
        )
            return;
        if (!outputDiv) { // MODIFIED: Check the targeted outputDiv
            originalConsoleError(
                "OutputManager.appendToOutput: DOM.outputDiv is not defined. Message:",
                text
            );
            return;
        }
        const { typeClass = null, isBackground = false } = options;

        // This background handling logic needs to be aware of sessions now.
        // For now, we assume it's for the "active" one if no specific session is given.
        const activeSession = typeof TerminalManager !== 'undefined' ? TerminalManager.getActiveSession() : null;
        const inputLineContainer = activeSession ? activeSession.domElements.inputLine : DOM.inputLineContainerDiv;
        const promptContainer = activeSession ? activeSession.domElements.prompt : DOM.promptContainer;

        if (
            isBackground &&
            inputLineContainer &&
            !inputLineContainer.classList.contains(Config.CSS_CLASSES.HIDDEN)
        ) {

            const promptText = promptContainer ? promptContainer.textContent : '> ';
            const currentInputVal = activeSession ? activeSession.domElements.input.textContent : TerminalUI.getCurrentInputValue();

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

    function clearOutput(session) {
        const outputDiv = session ? session.domElements.output : DOM.outputDiv;
        if (!isEditorActive && outputDiv) outputDiv.innerHTML = "";
    }

    function _consoleLogOverride(...args) {
        const activeSession = typeof TerminalManager !== 'undefined' ? TerminalManager.getActiveSession() : null;
        if (
            DOM.outputDiv &&
            typeof Utils !== "undefined" &&
            typeof Utils.formatConsoleArgs === "function"
        )
            void appendToOutput(`LOG: ${Utils.formatConsoleArgs(args)}`, {
                typeClass: Config.CSS_CLASSES.CONSOLE_LOG_MSG,
                outputEl: activeSession ? activeSession.domElements.output : null
            });
        originalConsoleLog.apply(console, args);
    }

    function _consoleWarnOverride(...args) {
        const activeSession = typeof TerminalManager !== 'undefined' ? TerminalManager.getActiveSession() : null;
        if (
            DOM.outputDiv &&
            typeof Utils !== "undefined" &&
            typeof Utils.formatConsoleArgs === "function"
        )
            void appendToOutput(`WARN: ${Utils.formatConsoleArgs(args)}`, {
                typeClass: Config.CSS_CLASSES.WARNING_MSG,
                outputEl: activeSession ? activeSession.domElements.output : null
            });
        originalConsoleWarn.apply(console, args);
    }

    function _consoleErrorOverride(...args) {
        const activeSession = typeof TerminalManager !== 'undefined' ? TerminalManager.getActiveSession() : null;
        if (
            DOM.outputDiv &&
            typeof Utils !== "undefined" &&
            typeof Utils.formatConsoleArgs === "function"
        )
            void appendToOutput(`ERROR: ${Utils.formatConsoleArgs(args)}`, {
                typeClass: Config.CSS_CLASSES.ERROR_MSG,
                outputEl: activeSession ? activeSession.domElements.output : null
            });
        originalConsoleError.apply(console, args);
    }

    function initializeConsoleOverrides() {
        if (
            typeof Utils === "undefined" ||
            typeof Utils.formatConsoleArgs !== "function"
        ) {
            originalConsoleError(
                "OutputManager: Cannot initialize console overrides, Utils or Utils.formatConsoleArgs is not defined."
            );
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