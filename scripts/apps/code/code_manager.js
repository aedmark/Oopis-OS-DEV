const CodeManager = (() => {
    "use strict";

    let state = {};

    const defaultState = {
        isActive: false,
        currentFilePath: null,
        originalContent: "",
        currentContent: "",
        isDirty: false,
        language: 'javascript',
    };

    function enter(filePath, fileContent) {
        if (state.isActive) return;

        state = {...defaultState};
        state.isActive = true;
        state.currentFilePath = filePath;
        state.originalContent = fileContent || "";
        state.currentContent = fileContent || "";
        state.language = _getLanguage(filePath);

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
            CodeUI.setContent(state.currentContent, state.language);
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
                        cancelText: "Cancel",
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
                state.language = _getLanguage(savePath);
                CodeUI.updateWindowTitle(savePath);
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
    };

    function _getLanguage(filePath) {
        if (!filePath) return 'javascript';
        const extension = Utils.getFileExtension(filePath);
        switch (extension) {
            case 'js':
                return 'javascript';
            case 'css':
                return 'css';
            case 'html':
                return 'markup';
            case 'md':
                return 'markdown';
            case 'py':
                return 'python';
            case 'sh':
                return 'bash';
            case 'json':
                return 'json';
            default:
                return 'javascript';
        }
    }

    return {enter, exit, isActive: () => state.isActive};
})();