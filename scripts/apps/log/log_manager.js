// scripts/apps/log/log_manager.js

class LogManager extends App {
    constructor() {
        super();
        this.state = {};
        this.callbacks = this._createCallbacks();
        this.LOG_DIR = "/home/Guest/.journal";
    }

    async enter(appLayer) {
        if (this.isActive) return;

        this.isActive = true;
        this.state = {
            allEntries: [],
            filteredEntries: [],
            selectedPath: null,
            isDirty: false,
        };

        this.container = LogUI.buildLayout(this.callbacks);
        appLayer.appendChild(this.container);

        await this._ensureLogDir();
        await this._loadEntries();

        LogUI.renderEntries(this.state.filteredEntries, null);
        LogUI.renderContent(null);
    }

    exit() {
        if (!this.isActive) return;

        const performExit = () => {
            LogUI.reset();
            AppLayerManager.hide(this);
            this.isActive = false;
            this.state = {};
        };

        if (this.state.isDirty) {
            ModalManager.request({
                context: 'graphical',
                type: 'confirm',
                messageLines: ["You have unsaved changes that will be lost.", "Exit without saving?"],
                onConfirm: performExit,
                onCancel: () => {}
            });
        } else {
            performExit();
        }
    }

    async handleKeyDown(event) {
        if (!this.isActive) return;
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault();
            await this.callbacks.onSave();
        } else if (event.key === 'Escape') {
            this.exit();
        }
    }

    async quickAdd(entryText, currentUser) {
        await this._ensureLogDir();
        const timestamp = new Date().toISOString();
        const filename = `${timestamp.replace(/[:.]/g, '-')}.md`;
        const fullPath = `${this.LOG_DIR}/${filename}`;

        const saveResult = await FileSystemManager.createOrUpdateFile(fullPath, entryText, {
            currentUser: currentUser,
            primaryGroup: UserManager.getPrimaryGroupForUser(currentUser)
        });

        if (!saveResult.success) {
            return {success: false, error: saveResult.error};
        }
        await FileSystemManager.save();
        return {success: true, message: `Log entry saved to ${fullPath}`, path: fullPath};
    }

    _createCallbacks() {
        return {
            onExit: this.exit.bind(this),
            onSearch: (query) => {
                this.state.filteredEntries = this.state.allEntries.filter(e => e.content.toLowerCase().includes(query.toLowerCase()));
                LogUI.renderEntries(this.state.filteredEntries, this.state.selectedPath);
            },
            onSelect: async (path) => {
                if (this.state.isDirty) {
                    const confirmed = await new Promise(r => ModalManager.request({
                        context: 'graphical',
                        type: 'confirm',
                        messageLines: ["You have unsaved changes. Discard them?"],
                        onConfirm: () => r(true), onCancel: () => r(false)
                    }));
                    if (!confirmed) return;
                }
                this.state.selectedPath = path;
                const selectedEntry = this.state.allEntries.find(e => e.path === path);
                LogUI.renderContent(selectedEntry);
                LogUI.renderEntries(this.state.filteredEntries, this.state.selectedPath);
                this.state.isDirty = false;
                LogUI.updateSaveButton(false);
            },
            onNew: async () => {
                const title = await new Promise(resolve => ModalManager.request({
                    context: 'graphical',
                    type: 'input',
                    messageLines: ["Enter New Log Title:"],
                    placeholder: "A new beginning...",
                    onConfirm: (value) => resolve(value),
                    onCancel: () => resolve(null)
                }));
                if (title) {
                    const newContent = `# ${title}`;
                    const result = await this.quickAdd(newContent, UserManager.getCurrentUser().name);
                    if (result.success) {
                        await this._loadEntries();
                        await this.callbacks.onSelect(result.path);
                    }
                }
            },
            onSave: async () => {
                if (!this.state.selectedPath || !this.state.isDirty) return;
                const newContent = LogUI.getContent();
                const result = await this._saveEntry(this.state.selectedPath, newContent);
                if (result.success) {
                    const entryIndex = this.state.allEntries.findIndex(e => e.path === this.state.selectedPath);
                    if (entryIndex > -1) {
                        this.state.allEntries[entryIndex].content = newContent;
                    }
                    this.state.isDirty = false;
                    LogUI.updateSaveButton(false);
                } else {
                    alert(`Error saving: ${result.error}`);
                }
            },
            onContentChange: (newContent) => {
                const selectedEntry = this.state.allEntries.find(e => e.path === this.state.selectedPath);
                if (!selectedEntry) return;
                this.state.isDirty = newContent !== selectedEntry.content;
                LogUI.updateSaveButton(this.state.isDirty);
            }
        };
    }

    async _saveEntry(path, content) {
        const result = await FileSystemManager.createOrUpdateFile(path, content, {
            currentUser: UserManager.getCurrentUser().name,
            primaryGroup: UserManager.getPrimaryGroupForUser(UserManager.getCurrentUser().name)
        });
        if (result.success) await FileSystemManager.save();
        return result;
    }

    async _ensureLogDir() {
        const pathInfo = FileSystemManager.validatePath(this.LOG_DIR, {allowMissing: true});
        if (!pathInfo.node) {
            await CommandExecutor.processSingleCommand(`mkdir -p ${this.LOG_DIR}`, { isInteractive: false });
        }
    }

    async _loadEntries() {
        this.state.allEntries = [];
        const dirNode = FileSystemManager.getNodeByPath(this.LOG_DIR);
        if (dirNode && dirNode.children) {
            for (const filename in dirNode.children) {
                if (filename.endsWith('.md')) {
                    const fileNode = dirNode.children[filename];
                    const rawTimestamp = filename.replace('.md', '');
                    const isoString = rawTimestamp.substring(0, 10) + 'T' +
                        rawTimestamp.substring(11, 13) + ':' +
                        rawTimestamp.substring(14, 16) + ':' +
                        rawTimestamp.substring(17, 19) + '.' +
                        rawTimestamp.substring(20, 23) + 'Z';
                    this.state.allEntries.push({
                        timestamp: new Date(isoString),
                        content: fileNode.content || '',
                        path: `${this.LOG_DIR}/${filename}`
                    });
                }
            }
        }
        this.state.allEntries.sort((a, b) => b.timestamp - a.timestamp);
        this.state.filteredEntries = [...this.state.allEntries];
    }
}

const Log = new LogManager();