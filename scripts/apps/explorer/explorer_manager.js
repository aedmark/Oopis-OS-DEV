// In scripts/apps/explorer/explorer_manager.js

class ExplorerManager extends App {
    constructor() {
        super(); // Call the App constructor
        this.currentPath = '/';
        this.expandedPaths = new Set(['/']);
        this.moveOperation = {
            active: false,
            sourcePath: null
        };

        // Binding callbacks to 'this' context
        this.callbacks = {
            onExit: this.exit.bind(this),
            onTreeItemSelect: (path) => {
                if (this.moveOperation.active) {
                    this.callbacks.onMove(this.moveOperation.sourcePath, path);
                    return;
                }
                if (path !== '/') {
                    this.expandedPaths.has(path) ? this.expandedPaths.delete(path) : this.expandedPaths.add(path);
                }
                this._updateView(path);
            },
            onMainItemActivate: async (path, type) => {
                if (type === 'directory') {
                    this.expandedPaths.add(path);
                    this._updateView(path);
                } else {
                    this.exit();
                    await new Promise(resolve => setTimeout(resolve, 50));
                    await CommandExecutor.processSingleCommand(`edit "${path}"`, {
                        isInteractive: true
                    });
                }
            },
            onCreateFile: (path) => {
                ModalManager.request({
                    context: 'graphical-input',
                    messageLines: ["Enter New File Name:"],
                    placeholder: "new_file.txt",
                    onConfirm: async (name) => {
                        if (name) {
                            const newFilePath = `${path}/${name}`;
                            const result = await FileSystemManager.createOrUpdateFile(newFilePath, "", {
                                currentUser: UserManager.getCurrentUser().name,
                                primaryGroup: UserManager.getPrimaryGroupForUser(UserManager.getCurrentUser().name)
                            });
                            if (result.success) {
                                await FileSystemManager.save();
                                this._updateView(this.currentPath);
                            } else {
                                alert(`Error: ${result.error}`);
                            }
                        }
                    },
                    onCancel: () => {}
                });
            },
            onCreateDirectory: (path) => {
                ModalManager.request({
                    context: 'graphical-input',
                    messageLines: ["Enter New Directory Name:"],
                    placeholder: "new_directory",
                    onConfirm: async (name) => {
                        if (name) {
                            await CommandExecutor.processSingleCommand(`mkdir "${path}/${name}"`, {isInteractive: false});
                            this._updateView(this.currentPath);
                        }
                    },
                    onCancel: () => {}
                });
            },
            onRename: (path, oldName) => {
                ModalManager.request({
                    context: 'graphical-input',
                    messageLines: [`Rename "${oldName}":`],
                    placeholder: oldName,
                    onConfirm: async (newName) => {
                        if (newName && newName !== oldName) {
                            const newPath = `${this.currentPath}/${newName}`;
                            await CommandExecutor.processSingleCommand(`mv "${path}" "${newPath}"`, {isInteractive: false});
                            this._updateView(this.currentPath);
                        }
                    },
                    onCancel: () => {}
                });
            },
            onDelete: (path, name) => {
                ModalManager.request({
                    context: 'graphical',
                    messageLines: [`Are you sure you want to delete "${name}"?`, "This action cannot be undone."],
                    onConfirm: async () => {
                        await CommandExecutor.processSingleCommand(`rm -r "${path}"`, {
                            isInteractive: false
                        });
                        this._updateView(this.currentPath);
                    },
                    onCancel: () => {}
                });
            },
            onMove: (sourcePath, destPath) => {
                if (!this.moveOperation.active) {
                    this.moveOperation.active = true;
                    this.moveOperation.sourcePath = sourcePath;
                    ExplorerUI.setMoveCursor(true);
                    ExplorerUI.highlightItem(sourcePath, true);
                    return;
                }
                CommandExecutor.processSingleCommand(`mv "${sourcePath}" "${destPath}/"`, {
                    isInteractive: false
                }).then(() => {
                    this._resetMoveOperation();
                    this._updateView(this.currentPath);
                });
            },
            onCancelMove: () => {
                this._resetMoveOperation();
                this._updateView(this.currentPath);
            }
        };
    }

    enter(appLayer, options = {}) {
        const startPath = options.startPath || FileSystemManager.getCurrentPath();
        const pathValidation = FileSystemManager.validatePath(startPath, {
            allowMissing: false
        });

        if (pathValidation.error) {
            OutputManager.appendToOutput(`explore: ${pathValidation.error}`, {
                typeClass: 'text-error'
            });
            return;
        }

        let initialPath = startPath;
        if (pathValidation.node.type !== 'directory') {
            initialPath = initialPath.substring(0, initialPath.lastIndexOf('/')) || '/';
        }

        this.isActive = true;
        this.expandedPaths = new Set(['/']);
        let parent = initialPath;
        while (parent && parent !== '/') {
            this.expandedPaths.add(parent);
            parent = parent.substring(0, parent.lastIndexOf('/')) || (parent.includes('/') ? '/' : null);
        }

        this.container = ExplorerUI.buildLayout(this.callbacks);
        this.container.setAttribute('tabindex', '-1');
        appLayer.appendChild(this.container);

        this._updateView(initialPath);
    }

    exit() {
        if (!this.isActive) return;

        if (this.moveOperation.active) {
            this._resetMoveOperation();
        }

        ExplorerUI.reset();
        AppLayerManager.hide(this);
    }

    handleKeyDown(event) {
        if (event.key === 'Escape') {
            if (this.moveOperation.active) {
                this.callbacks.onCancelMove();
            } else {
                this.exit();
            }
        }
    }

    _resetMoveOperation() {
        this.moveOperation.active = false;
        this.moveOperation.sourcePath = null;
        ExplorerUI.setMoveCursor(false);
    }

    _updateView(path) {
        this.currentPath = path;
        const currentUser = UserManager.getCurrentUser().name;
        const rootNode = FileSystemManager.getNodeByPath('/');
        if (!rootNode) {
            console.error("CRITICAL: Root node not found in ExplorerManager.");
            this.exit();
            return;
        }

        ExplorerUI.renderTree(rootNode, this.currentPath, this.expandedPaths);

        const mainNode = FileSystemManager.getNodeByPath(this.currentPath);
        if (mainNode && FileSystemManager.hasPermission(mainNode, currentUser, 'read')) {
            const items = Object.keys(mainNode.children || {}).sort((a, b) => {
                const nodeA = mainNode.children[a];
                const nodeB = mainNode.children[b];
                if (nodeA.type === 'directory' && nodeB.type !== 'directory') return -1;
                if (nodeA.type !== 'directory' && nodeB.type === 'directory') return 1;
                return a.localeCompare(b);
            }).map(name => {
                const childNode = mainNode.children[name];
                return {
                    name,
                    path: `${this.currentPath === '/' ? '' : this.currentPath}/${name}`,
                    type: childNode.type,
                    node: childNode,
                    size: FileSystemManager.calculateNodeSize(childNode)
                };
            });
            ExplorerUI.renderMainPane(items, this.currentPath);
            ExplorerUI.updateStatusBar(this.currentPath, items.length);
        } else {
            ExplorerUI.renderMainPane([], this.currentPath);
            ExplorerUI.updateStatusBar(this.currentPath, 'Permission Denied');
        }
    }
}

// Instantiate a single instance of the manager.
const Explorer = new ExplorerManager();