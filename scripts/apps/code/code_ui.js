// scripts/apps/code/code_manager.js

class CodeManager extends App {
    constructor() {
        super();
        this.state = {};
        this.uiElements = {};
        this.debouncedHighlight = Utils.debounce(this._highlight.bind(this), 100);
        this.callbacks = this._createCallbacks();
    }

    // Highlighter logic, now part of the class
    _jsHighlighter(text) {
        const escapedText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return escapedText
            .replace(/(\/\*[\s\S]*?\*\/|\/\/.+)/g, '<em>$1</em>') // Comments
            .replace(/\b(new|if|else|do|while|switch|for|in|of|continue|break|return|typeof|function|var|const|let|async|await|class|extends|true|false|null)(?=\w)/g, '<strong>$1</strong>') // Keywords
            .replace(/(".*?"|'.*?'|`.*?`)/g, '<strong><em>$1</em></strong>') // Strings
            .replace(/\b(\d+)/g, '<em><strong>$1</strong></em>'); // Numbers
    }

    _highlight(content) {
        if (this.uiElements.highlighter) {
            this.uiElements.highlighter.innerHTML = this._jsHighlighter(content);
        }
    }

    enter(appLayer, options = {}) {
        if (this.isActive) return;

        this.state = {
            isActive: true,
            filePath: options.filePath,
            originalContent: options.fileContent || "",
        };

        this.container = CodeUI.buildAndShow({
            filePath: options.filePath,
            fileContent: options.fileContent || ""
        }, (textarea, highlighter) => {
            this.uiElements.textarea = textarea;
            this.uiElements.highlighter = highlighter;
            this.callbacks.onInput(options.fileContent || "");
        }, this.callbacks);

        appLayer.appendChild(this.container);
        this.isActive = true;
    }

    exit() {
        if (!this.isActive) return;
        this._performExit();
    }

    _performExit() {
        CodeUI.hideAndReset();
        AppLayerManager.hide(this);
        this.isActive = false;
        this.state = {};
        this.uiElements = {};
    }

    _createCallbacks() {
        return {
            onSave: async (filePath, content) => {
                if (!filePath || !filePath.trim()) {
                    await OutputManager.appendToOutput("Error: Filename cannot be empty.", { typeClass: 'text-error' });
                    return;
                }
                const currentUser = UserManager.getCurrentUser().name;
                const primaryGroup = UserManager.getPrimaryGroupForUser(currentUser);
                const saveResult = await FileSystemManager.createOrUpdateFile(filePath, content, {
                    currentUser,
                    primaryGroup
                });

                if (saveResult.success && await FileSystemManager.save()) {
                    this._performExit();
                } else {
                    await OutputManager.appendToOutput(`Error saving file: ${saveResult.error || "Filesystem error"}`, { typeClass: 'text-error' });
                }
            },
            onExit: this.exit.bind(this),
            onTab: (textarea) => {
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const value = textarea.value;
                textarea.value = value.substring(0, start) + '  ' + value.substring(end);
                textarea.selectionStart = textarea.selectionEnd = start + 2;
                this.callbacks.onInput(textarea.value);
            },
            onInput: (content) => {
                this.debouncedHighlight(content);
            },
            onPaste: (textarea, pastedText) => {
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const value = textarea.value;
                textarea.value = value.substring(0, start) + pastedText + value.substring(end);
                textarea.selectionStart = textarea.selectionEnd = start + pastedText.length;
                this.callbacks.onInput(textarea.value);
            }
        };
    }
}

// Instantiate the singleton that the 'code' command needs
const Code = new CodeManager();