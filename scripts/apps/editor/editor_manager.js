// In scripts/apps/editor/editor_manager.js

class EditorManager extends App {
    constructor() {
        super();
        this.state = {};
    }

    enter(appLayer, options = {}) {
        const { filePath, fileContent, onSaveCallback } = options;

        this.state = {
            isActive: true,
            currentFilePath: filePath,
            originalContent: (fileContent || "").replace(/\r\n|\r/g, "\n"),
            currentContent: (fileContent || "").replace(/\r\n|\r/g, "\n"),
            isDirty: false,
            fileMode: this._getFileMode(filePath),
            viewMode: 'split',
            undoStack: [(fileContent || "").replace(/\r\n|\r/g, "\n")],
            redoStack: [],
            wordWrap: StorageManager.loadItem(Config.STORAGE_KEYS.EDITOR_WORD_WRAP_ENABLED, "Editor Word Wrap", false),
            onSaveCallback: onSaveCallback || null,
        };

        this.container = EditorUI.buildAndShow(this.state, this._getCallbacks());
        appLayer.appendChild(this.container);
    }

    exit() {
        if (!this.isActive) return;

        if (this.state.isDirty) {
            ModalManager.request({
                context: 'graphical',
                messageLines: ["You have unsaved changes that will be lost.", "Are you sure you want to exit?"],
                confirmText: "Discard Changes",
                cancelText: "Cancel",
                onConfirm: () => this._performExit(),
                onCancel: () => {}
            });
        } else {
            this._performExit();
        }
    }

    _performExit() {
        EditorUI.hideAndReset();
        AppLayerManager.hide(this);
    }

    _getFileMode(filePath) {
        if (!filePath) return 'text';
        const extension = Utils.getFileExtension(filePath);
        if (extension === 'md') return 'markdown';
        if (extension === 'html') return 'html';
        return 'text';
    }

    _debouncedPushUndo(content) {
        if (!this._debouncedUndo) {
            this._debouncedUndo = Utils.debounce((c) => {
                this.state.undoStack.push(c);
                if (this.state.undoStack.length > 50) {
                    this.state.undoStack.shift();
                }
                this.state.redoStack = [];
            }, 500);
        }
        this._debouncedUndo(content);
    }

    _getCallbacks() {
        return {
            onContentChange: (newContent) => {
                if (!this.isActive) return;
                this.state.currentContent = newContent;
                this.state.isDirty = this.state.currentContent !== this.state.originalContent;
                EditorUI.updateDirtyStatus(this.state.isDirty);
                this._debouncedPushUndo(newContent);
                if (this.state.viewMode !== 'edit') {
                    EditorUI.renderPreview(this.state.currentContent, this.state.fileMode);
                }
            },
            onSaveRequest: async () => {
                if (!this.isActive) return;
                let savePath = this.state.currentFilePath;
                if (!savePath) {
                    savePath = await new Promise(resolve => {
                        ModalManager.request({
                            context: 'graphical-input',
                            messageLines: ["Save New File"],
                            placeholder: "/home/Guest/untitled.txt",
                            onConfirm: (value) => resolve(value),
                            onCancel: () => resolve(null)
                        });
                    });
                    if (!savePath) {
                        EditorUI.updateStatusMessage("Save cancelled.");
                        return;
                    }
                    this.state.currentFilePath = savePath;
                    this.state.fileMode = this._getFileMode(savePath);
                    EditorUI.updateWindowTitle(savePath);
                }
                const saveResult = await FileSystemManager.createOrUpdateFile(savePath, this.state.currentContent, {
                    currentUser: UserManager.getCurrentUser().name,
                    primaryGroup: UserManager.getPrimaryGroupForUser(UserManager.getCurrentUser().name)
                });
                if (saveResult.success && await FileSystemManager.save()) {
                    this.state.originalContent = this.state.currentContent;
                    this.state.isDirty = false;
                    EditorUI.updateDirtyStatus(false);
                    EditorUI.updateStatusMessage(`File saved to ${savePath}`);
                    if (typeof this.state.onSaveCallback === 'function') {
                        await this.state.onSaveCallback(savePath);
                    }
                } else {
                    EditorUI.updateStatusMessage(`Error: ${saveResult.error || "Failed to save file system."}`);
                }
            },
            onExitRequest: this.exit.bind(this),
            onTogglePreview: () => {
                const modes = ['split', 'edit', 'preview'];
                this.state.viewMode = modes[(modes.indexOf(this.state.viewMode) + 1) % modes.length];
                EditorUI.setViewMode(this.state.viewMode, this.state.fileMode, this.state.currentContent);
            },
            onUndo: () => {
                if (this.state.undoStack.length > 1) {
                    this.state.redoStack.push(this.state.undoStack.pop());
                    this.state.currentContent = this.state.undoStack[this.state.undoStack.length - 1];
                    EditorUI.setContent(this.state.currentContent);
                }
            },
            onRedo: () => {
                if (this.state.redoStack.length > 0) {
                    const nextState = this.state.redoStack.pop();
                    this.state.undoStack.push(nextState);
                    this.state.currentContent = nextState;
                    EditorUI.setContent(this.state.currentContent);
                }
            },
            onWordWrapToggle: () => {
                this.state.wordWrap = !this.state.wordWrap;
                StorageManager.saveItem(Config.STORAGE_KEYS.EDITOR_WORD_WRAP_ENABLED, this.state.wordWrap);
                EditorUI.setWordWrap(this.state.wordWrap);
            }
        };
    }
}

const Editor = new EditorManager();