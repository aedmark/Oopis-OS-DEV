// scripts/terminal_ui.js
var TerminalUI = (() => {
    "use strict";
    let isNavigatingHistory = false;
    let _isObscuredInputMode = false;
    let elements = {};
    let originalInputForObscure = "";

    function initialize(dom) {
        elements = dom;
    }

    function updatePrompt() {
        const user = UserManager.getCurrentUser() || {name: Config.USER.DEFAULT_NAME};
        const ps1 = EnvironmentManager.get('PS1');

        if (!elements.promptContainer) return;

        if (ps1) {
            const host = EnvironmentManager.get('HOST') || Config.OS.DEFAULT_HOST_NAME;
            const path = FileSystemManager.getCurrentPath() || Config.FILESYSTEM.ROOT_PATH;
            const homeDir = `/home/${user.name}`;
            const displayPath = path.startsWith(homeDir) ? `~${path.substring(homeDir.length)}` : path;

            let parsedPrompt = ps1.replace(/\\u/g, user.name)
                .replace(/\\h/g, host)
                .replace(/\\w/g, displayPath)
                .replace(/\\W/g, path.substring(path.lastIndexOf('/') + 1) || '/')
                .replace(/\\$/g, user.name === 'root' ? '#' : '$')
                .replace(/\\s/g, "OopisOS")
                .replace(/\\\\/g, '\\');

            elements.promptContainer.textContent = parsedPrompt;
        } else {
            const path = FileSystemManager.getCurrentPath();
            const promptChar = user.name === 'root' ? '#' : Config.TERMINAL.PROMPT_CHAR;
            elements.promptContainer.textContent = `${user.name}${Config.TERMINAL.PROMPT_AT}${Config.OS.DEFAULT_HOST_NAME}${Config.TERMINAL.PROMPT_SEPARATOR}${path}${promptChar} `;
        }
    }

    function getPromptText() {
        return elements.promptContainer ? elements.promptContainer.textContent : '';
    }

    function focusInput() {
        if (elements.editableInputDiv && elements.editableInputDiv.contentEditable === "true") {
            elements.editableInputDiv.focus();
            if (elements.editableInputDiv.textContent.length === 0)
                setCaretToEnd(elements.editableInputDiv);
        }
    }

    function clearInput() {
        if (elements.editableInputDiv) elements.editableInputDiv.textContent = "";
        originalInputForObscure = "";
    }

    function getCurrentInputValue() {
        return _isObscuredInputMode ? originalInputForObscure : (elements.editableInputDiv ? elements.editableInputDiv.textContent : "");
    }

    function setCurrentInputValue(value, setAtEnd = true) {
        if (elements.editableInputDiv) {
            if (_isObscuredInputMode) {
                originalInputForObscure = value;
                elements.editableInputDiv.textContent = '*'.repeat(value.length);
            } else {
                elements.editableInputDiv.textContent = value;
            }
            if (setAtEnd) setCaretToEnd(elements.editableInputDiv);
        }
    }
    function updateInputForObscure(key) {
        const selection = getSelection();
        let { start, end } = selection;

        if (key === "Backspace") {
            if (start === end && start > 0) {
                originalInputForObscure = originalInputForObscure.slice(0, start - 1) + originalInputForObscure.slice(start);
                start--;
            } else if (start !== end) {
                originalInputForObscure = originalInputForObscure.slice(0, start) + originalInputForObscure.slice(end);
            }
        } else if (key === "Delete") {
            if (start === end && start < originalInputForObscure.length) {
                originalInputForObscure = originalInputForObscure.slice(0, start) + originalInputForObscure.slice(start + 1);
            } else if (start !== end) {
                originalInputForObscure = originalInputForObscure.slice(0, start) + originalInputForObscure.slice(end);
            }
        } else if (key.length === 1) {
            originalInputForObscure = originalInputForObscure.slice(0, start) + key + originalInputForObscure.slice(end);
            start += key.length;
        }

        elements.editableInputDiv.textContent = "*".repeat(originalInputForObscure.length);
        setCaretPosition(elements.editableInputDiv, start);
    }


    function setCaretToEnd(element) {
        if (!element || typeof window.getSelection === "undefined" || typeof document.createRange === "undefined") return;
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(element);
        range.collapse(false);
        if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
        }
        element.focus();
    }

    function setCaretPosition(element, position) {
        if (!element || typeof position !== "number" || typeof window.getSelection === "undefined" || typeof document.createRange === "undefined") return;
        const sel = window.getSelection();
        if (!sel) return;
        const range = document.createRange();
        let charCount = 0;
        let foundNode = false;

        function findTextNodeAndSet(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                const nextCharCount = charCount + node.length;
                if (!foundNode && position >= charCount && position <= nextCharCount) {
                    range.setStart(node, position - charCount);
                    range.collapse(true);
                    foundNode = true;
                }
                charCount = nextCharCount;
            } else {
                for (let i = 0; i < node.childNodes.length; i++) {
                    if (findTextNodeAndSet(node.childNodes[i])) return true;
                    if (foundNode) break;
                }
            }
            return foundNode;
        }

        if (element.childNodes.length === 0 && position === 0) {
            range.setStart(element, 0);
            range.collapse(true);
            foundNode = true;
        } else findTextNodeAndSet(element);
        if (foundNode) {
            sel.removeAllRanges();
            sel.addRange(range);
        } else setCaretToEnd(element);
        element.focus();
    }

    function setInputState(isEditable, obscured = false) {
        if (elements.editableInputDiv) {
            elements.editableInputDiv.contentEditable = isEditable ? "true" : "false";
            elements.editableInputDiv.style.opacity = isEditable ? "1" : "0.5";
            _isObscuredInputMode = obscured;
            if (isEditable && obscured) {
                originalInputForObscure = "";
                elements.editableInputDiv.textContent = "";
            }
            if (!isEditable) elements.editableInputDiv.blur();
        }
    }
    function isObscured() {
        return _isObscuredInputMode;
    }


    function setIsNavigatingHistory(status) {
        isNavigatingHistory = status;
    }

    function getIsNavigatingHistory() {
        return isNavigatingHistory;
    }

    function getSelection() {
        const sel = window.getSelection();
        let start, end;
        if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            if (elements.editableInputDiv && elements.editableInputDiv.contains(range.commonAncestorContainer)) {
                const preSelectionRange = range.cloneRange();
                preSelectionRange.selectNodeContents(elements.editableInputDiv);
                preSelectionRange.setEnd(range.startContainer, range.startOffset);
                start = preSelectionRange.toString().length;
                end = start + range.toString().length;
            } else {
                start = end = getCurrentInputValue().length;
            }
        } else {
            start = end = getCurrentInputValue().length;
        }
        return {start, end};
    }

    function showInputLine() {
        if (elements.inputLineContainerDiv) {
            elements.inputLineContainerDiv.classList.remove(Config.CSS_CLASSES.HIDDEN);
        }
    }

    function hideInputLine() {
        if (elements.inputLineContainerDiv) {
            elements.inputLineContainerDiv.classList.add(Config.CSS_CLASSES.HIDDEN);
        }
    }

    function scrollOutputToEnd() {
        if (elements.outputDiv) {
            elements.outputDiv.scrollTop = elements.outputDiv.scrollHeight;
        }
    }
    function handlePaste(pastedText) {
        if (isObscured()) {
            const selection = getSelection();
            let { start, end } = selection;
            originalInputForObscure = originalInputForObscure.slice(0, start) + pastedText + originalInputForObscure.slice(end);
            elements.editableInputDiv.textContent = "*".repeat(originalInputForObscure.length);
            setCaretPosition(elements.editableInputDiv, start + pastedText.length);
        } else {
            const selection = window.getSelection();
            if (!selection.rangeCount) return;
            const range = selection.getRangeAt(0);
            range.deleteContents();
            const textNode = document.createTextNode(pastedText);
            range.insertNode(textNode);
            range.setStartAfter(textNode);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }

    return {
        initialize,
        updatePrompt,
        getPromptText,
        focusInput,
        clearInput,
        setCurrentInputValue,
        getCurrentInputValue,
        setIsNavigatingHistory,
        getIsNavigatingHistory,
        setCaretPosition,
        setInputState,
        getSelection,
        showInputLine,
        hideInputLine,
        scrollOutputToEnd,
        isObscured,
        updateInputForObscure,
        handlePaste
    };
})();

