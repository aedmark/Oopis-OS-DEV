// scripts/apps/editor/editor_manager.js

const EditorManager = (() => {
    "use strict";

    let state = {};

    const defaultState = {
        isActive: false,
        currentFilePath: null,
        originalContent: "",
        currentContent: "",
        isDirty: false,
        fileType: 'text', // 'text', 'markdown', 'html', 'code'
        viewMode: 'edit', // 'edit', 'split', 'preview' for md/html; 'edit' for text/code
        undoStack: [],
        redoStack: [],
        wordWrap: false,
        onSaveCallback: null,
    };

    // --- Highlighter (from the old code_manager) ---
    const jsHighlighter = (text) => {
        const escapedText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return escapedText
            .replace(/(\/\/. *)/g, '<em>$1</em>') // Comments
            .replace(/\b(new|if|else|do|while|switch|for|in|of|continue|break|return|typeof|function|var|const|let|async|await|class|extends|true|false|null)(?=[^\w])/g, '<strong>$1</strong>') // Keywords
            .replace(/(".*?"|'.*?'|`.*?`)/g, '<strong><em>$1</em></strong>') // Strings
            .replace(/\b(\d+)/g, '<em><strong>$1</strong></em>'); // Numbers
    };

    const debouncedHighlight = Utils.debounce((content) => {
        EditorUI.renderPreview(content, state.fileType, jsHighlighter);
    }, 100);


    function enter(filePath, fileContent, onSaveCallback = null) {
        if (state.isActive) return;

        state = {...defaultState};
        state.isActive = true;
        state.currentFilePath = filePath;
        state.onSaveCallback = onSaveCallback;

        const normalizedContent = (fileContent || "").replace(/\r\n|\r/g, "\n");
        state.originalContent = normalizedContent;
        state.currentContent = normalizedContent;

        state.fileType = _getFileType(filePath);
        // Default view mode based on file type
        state.viewMode = (state.fileType === 'markdown' || state.fileType === 'html') ? 'split' : 'edit';


        state.undoStack.push(state.currentContent);

        state.wordWrap = StorageManager.loadItem(Config.STORAGE_KEYS.EDITOR_WORD_WRAP_ENABLED, "Editor Word Wrap", false);

        EditorUI.buildAndShow(state, callbacks);
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
        EditorUI.hideAndReset();
        state = {};
    }

    const callbacks = {
        onContentChange: (newContent) => {
            if (!state.isActive) return;
            state.currentContent = newContent;
            state.isDirty = state.currentContent !== state.originalContent;
            EditorUI.updateDirtyStatus(state.isDirty);

            _debouncedPushUndo(newContent);
            debouncedHighlight(state.currentContent);
        },
        onSaveRequest: async () => {
            if (!state.isActive) return;

            let savePath = state.currentFilePath;
            if (!savePath) {
                const newName = await new Promise(resolve => {
                    ModalManager.request({
                        context: 'graphical-input',
                        messageLines: ["Save New File"],
                        placeholder: "/home/Guest/untitled.txt",
                        confirmText: "Save",
                        cancelText: "Cancel",
                        onConfirm: (value) => resolve(value),
                        onCancel: () => resolve(null)
                    });
                });

                if (!newName) {
                    EditorUI.updateStatusMessage("Save cancelled.");
                    return;
                }
                savePath = newName;
                state.currentFilePath = savePath;
                state.fileType = _getFileType(savePath);
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
                if (typeof state.onSaveCallback === 'function') {
                    await state.onSaveCallback(savePath);
                }
            } else {
                EditorUI.updateStatusMessage(`Error: ${saveResult.error || "Failed to save file system changes."}`);
            }
        },
        onExitRequest: exit,
        onTogglePreview: () => {
            if (state.fileType === 'text' || state.fileType === 'code') {
                state.viewMode = 'edit';
            } else {
                const modes = ['split', 'edit', 'preview'];
                const currentIndex = modes.indexOf(state.viewMode);
                state.viewMode = modes[(currentIndex + 1) % modes.length];
            }
            EditorUI.setViewMode(state.viewMode, state.fileType, state.currentContent, jsHighlighter);
        },
        onUndo: () => {
            if (state.undoStack.length > 1) {
                const currentState = state.undoStack.pop();
                state.redoStack.push(currentState);
                state.currentContent = state.undoStack[state.undoStack.length - 1];
                EditorUI.setContent(state.currentContent);
                debouncedHighlight(state.currentContent);
            }
        },
        onRedo: () => {
            if (state.redoStack.length > 0) {
                const nextState = state.redoStack.pop();
                state.undoStack.push(nextState);
                state.currentContent = nextState;
                EditorUI.setContent(state.currentContent);
                debouncedHighlight(state.currentContent);
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
        if (state.undoStack.length > 50) {
            state.undoStack.shift();
        }
        state.redoStack = [];
    }, 500);

    function _getFileType(filePath) {
        if (!filePath) return 'text';
        const extension = Utils.getFileExtension(filePath);
        switch(extension) {
            case 'md': return 'markdown';
            case 'html': return 'html';
            case 'js':
            case 'sh':
            case 'css':
            case 'json':
                return 'code';
            default: return 'text';
        }
    }

    return {enter, exit, isActive: () => state.isActive};
})();