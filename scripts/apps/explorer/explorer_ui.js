const ExplorerUI = (() => {
    "use strict";
    let elements = {};
    let callbacks = {};
    let activeContextMenu = null;

    function buildLayout(cb) {
        callbacks = cb;

        const template = document.getElementById('explorer-template');
        const clone = template.content.cloneNode(true);
        elements.container = clone.querySelector('#explorer-container');

        elements.treePane = elements.container.querySelector('#explorer-tree-pane');
        elements.mainPane = elements.container.querySelector('#explorer-main-pane');
        elements.statusBar = elements.container.querySelector('#explorer-status-bar');
        elements.exitBtn = elements.container.querySelector('#explorer-exit-btn');

        elements.exitBtn.addEventListener('click', () => callbacks.onExit());

        elements.mainPane.addEventListener('contextmenu', (e) => {
            e.preventDefault();

            const listItem = e.target.closest('li[data-path]');

            if (listItem) {
                const path = listItem.getAttribute('data-path');
                const name = listItem.querySelector('.explorer-item-name').textContent;
                const menuItems = [
                    { label: 'Rename...', callback: () => callbacks.onRename(path, name) },
                    { label: 'Delete', callback: () => callbacks.onDelete(path, name) },
                    { label: 'Move', callback: () => callbacks.onMove(path, null) }
                ];
                _createContextMenu(menuItems, e.clientX, e.clientY);
            } else {
                const currentPath = elements.statusBar.textContent.split('  |')[0].replace('Path: ', '');
                const menuItems = [
                    { label: 'New File...', callback: () => callbacks.onCreateFile(currentPath) },
                    { label: 'New Directory...', callback: () => callbacks.onCreateDirectory(currentPath) }
                ];
                _createContextMenu(menuItems, e.clientX, e.clientY);
            }
        });

        document.addEventListener('click', (e) => {
            if (activeContextMenu && !activeContextMenu.contains(e.target)) {
                _removeContextMenu();
            }
        }, true);

        return elements.container;
    }

    function _removeContextMenu() {
        if (activeContextMenu) {
            activeContextMenu.remove();
            activeContextMenu = null;
        }
    }

    function _createContextMenu(items, x, y) {
        _removeContextMenu();

        const menu = Utils.createElement('div', { className: 'context-menu' });
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        menu.addEventListener('click', e => e.stopPropagation());

        items.forEach(item => {
            if (item.separator) {
                menu.appendChild(Utils.createElement('div', { className: 'context-menu-separator' }));
                return;
            }
            const menuItem = Utils.createElement('div', { className: 'context-menu-item', textContent: item.label });
            menuItem.addEventListener('click', () => {
                item.callback();
                _removeContextMenu();
            });
            menu.appendChild(menuItem);
        });

        document.body.appendChild(menu);
        activeContextMenu = menu;
    }

    function renderTree(treeData, selectedPath, expandedPaths) {
        if (!elements.treePane) return;
        const treeRoot = Utils.createElement('ul', { className: 'explorer-tree' });

        function createTreeItem(node, path, name) {
            const hasChildren = node.children && Object.keys(node.children).filter(childName => node.children[childName].type === 'directory').length > 0;
            const canRead = FileSystemManager.hasPermission(node, UserManager.getCurrentUser().name, 'read');

            const summary = Utils.createElement('summary');
            const folderIcon = Utils.createElement('span', { className: 'mr-1', textContent: '📁' });
            const nameSpan = Utils.createElement('span', { textContent: name });
            summary.append(folderIcon, nameSpan);

            if (!canRead) {
                summary.classList.add('opacity-50', 'italic');
            }

            const details = Utils.createElement('details', { className: 'explorer-tree-item', 'data-path': path }, summary);
            if (expandedPaths.has(path)) {
                details.open = true;
            }

            if (canRead && hasChildren) {
                const childList = Utils.createElement('ul', { className: 'pl-4' });
                const sortedChildNames = Object.keys(node.children).sort();

                for (const childName of sortedChildNames) {
                    const childNode = node.children[childName];
                    if (childNode.type === 'directory') {
                        childList.appendChild(createTreeItem(childNode, `${path === '/' ? '' : path}/${childName}`, childName));
                    }
                }
                details.appendChild(childList);
            }

            summary.addEventListener('click', (e) => {
                e.preventDefault();
                if (canRead) {
                    callbacks.onTreeItemSelect(path);
                }
            });

            if (path === selectedPath) {
                summary.classList.add('selected');
            }

            return details;
        }

        treeRoot.appendChild(createTreeItem(treeData, '/', '/'));
        elements.treePane.innerHTML = '';
        elements.treePane.appendChild(treeRoot);
    }

    function renderMainPane(items, currentPath) {
        if (!elements.mainPane) return;
        elements.mainPane.innerHTML = '';

        elements.mainPane.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const menuItems = [
                { label: 'New File...', callback: () => callbacks.onCreateFile(currentPath) },
                { label: 'New Directory...', callback: () => callbacks.onCreateDirectory(currentPath) }
            ];
            _createContextMenu(menuItems, e.clientX, e.clientY);
        });

        if (items.length === 0) {
            elements.mainPane.appendChild(Utils.createElement('div', {
                className: 'p-4 text-zinc-500',
                textContent: '(Directory is empty)'
            }));
            return;
        }

        const list = Utils.createElement('ul', { className: 'explorer-file-list' });
        items.forEach(item => {
            const icon = Utils.createElement('span', {
                className: 'mr-2 w-4 inline-block',
                textContent: item.type === 'directory' ? '📁' : '📄'
            });
            const name = Utils.createElement('span', { className: 'explorer-item-name', textContent: item.name });
            const perms = Utils.createElement('span', { className: 'explorer-item-perms', textContent: FileSystemManager.formatModeToString(item.node) });
            const size = Utils.createElement('span', {
                className: 'explorer-item-size',
                textContent: item.type === 'file' ? Utils.formatBytes(item.size) : ''
            });

            const li = Utils.createElement('li', {
                'data-path': item.path,
                title: item.path
            }, icon, name, perms, size);

            li.addEventListener('dblclick', () => callbacks.onMainItemActivate(item.path, item.type));

            li.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const menuItems = [
                    { label: 'Rename...', callback: () => callbacks.onRename(item.path, item.name) },
                    { label: 'Delete', callback: () => callbacks.onDelete(item.path, item.name) },
                    { label: 'Move', callback: () => callbacks.onMove(item.path, null) }
                ];
                _createContextMenu(menuItems, e.clientX, e.clientY);
            });

            list.appendChild(li);
        });
        elements.mainPane.appendChild(list);
    }

    function updateStatusBar(path, itemCount) {
        if (!elements.statusBar) return;
        elements.statusBar.textContent = `Path: ${path}  |  Items: ${itemCount}`;
    }

    function setMoveCursor(isMoving) {
        if (elements.container) {
            elements.container.style.cursor = isMoving ? 'move' : 'default';
        }
    }

    function highlightItem(path, isHighlighted) {
        const allItems = elements.mainPane.querySelectorAll('li');
        allItems.forEach(li => {
            li.style.backgroundColor = '';
            li.style.color = '';
        });

        if (isHighlighted) {
            const itemElement = elements.mainPane.querySelector(`[data-path="${path}"]`);
            if (itemElement) {
                itemElement.style.backgroundColor = 'var(--color-info)';
                itemElement.style.color = 'var(--color-background-darkest)';
            }
        }
    }

    function reset() {
        _removeContextMenu();
        elements = {};
        callbacks = {};
    }

    return { buildLayout, renderTree, renderMainPane, updateStatusBar, setMoveCursor, highlightItem, reset };
})();