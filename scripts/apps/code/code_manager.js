// scripts/apps/code/code_manager.js
const CodeManager = (() => {
    "use strict";

    let state = {};
    let uiElements = {}; // To hold references to the textarea and highlighter

    const defaultState = {
        isActive: false,
        filePath: null,
        originalContent: "",
    };

    // --- PHASE 3: Refactoring the Highlighter ---
    const jsHighlighter = (text) => {
        // Basic HTML escaping
        const escapedText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        // Highlighting rules
        return escapedText
            .replace(/(\/\/. *)/g, '<em>$1</em>') // Comments
            .replace(/\b(new|if|else|do|while|switch|for|in|of|continue|break|return|typeof|function|var|const|let|async|await|class|extends|true|false|null)(?=[^\w])/g, '<strong>$1</strong>') // Keywords
            .replace(/(".*?"|'.*?'|`.*?`)/g, '<strong><em>$1</em></strong>') // Strings
            .replace(/\b(\d+)/g, '<em><strong>$1</strong></em>'); // Numbers
    };
    // --- END PHASE 3 ---


    const debouncedHighlight = Utils.debounce((content) => {
        if (uiElements.highlighter) {
            uiElements.highlighter.innerHTML = jsHighlighter(content);
        }
    }, 100); // Reduced delay for better responsiveness

    function enter(filePath, fileContent) {
        if (state.isActive) return;
        state = {...defaultState, isActive: true, filePath, originalContent: fileContent || ""};

        uiElements = {}; // Clear previous UI element references

        CodeUI.buildAndShow({filePath, fileContent: fileContent || ""}, (textarea, highlighter) => {
            // This callback is invoked by CodeUI once the elements are created
            uiElements.textarea = textarea;
            uiElements.highlighter = highlighter;
            // Initial highlight
            callbacks.onInput(fileContent || "");
        }, callbacks);
    }

    async function exit() {
        if (!state.isActive) return;
        _performExit();
    }

    function _performExit() {
        CodeUI.hideAndReset();
        state = {};
        uiElements = {};
    }

    const callbacks = {
        onSave: async (filePath, content) => {
            if (!filePath) {
                await OutputManager.appendToOutput("Error: Filename cannot be empty.", {typeClass: 'text-error'});
                return;
            }
            const currentUser = UserManager.getCurrentUser().name;
            const primaryGroup = UserManager.getPrimaryGroupForUser(currentUser);
            const saveResult = await FileSystemManager.createOrUpdateFile(filePath, content, {
                currentUser,
                primaryGroup
            });

            if (saveResult.success && await FileSystemManager.save()) {
                _performExit();
            } else {
                await OutputManager.appendToOutput(`Error saving file: ${saveResult.error || "Filesystem error"}`, {typeClass: 'text-error'});
            }
        },
        onExit: exit,
        // --- PHASE 4: Implement Indentation ---
        onTab: (textarea) => {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const value = textarea.value;

            // Insert two spaces at the caret position
            textarea.value = value.substring(0, start) + '  ' + value.substring(end);

            // Move the caret
            textarea.selectionStart = textarea.selectionEnd = start + 2;

            // Trigger the input event to re-highlight
            callbacks.onInput(textarea.value);
        },
        // --- END PHASE 4 ---

        onInput: (content) => {
            debouncedHighlight(content);
        },

        onPaste: (textarea, pastedText) => {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const value = textarea.value;

            // Manually insert the pasted text
            textarea.value = value.substring(0, start) + pastedText + value.substring(end);

            // Set the cursor to the beginning of the pasted content
            textarea.selectionStart = textarea.selectionEnd = start;

            // Trigger the input event to re-highlight
            callbacks.onInput(textarea.value);
        }
    };

    return {enter, exit, isActive: () => state.isActive};
})();