var TabCompletionManager = (() => {
    "use strict";
    let suggestionsCache = [];
    let cycleIndex = -1;
    let lastCompletionInput = null;

    function resetCycle() {
        suggestionsCache = [];
        cycleIndex = -1;
        lastCompletionInput = null;
    }

    function findLongestCommonPrefix(strs) {
        if (!strs || strs.length === 0) return "";
        if (strs.length === 1) return strs[0];
        let prefix = strs[0];
        for (let i = 1; i < strs.length; i++) {
            while (strs[i].indexOf(prefix) !== 0) {
                prefix = prefix.substring(0, prefix.length - 1);
                if (prefix === "") return "";
            }
        }
        return prefix;
    }

    function _getCompletionContext(fullInput, cursorPos) {
        const tokens = (fullInput.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []);
        const commandName = tokens.length > 0 ? tokens[0].replace(/["']/g, '') : "";
        const textBeforeCursor = fullInput.substring(0, cursorPos);
        let startOfWordIndex = 0;
        let inQuote = null;
        for (let i = 0; i < textBeforeCursor.length; i++) {
            const char = textBeforeCursor[i];
            if (inQuote && char === inQuote && textBeforeCursor[i - 1] !== '\\') {
                inQuote = null;
            } else if (!inQuote && (char === '"' || char === "'") && (i === 0 || textBeforeCursor[i - 1] === ' ' || textBeforeCursor[i - 1] === undefined)) {
                inQuote = char;
            }
            if (char === ' ' && !inQuote) {
                startOfWordIndex = i + 1;
            }
        }
        const currentWordWithQuotes = fullInput.substring(startOfWordIndex, cursorPos);
        const quoteChar = currentWordWithQuotes.startsWith("'") ? "'" : currentWordWithQuotes.startsWith('"') ? '"' : null;
        const currentWordPrefix = quoteChar ? currentWordWithQuotes.substring(1) : currentWordWithQuotes;
        const isQuoted = !!quoteChar;
        const isCompletingCommand = tokens.length === 0 || (tokens.length === 1 && !fullInput.substring(0, tokens[0].length).includes(' '));
        return {
            commandName,
            isCompletingCommand,
            currentWordPrefix,
            startOfWordIndex,
            currentWordLength: currentWordWithQuotes.length,
            isQuoted,
            quoteChar
        };
    }

    async function _getSuggestionsFromProvider(context) {
        const {currentWordPrefix, isCompletingCommand, commandName} = context;
        let suggestions = [];

        if (isCompletingCommand) {
            suggestions = Config.COMMANDS_MANIFEST
                .filter((cmd) => cmd.toLowerCase().startsWith(currentWordPrefix.toLowerCase()))
                .sort();
        } else {
            const commandLoaded = await CommandExecutor._ensureCommandLoaded(commandName);
            if (!commandLoaded) return [];

            const commandDefinition = CommandExecutor.getCommands()[commandName]?.handler.definition;
            if (!commandDefinition) return [];

            if (commandDefinition.completionType === "commands") {
                suggestions = Config.COMMANDS_MANIFEST
                    .filter((cmd) => cmd.toLowerCase().startsWith(currentWordPrefix.toLowerCase()))
                    .sort();
            } else if (commandDefinition.completionType === "users") {
                const users = StorageManager.loadItem(Config.STORAGE_KEYS.USER_CREDENTIALS, "User list", {});
                const userNames = Object.keys(users);
                if (!userNames.includes(Config.USER.DEFAULT_NAME)) userNames.push(Config.USER.DEFAULT_NAME);
                suggestions = userNames
                    .filter((name) => name.toLowerCase().startsWith(currentWordPrefix.toLowerCase()))
                    .sort();
            } else if (commandDefinition.completionType === 'paths' || commandDefinition.pathValidation) {
                const lastSlashIndex = currentWordPrefix.lastIndexOf(Config.FILESYSTEM.PATH_SEPARATOR);
                const pathPrefixForFS = lastSlashIndex !== -1 ? currentWordPrefix.substring(0, lastSlashIndex + 1) : "";
                const segmentToMatchForFS = lastSlashIndex !== -1 ? currentWordPrefix.substring(lastSlashIndex + 1) : currentWordPrefix;

                const effectiveBasePathForFS = FileSystemManager.getAbsolutePath(pathPrefixForFS, FileSystemManager.getCurrentPath());
                const baseNode = FileSystemManager.getNodeByPath(effectiveBasePathForFS);
                const currentUser = UserManager.getCurrentUser().name;

                if (baseNode && baseNode.type === Config.FILESYSTEM.DEFAULT_DIRECTORY_TYPE && FileSystemManager.hasPermission(baseNode, currentUser, "read")) {
                    suggestions = Object.keys(baseNode.children)
                        .filter((name) => name.toLowerCase().startsWith(segmentToMatchForFS.toLowerCase()))
                        .map((name) => pathPrefixForFS + name)
                        .sort();
                }
            }
        }
        return suggestions;
    }

    async function handleTab(fullInput, cursorPos) {
        if (fullInput !== lastCompletionInput) {
            resetCycle();
        }

        const context = _getCompletionContext(fullInput, cursorPos);

        if (suggestionsCache.length === 0) {
            const suggestions = await _getSuggestionsFromProvider(context);
            if (!suggestions || suggestions.length === 0) {
                resetCycle();
                return {textToInsert: null};
            }
            if (suggestions.length === 1) {
                const completion = suggestions[0];
                const completedNode = FileSystemManager.getNodeByPath(FileSystemManager.getAbsolutePath(completion));
                const isDirectory = completedNode && completedNode.type === Config.FILESYSTEM.DEFAULT_DIRECTORY_TYPE;

                const finalCompletion = completion + (isDirectory ? '/' : ' ');
                const textBefore = fullInput.substring(0, context.startOfWordIndex);
                const textAfter = fullInput.substring(cursorPos);

                let newText = textBefore + finalCompletion + textAfter;

                resetCycle();
                return {textToInsert: newText, newCursorPos: (textBefore + finalCompletion).length};
            }

            const lcp = findLongestCommonPrefix(suggestions);
            if (lcp && lcp.length > context.currentWordPrefix.length) {
                const textBefore = fullInput.substring(0, context.startOfWordIndex);
                const textAfter = fullInput.substring(cursorPos);
                let newText = textBefore + lcp + textAfter;

                lastCompletionInput = newText;
                return {textToInsert: newText, newCursorPos: (textBefore + lcp).length};
            } else {
                suggestionsCache = suggestions;
                cycleIndex = -1;
                lastCompletionInput = fullInput;
                const promptText = `${TerminalUI.getPromptText()} `;
                void OutputManager.appendToOutput(`${promptText}${fullInput}`, {isCompletionSuggestion: true});
                void OutputManager.appendToOutput(suggestionsCache.join("    "), {
                    typeClass: 'text-subtle',
                    isCompletionSuggestion: true
                });

                TerminalUI.scrollOutputToEnd();
                return {textToInsert: null};
            }
        } else {
            cycleIndex = (cycleIndex + 1) % suggestionsCache.length;
            const nextSuggestion = suggestionsCache[cycleIndex];
            const completedNode = FileSystemManager.getNodeByPath(FileSystemManager.getAbsolutePath(nextSuggestion));
            const isDirectory = completedNode && completedNode.type === Config.FILESYSTEM.DEFAULT_DIRECTORY_TYPE;

            const textBefore = fullInput.substring(0, context.startOfWordIndex);
            const textAfter = fullInput.substring(cursorPos);
            const completionText = nextSuggestion + (isDirectory ? '/' : ' ');
            let newText = textBefore + completionText + textAfter;

            lastCompletionInput = newText;
            return {textToInsert: newText, newCursorPos: (textBefore + completionText).length};
        }
    }

    return {
        handleTab,
        resetCycle,
    };
})();

var AppLayerManager = (() => {
    "use strict";
    let cachedAppLayer = null;
    let activeApp = null;

    function initialize(dom) {
        cachedAppLayer = dom.appLayer;
    }

    function _handleGlobalKeyDown(event) {
        if (activeApp && typeof activeApp.handleKeyDown === 'function') {
            activeApp.handleKeyDown(event);
        }
    }

    function show(appInstance, options = {}) {
        if (!(appInstance instanceof App)) {
            console.error("AppLayerManager: Attempted to show an object that is not an instance of App.");
            return;
        }

        if (activeApp) {
            activeApp.exit();
        }

        activeApp = appInstance;

        activeApp.enter(cachedAppLayer, options);

        cachedAppLayer.classList.remove('hidden');
        document.addEventListener('keydown', _handleGlobalKeyDown, true);

        TerminalUI.setInputState(false);
        OutputManager.setEditorActive(true);

        if (activeApp.container && typeof activeApp.container.focus === 'function') {
            activeApp.container.focus();
        }
    }

    function hide(appInstance) {
        if (activeApp !== appInstance) {
            return;
        }

        if (appInstance.container && appInstance.container.parentNode === cachedAppLayer) {
            cachedAppLayer.removeChild(appInstance.container);
        }
        cachedAppLayer.classList.add('hidden');
        document.removeEventListener('keydown', _handleGlobalKeyDown, true);

        activeApp = null;

        TerminalUI.showInputLine();
        TerminalUI.setInputState(true);
        OutputManager.setEditorActive(false);
        TerminalUI.focusInput();
    }

    return {
        initialize,
        show,
        hide,
        isActive: () => !!activeApp,
    };
})();