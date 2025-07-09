const CodeManager = (() => {
    "use strict";

    let state = {};

    const defaultState = {
        isActive: false,
        currentFilePath: null,
        originalContent: "",
        currentContent: "",
        isDirty: false,
        undoStack: [],
        redoStack: [],
        wordWrap: false
    };

    function enter(filePath, fileContent) {
        if (state.isActive) return;

        state = {...defaultState};
        state.isActive = true;
        state.currentFilePath = filePath;
        state.originalContent = fileContent || "";
        state.currentContent = fileContent || "";
        state.wordWrap = StorageManager.loadItem(Config.STORAGE_KEYS.EDITOR_WORD_WRAP_ENABLED, "Code Editor Word Wrap", false);

        state.undoStack.push(state.currentContent);

        CodeUI.buildAndShow(state, callbacks);
    }

    async function exit() {
        if (!state.isActive) return;

        if (state.isDirty) {
            const confirmed = await new Promise(resolve => {
                ModalManager.request({
                    context: 'graphical',
                    messageLines: ["You have unsaved changes that will be lost.", "Are you sure you want to exit?"],
                    confirmText: "Discard Changes",
                    cancelText: "Cancel",
                    onConfirm: () => resolve(true),
                    onCancel: () => resolve(false)
                });
            });
            if (!confirmed) return;
        }
        _performExit();
    }

    function _performExit() {
        CodeUI.hideAndReset();
        state = {};
    }

    const callbacks = {
        onContentChange: (newContent) => {
            if (!state.isActive) return;
            state.currentContent = newContent;
            state.isDirty = state.currentContent !== state.originalContent;
            CodeUI.updateDirtyStatus(state.isDirty);
            CodeUI.updateSyntaxHighlighting(newContent);
            _debouncedPushUndo(newContent);
        },
        onSaveRequest: async () => {
            if (!state.isActive) return;

            let savePath = state.currentFilePath;
            if (!savePath) {
                const newName = await new Promise(resolve => {
                    ModalManager.request({
                        context: 'graphical-input',
                        messageLines: ["Save New File"],
                        placeholder: "/home/Guest/untitled.js",
                        confirmText: "Save",
                        onConfirm: (value) => resolve(value),
                        onCancel: () => resolve(null)
                    });
                });

                if (!newName) {
                    CodeUI.updateStatusMessage("Save cancelled.");
                    return;
                }
                savePath = newName;
                state.currentFilePath = savePath;
                CodeUI.updateWindowTitle(savePath);
                CodeUI.updateLanguage(Utils.getFileExtension(savePath));
            }

            const currentUser = UserManager.getCurrentUser().name;
            const primaryGroup = UserManager.getPrimaryGroupForUser(currentUser);

            const saveResult = await FileSystemManager.createOrUpdateFile(savePath, state.currentContent, {
                currentUser,
                primaryGroup
            });

            if (saveResult.success && await FileSystemManager.save()) {
                state.originalContent = state.currentContent;
                state.isDirty = false;
                CodeUI.updateDirtyStatus(false);
                CodeUI.updateStatusMessage(`File saved to ${savePath}`);
            } else {
                CodeUI.updateStatusMessage(`Error: ${saveResult.error || "Failed to save file system changes."}`);
            }
        },
        onExitRequest: exit,
        onUndo: () => {
            if (state.undoStack.length > 1) {
                const currentState = state.undoStack.pop();
                state.redoStack.push(currentState);
                state.currentContent = state.undoStack[state.undoStack.length - 1];
                CodeUI.setContent(state.currentContent);
                CodeUI.updateSyntaxHighlighting(state.currentContent);
            }
        },
        onRedo: () => {
            if (state.redoStack.length > 0) {
                const nextState = state.redoStack.pop();
                state.undoStack.push(nextState);
                state.currentContent = nextState;
                CodeUI.setContent(state.currentContent);
                CodeUI.updateSyntaxHighlighting(state.currentContent);
            }
        },
        onWordWrapToggle: () => {
            state.wordWrap = !state.wordWrap;
            StorageManager.saveItem(Config.STORAGE_KEYS.EDITOR_WORD_WRAP_ENABLED, state.wordWrap);
            CodeUI.setWordWrap(state.wordWrap);
        }
    };

    const _debouncedPushUndo = Utils.debounce((content) => {
        state.undoStack.push(content);
        if (state.undoStack.length > 50) {
            state.undoStack.shift();
        }
        state.redoStack = [];
    }, 500);

    return {enter, exit, isActive: () => !!state.isActive};
})();