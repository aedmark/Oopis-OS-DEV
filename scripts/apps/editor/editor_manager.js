const EditorManager = (() => {
    "use strict";

    let state = {};

    const defaultState = {
        isActive: false,
        currentFilePath: null,
        originalContent: "",
        currentContent: "",
        isDirty: false,
        fileMode: 'text', // 'text', 'markdown', 'html'
        isPreviewMode: false,
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
        state.fileMode = _getFileMode(filePath);
        state.isPreviewMode = (state.fileMode === 'markdown' || state.fileMode === 'html');


        // Initial state for undo
        state.undoStack.push(state.currentContent);

        // Load word wrap preference
        state.wordWrap = StorageManager.loadItem(Config.STORAGE_KEYS.EDITOR_WORD_WRAP_ENABLED, "Editor Word Wrap", false);

        EditorUI.buildAndShow(state, callbacks);
    }

    function exit() {
        if (!state.isActive) return;

        if (state.isDirty) {
            const confirmed = confirm(Config.MESSAGES.EDITOR_DISCARD_CONFIRM);
            if (!confirmed) return;
        }
        _performExit();
    }

    function _performExit() {
        EditorUI.hideAndReset();
        state = {}; // Reset state
    }

    const callbacks = {
        onContentChange: (newContent) => {
            if (!state.isActive) return;
            state.currentContent = newContent;
            state.isDirty = state.currentContent !== state.originalContent;
            EditorUI.updateDirtyStatus(state.isDirty);

            // Debounced push to undo stack
            _debouncedPushUndo(newContent);

            // If in preview mode, tell the UI to update the preview pane
            if (state.isPreviewMode) {
                EditorUI.renderPreview(state.currentContent, state.fileMode);
            }
        },
        onSaveRequest: async () => {
            if (!state.isActive || !state.isDirty) return;

            let savePath = state.currentFilePath;
            if (!savePath) {
                // Simplified: prompt for a name. In a real scenario, this would be a file dialog.
                savePath = prompt("Save as:", "/home/Guest/untitled.txt");
                if (!savePath) {
                    EditorUI.updateStatusMessage("Save cancelled.");
                    return;
                }
                state.currentFilePath = savePath;
                state.fileMode = _getFileMode(savePath);
                EditorUI.updateWindowTitle(savePath);
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
                EditorUI.updateDirtyStatus(false);
                EditorUI.updateStatusMessage(`File saved to ${savePath}`);
            } else {
                EditorUI.updateStatusMessage(`Error: ${saveResult.error || "Failed to save file system changes."}`);
            }
        },
        onExitRequest: exit,
        onTogglePreview: () => {
            state.isPreviewMode = !state.isPreviewMode;
            EditorUI.togglePreview(state.isPreviewMode, state.fileMode, state.currentContent);
        },
        onUndo: () => {
            if (state.undoStack.length > 1) {
                const currentState = state.undoStack.pop();
                state.redoStack.push(currentState);
                state.currentContent = state.undoStack[state.undoStack.length - 1];
                EditorUI.setContent(state.currentContent);
                if (state.isPreviewMode) {
                    EditorUI.renderPreview(state.currentContent, state.fileMode);
                }
            }
        },
        onRedo: () => {
            if (state.redoStack.length > 0) {
                const nextState = state.redoStack.pop();
                state.undoStack.push(nextState);
                state.currentContent = nextState;
                EditorUI.setContent(state.currentContent);
                if (state.isPreviewMode) {
                    EditorUI.renderPreview(state.currentContent, state.fileMode);
                }
            }
        },
        onWordWrapToggle: () => {
            state.wordWrap = !state.wordWrap;
            StorageManager.saveItem(Config.STORAGE_KEYS.EDITOR_WORD_WRAP_ENABLED, state.wordWrap);
            EditorUI.setWordWrap(state.wordWrap);
        }
    };

    const _debouncedPushUndo = Utils.debounce((content) => {
        state.undoStack.push(content);
        if (state.undoStack.length > 50) { // Limit undo history
            state.undoStack.shift();
        }
        state.redoStack = []; // Clear redo on new action
    }, 500);


    function _getFileMode(filePath) {
        if (!filePath) return 'text';
        const extension = Utils.getFileExtension(filePath);
        if (extension === 'md') return 'markdown';
        if (extension === 'html') return 'html';
        return 'text';
    }

    return {enter, exit, isActive: () => state.isActive};
})();