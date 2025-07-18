// scripts/fs_manager.js
const FileSystemManager = (() => {
    "use strict";

    let fsData = {};
    let currentPath = Config.FILESYSTEM.ROOT_PATH;

    const OOPIS_CONF_CONTENT = `TERMINAL.PROMPT_CHAR=>
OS.DEFAULT_HOST_NAME=OopisOS
MESSAGES.WELCOME_PREFIX=Welcome,
MESSAGES.WELCOME_SUFFIX=!`;

    async function initialize(guestUsername) {
        const nowISO = new Date().toISOString();
        fsData = {
            [Config.FILESYSTEM.ROOT_PATH]: {
                type: Config.FILESYSTEM.DEFAULT_DIRECTORY_TYPE,
                children: {
                    home: {
                        type: Config.FILESYSTEM.DEFAULT_DIRECTORY_TYPE,
                        children: {},
                        owner: "root",
                        group: "root",
                        mode: 0o755,
                        mtime: nowISO,
                    },
                    etc: {
                        type: Config.FILESYSTEM.DEFAULT_DIRECTORY_TYPE,
                        children: {},
                        owner: "root",
                        group: "root",
                        mode: 0o755,
                        mtime: nowISO,
                    },
                },
                owner: "root",
                group: "root",
                mode: 0o755,
                mtime: nowISO,
            },
        };
        await createUserHomeDirectory("root");
        await createUserHomeDirectory(guestUsername);
        const rootNode = fsData[Config.FILESYSTEM.ROOT_PATH];
        if (rootNode) {
            rootNode.children["etc"] = {
                type: Config.FILESYSTEM.DEFAULT_DIRECTORY_TYPE,
                children: {},
                owner: "root",
                group: "root",
                mode: 0o755,
                mtime: nowISO,
            };
            rootNode.mtime = nowISO;

            const etcNode = rootNode.children["etc"];
            if (etcNode) {
                etcNode.children["oopis.conf"] = {
                    type: Config.FILESYSTEM.DEFAULT_FILE_TYPE,
                    content: OOPIS_CONF_CONTENT,
                    owner: "root",
                    group: "root",
                    mode: 0o644,
                    mtime: nowISO,
                };
                etcNode.mtime = nowISO;
            } else {
                console.error("FileSystemManager: Failed to create /etc directory.");
            }
        } else {
            console.error(
                "FileSystemManager: Root node not found during initialization. Critical error."
            );
        }
    }

    async function createUserHomeDirectory(username) {
        if (!fsData["/"]?.children?.home) {
            console.error(
                "FileSystemManager: Cannot create user home directory, /home does not exist."
            );
            return;
        }
        const homeDirNode = fsData["/"].children.home;
        if (!homeDirNode.children[username]) {
            homeDirNode.children[username] = {
                type: Config.FILESYSTEM.DEFAULT_DIRECTORY_TYPE,
                children: {},
                owner: username,
                group: username,
                mode: 0o700,
                mtime: new Date().toISOString(),
            };
            homeDirNode.mtime = new Date().toISOString();
        }
    }

    async function save() {
        let db;
        try {
            db = IndexedDBManager.getDbInstance();
        } catch (e) {
            return ErrorHandler.createError("File system storage not available for saving.");
        }

        return new Promise((resolve) => {
            const transaction = db.transaction(
                [Config.DATABASE.FS_STORE_NAME],
                "readwrite"
            );
            const store = transaction.objectStore(Config.DATABASE.FS_STORE_NAME);
            const request = store.put({
                id: Config.DATABASE.UNIFIED_FS_KEY,
                data: Utils.deepCopyNode(fsData),
            });
            request.onsuccess = () => resolve(ErrorHandler.createSuccess());
            request.onerror = (event) => {
                resolve(ErrorHandler.createError(`OopisOs failed to save the file system: ${event.target.error}`));
            };
        });
    }


    async function load() {
        let db;
        try {
            db = IndexedDBManager.getDbInstance();
        } catch (e) {
            await initialize(Config.USER.DEFAULT_NAME);
            return ErrorHandler.createError(Config.INTERNAL_ERRORS.DB_NOT_INITIALIZED_FS_LOAD);
        }
        return new Promise(async (resolve) => {
            const transaction = db.transaction(
                [Config.DATABASE.FS_STORE_NAME],
                "readonly"
            );
            const store = transaction.objectStore(Config.DATABASE.FS_STORE_NAME);
            const request = store.get(Config.DATABASE.UNIFIED_FS_KEY);
            request.onsuccess = async (event) => {
                const result = event.target.result;
                if (result && result.data) {
                    fsData = result.data;
                } else {
                    await OutputManager.appendToOutput(
                        "No file system found. Initializing new one.", {
                            typeClass: Config.CSS_CLASSES.CONSOLE_LOG_MSG,
                        }
                    );
                    await initialize(Config.USER.DEFAULT_NAME);
                    await save();
                }
                resolve(ErrorHandler.createSuccess());
            };
            request.onerror = async (event) => {
                await initialize(Config.USER.DEFAULT_NAME);
                resolve(ErrorHandler.createError(event.target.error));
            };
        });
    }

    async function clearAllFS() {
        let db;
        try {
            db = IndexedDBManager.getDbInstance();
        } catch (e) {
            return ErrorHandler.createError("File system storage not available for clearing all data.");
        }
        return new Promise((resolve) => {
            const transaction = db.transaction(
                [Config.DATABASE.FS_STORE_NAME],
                "readwrite"
            );
            const store = transaction.objectStore(Config.DATABASE.FS_STORE_NAME);
            const request = store.clear();
            request.onsuccess = () => resolve(ErrorHandler.createSuccess());
            request.onerror = (event) => {
                console.error("Error clearing FileSystemsStore:", event.target.error);
                resolve(ErrorHandler.createError(`Could not clear all user file systems: ${event.target.error}`));
            };
        });
    }


    function getCurrentPath() {
        return currentPath;
    }

    function setCurrentPath(path) {
        currentPath = path;
    }

    function getFsData() {
        return fsData;
    }

    function setFsData(newData) {
        fsData = newData;
    }

    function getAbsolutePath(targetPath, basePath = currentPath) {
        if (!targetPath) targetPath = Config.FILESYSTEM.CURRENT_DIR_SYMBOL;
        let effectiveBasePath = basePath;
        if (targetPath.startsWith(Config.FILESYSTEM.PATH_SEPARATOR))
            effectiveBasePath = Config.FILESYSTEM.ROOT_PATH;
        const baseSegments =
            effectiveBasePath === Config.FILESYSTEM.ROOT_PATH ?
                [] :
                effectiveBasePath
                    .substring(1)
                    .split(Config.FILESYSTEM.PATH_SEPARATOR)
                    .filter((s) => s && s !== Config.FILESYSTEM.CURRENT_DIR_SYMBOL);
        let resolvedSegments = [...baseSegments];
        const targetSegments = targetPath.split(Config.FILESYSTEM.PATH_SEPARATOR);
        for (const segment of targetSegments) {
            if (segment === "" || segment === Config.FILESYSTEM.CURRENT_DIR_SYMBOL) {
                if (
                    targetPath.startsWith(Config.FILESYSTEM.PATH_SEPARATOR) &&
                    resolvedSegments.length === 0 &&
                    segment === ""
                ) {}
                continue;
            }
            if (segment === Config.FILESYSTEM.PARENT_DIR_SYMBOL) {
                if (resolvedSegments.length > 0) resolvedSegments.pop();
            } else resolvedSegments.push(segment);
        }
        if (resolvedSegments.length === 0) return Config.FILESYSTEM.ROOT_PATH;
        return (
            Config.FILESYSTEM.PATH_SEPARATOR +
            resolvedSegments.join(Config.FILESYSTEM.PATH_SEPARATOR)
        );
    }


    function getNodeByPath(absolutePath) {
        const currentUser = UserManager.getCurrentUser().name;
        if (absolutePath === Config.FILESYSTEM.ROOT_PATH) {
            return fsData[Config.FILESYSTEM.ROOT_PATH];
        }
        const segments = absolutePath
            .substring(1)
            .split(Config.FILESYSTEM.PATH_SEPARATOR)
            .filter((s) => s);
        let currentNode = fsData[Config.FILESYSTEM.ROOT_PATH];
        for (const segment of segments) {
            if (!hasPermission(currentNode, currentUser, "execute")) {
                return null; // Permission denied during traversal
            }
            if (!currentNode.children || !currentNode.children[segment]) {
                return null; // Path does not exist
            }
            currentNode = currentNode.children[segment];
        }
        return currentNode;
    }


    function validatePath(pathArg, options = {}) {
        const {
            expectedType = null, permissions = [], allowMissing = false
        } = options;
        const currentUser = UserManager.getCurrentUser().name;

        // 1. Resolve Path
        const resolvedPath = getAbsolutePath(pathArg);

        // 2. Retrieve Node
        const node = getNodeByPath(resolvedPath);

        // 3. Validate Node Existence
        if (!node) {
            if (allowMissing) {
                return ErrorHandler.createSuccess({ node: null, resolvedPath });
            }
            return ErrorHandler.createError(`${pathArg}: No such file or directory`);
        }

        // 4. Validate Expected Type
        if (expectedType && node.type !== expectedType) {
            if (expectedType === 'file') {
                return ErrorHandler.createError(`${pathArg}: Is not a file`);
            }
            if (expectedType === 'directory') {
                return ErrorHandler.createError(`${pathArg}: Is not a directory`);
            }
        }

        // 5. Validate Permissions
        for (const perm of permissions) {
            if (!hasPermission(node, currentUser, perm)) {
                return ErrorHandler.createError(`${pathArg}: Permission denied`);
            }
        }

        // 6. Success
        return ErrorHandler.createSuccess({ node, resolvedPath });
    }

    function calculateNodeSize(node) {
        if (!node) return 0;
        if (node.type === Config.FILESYSTEM.DEFAULT_FILE_TYPE)
            return (node.content || "").length;
        if (node.type === Config.FILESYSTEM.DEFAULT_DIRECTORY_TYPE) {
            let totalSize = 0;
            for (const childName in node.children)
                totalSize += calculateNodeSize(node.children[childName]);
            return totalSize;
        }
        return 0;
    }

    function _updateNodeAndParentMtime(nodePath, nowISO) {
        if (!nodePath || !nowISO) return;
        const node = getNodeByPath(nodePath);
        if (node) node.mtime = nowISO;
        if (nodePath !== Config.FILESYSTEM.ROOT_PATH) {
            const parentPath =
                nodePath.substring(
                    0,
                    nodePath.lastIndexOf(Config.FILESYSTEM.PATH_SEPARATOR)
                ) || Config.FILESYSTEM.ROOT_PATH;
            const parentNode = getNodeByPath(parentPath);
            if (
                parentNode &&
                parentNode.type === Config.FILESYSTEM.DEFAULT_DIRECTORY_TYPE
            )
                parentNode.mtime = nowISO;
        }
    }

    function createParentDirectoriesIfNeeded(fullPath) {
        const currentUserForCPDIF = UserManager.getCurrentUser().name;
        const nowISO = new Date().toISOString();
        if (fullPath === Config.FILESYSTEM.ROOT_PATH) {
            return ErrorHandler.createError("Cannot create directory structure for root.");
        }
        const lastSlashIndex = fullPath.lastIndexOf(
            Config.FILESYSTEM.PATH_SEPARATOR
        );
        const parentPathForSegments =
            lastSlashIndex === 0 ?
                Config.FILESYSTEM.ROOT_PATH :
                fullPath.substring(0, lastSlashIndex);
        if (parentPathForSegments === Config.FILESYSTEM.ROOT_PATH) {
            return ErrorHandler.createSuccess(fsData[Config.FILESYSTEM.ROOT_PATH]);
        }
        const segmentsToCreate = parentPathForSegments
            .substring(1)
            .split(Config.FILESYSTEM.PATH_SEPARATOR)
            .filter((s) => s);
        let currentParentNode = fsData[Config.FILESYSTEM.ROOT_PATH];
        let currentProcessedPath = Config.FILESYSTEM.ROOT_PATH;
        if (
            !currentParentNode ||
            typeof currentParentNode.owner === "undefined" ||
            typeof currentParentNode.mode === "undefined"
        ) {
            return ErrorHandler.createError("Internal error: Root FS node is malformed.");
        }
        for (const segment of segmentsToCreate) {
            if (
                !currentParentNode.children ||
                typeof currentParentNode.children !== "object"
            ) {
                const errorMsg = `Internal error: currentParentNode.children is not an object at path "${currentProcessedPath}" for segment "${segment}". FS may be corrupted.`;
                console.error(errorMsg, currentParentNode);
                return ErrorHandler.createError(errorMsg);
            }
            if (!currentParentNode.children[segment]) {
                if (!hasPermission(currentParentNode, currentUserForCPDIF, "write")) {
                    const errorMsg = `Cannot create directory '${segment}' in '${currentProcessedPath}'${Config.MESSAGES.PERMISSION_DENIED_SUFFIX}`;
                    return ErrorHandler.createError(errorMsg);
                }
                currentParentNode.children[segment] = {
                    type: Config.FILESYSTEM.DEFAULT_DIRECTORY_TYPE,
                    children: {},
                    owner: currentUserForCPDIF,
                    group: currentUserForCPDIF,
                    mode: Config.FILESYSTEM.DEFAULT_DIR_MODE,
                    mtime: nowISO,
                };
                currentParentNode.mtime = nowISO;
            } else if (
                currentParentNode.children[segment].type !==
                Config.FILESYSTEM.DEFAULT_DIRECTORY_TYPE
            ) {
                const errorMsg = `Path component '${getAbsolutePath(
                    segment,
                    currentProcessedPath
                )}' is not a directory.`;
                return ErrorHandler.createError(errorMsg);
            }
            currentParentNode = currentParentNode.children[segment];
            currentProcessedPath = getAbsolutePath(segment, currentProcessedPath);
            if (
                !currentParentNode ||
                typeof currentParentNode.owner === "undefined" ||
                typeof currentParentNode.mode === "undefined"
            )
                return ErrorHandler.createError(`Internal error: Node for "${currentProcessedPath}" became malformed during parent creation.`);
        }
        return ErrorHandler.createSuccess(currentParentNode);
    }

    function hasPermission(node, username, permissionType) {
        if (username === 'root') {
            return true;
        }

        if (!node) {
            return false;
        }

        const permissionMap = {
            'read': 4,
            'write': 2,
            'execute': 1
        };

        const requiredPerm = permissionMap[permissionType];
        if (!requiredPerm) {
            console.error(`Unknown permissionType requested: ${permissionType}`);
            return false;
        }

        const mode = node.mode || 0;
        const ownerPerms = (mode >> 6) & 7;
        const groupPerms = (mode >> 3) & 7;
        const otherPerms = mode & 7;

        if (node.owner === username) {
            return (ownerPerms & requiredPerm) === requiredPerm;
        }

        const userGroups = GroupManager.getGroupsForUser(username);
        if (userGroups.includes(node.group)) {
            return (groupPerms & requiredPerm) === requiredPerm;
        }

        return (otherPerms & requiredPerm) === requiredPerm;
    }

    function formatModeToString(node) {
        if (!node || typeof node.mode !== "number") {
            return "----------";
        }
        const typeChar =
            node.type === Config.FILESYSTEM.DEFAULT_DIRECTORY_TYPE ? "d" : "-";

        const ownerPerms = (node.mode >> 6) & 7;
        const groupPerms = (node.mode >> 3) & 7;
        const otherPerms = node.mode & 7;

        const perm_str = (permValue) => {
            let str = "";
            let p_copy = permValue;

            if (p_copy >= 4) {
                str += "r";
                p_copy -= 4;
            } else {
                str += "-";
            }
            if (p_copy >= 2) {
                str += "w";
                p_copy -= 2;
            } else {
                str += "-";
            }
            if (p_copy >= 1) {
                str += "x";
            } else {
                str += "-";
            }
            return str;
        };

        return (
            typeChar +
            perm_str(ownerPerms) +
            perm_str(groupPerms) +
            perm_str(otherPerms)
        );
    }

    async function deleteNodeRecursive(path, options = {}) {
        const {
            force = false, currentUser
        } = options;
        const pathValidationResult = validatePath(path, {
            disallowRoot: true
        });
        if (!pathValidationResult.success) {
            if (force && !pathValidationResult.data?.node) {
                return ErrorHandler.createSuccess({ messages: [] });
            }
            return ErrorHandler.createError({ messages: [pathValidationResult.error] });
        }
        const { node, resolvedPath } = pathValidationResult.data;
        const parentPath =
            resolvedPath.substring(
                0,
                resolvedPath.lastIndexOf(Config.FILESYSTEM.PATH_SEPARATOR)
            ) || Config.FILESYSTEM.ROOT_PATH;
        const parentNode = getNodeByPath(parentPath);
        const itemName = resolvedPath.substring(
            resolvedPath.lastIndexOf(Config.FILESYSTEM.PATH_SEPARATOR) + 1
        );
        const nowISO = new Date().toISOString();
        let messages = [];
        let anyChangeMade = false;
        if (!parentNode || !hasPermission(parentNode, currentUser, "write")) {
            const permError = `cannot remove '${path}'${Config.MESSAGES.PERMISSION_DENIED_SUFFIX}`;
            return ErrorHandler.createError({ messages: force ? [] : [permError] });
        }
        if (node.type === Config.FILESYSTEM.DEFAULT_DIRECTORY_TYPE) {
            if (node.children && typeof node.children === 'object') {
                const childrenNames = Object.keys(node.children);
                for (const childName of childrenNames) {
                    const childPath = getAbsolutePath(childName, resolvedPath);
                    const result = await deleteNodeRecursive(childPath, options);
                    if (!result.success) {
                        messages.push(...result.error.messages);
                        return ErrorHandler.createError({ messages });
                    }
                }
            } else {
                console.warn(`FileSystemManager: Directory node at '${path}' is missing or has an invalid 'children' property.`, node);
            }
        }
        delete parentNode.children[itemName];
        parentNode.mtime = nowISO;
        anyChangeMade = true;
        return ErrorHandler.createSuccess({ messages, anyChangeMade });
    }

    function _createNewFileNode(name, content, owner, group, mode = null) {
        const nowISO = new Date().toISOString();
        return {
            type: Config.FILESYSTEM.DEFAULT_FILE_TYPE,
            content: content || "",
            owner: owner,
            group: group,
            mode: mode !== null ? mode : Config.FILESYSTEM.DEFAULT_FILE_MODE,
            mtime: nowISO,
        };
    }

    function _calculateTotalSize() {
        if (!fsData || !fsData[Config.FILESYSTEM.ROOT_PATH]) return 0;
        return calculateNodeSize(fsData[Config.FILESYSTEM.ROOT_PATH]);
    }

    function _willOperationExceedQuota(changeInBytes) {
        const currentSize = _calculateTotalSize();
        return (currentSize + changeInBytes) > Config.FILESYSTEM.MAX_VFS_SIZE;
    }

    function _createNewDirectoryNode(owner, group, mode = null) {
        const nowISO = new Date().toISOString();
        return {
            type: Config.FILESYSTEM.DEFAULT_DIRECTORY_TYPE,
            children: {},
            owner: owner,
            group: group,
            mode: mode !== null ? mode : Config.FILESYSTEM.DEFAULT_DIR_MODE,
            mtime: nowISO
        };
    }

    async function createOrUpdateFile(absolutePath, content, context) {
        const {
            currentUser,
            primaryGroup
        } = context;
        const nowISO = new Date().toISOString();

        const existingNode = getNodeByPath(absolutePath);
        const changeInBytes = content.length - (existingNode?.content?.length || 0);

        if (_willOperationExceedQuota(changeInBytes)) {
            return ErrorHandler.createError(`Disk quota exceeded. Cannot write ${content.length} bytes.`);
        }

        if (existingNode) {
            if (existingNode.type !== Config.FILESYSTEM.DEFAULT_FILE_TYPE) {
                return ErrorHandler.createError(`Cannot overwrite non-file '${absolutePath}'`);
            }
            if (!hasPermission(existingNode, currentUser, "write")) {
                return ErrorHandler.createError(`'${absolutePath}': Permission denied`);
            }
            existingNode.content = content;
            existingNode.mtime = nowISO;
        } else {
            const parentDirResult = createParentDirectoriesIfNeeded(absolutePath);
            if (!parentDirResult.success) {
                return parentDirResult;
            }
            const parentNode = parentDirResult.data;

            if (!parentNode) {
                return ErrorHandler.createError(`Could not find or create parent directory for '${absolutePath}'.`);
            }

            if (!hasPermission(parentNode, currentUser, "write")) {
                return ErrorHandler.createError(`Cannot create file in parent directory: Permission denied`);
            }

            if (!parentNode.children || typeof parentNode.children !== 'object') {
                console.error(`FileSystemManager: Corrupted directory node at parent of '${absolutePath}'. Missing 'children' property. Restoring it.`, parentNode);
                parentNode.children = {};
            }

            const fileName = absolutePath.substring(absolutePath.lastIndexOf(Config.FILESYSTEM.PATH_SEPARATOR) + 1);
            parentNode.children[fileName] = _createNewFileNode(fileName, content, currentUser, primaryGroup);
            parentNode.mtime = nowISO;
        }

        return ErrorHandler.createSuccess();
    }


    function canUserModifyNode(node, username) {
        return username === 'root' || node.owner === username;
    }

    /**
     * Validates and prepares a list of source paths and a destination for a file operation.
     * @param {string[]} sourcePathArgs - An array of source paths to process.
     * @param {string} destPathArg - The single destination path.
     * @param {object} options - Configuration for the operation.
     * @param {boolean} [options.isCopy=false] - True if the operation is a copy (checks read permissions on source).
     * @param {boolean} [options.isMove=false] - True if the operation is a move (checks write permissions on source's parent).
     * @returns {object} An object containing either the prepared plan or an error.
     */
    async function prepareFileOperation(sourcePathArgs, destPathArg, options = {}) {
        const { isCopy = false, isMove = false } = options;

        // 1. Destination Analysis
        const destValidationResult = validatePath(destPathArg, { allowMissing: true });
        if (!destValidationResult.success && destValidationResult.data?.node === undefined) {
            return ErrorHandler.createError(`target '${destPathArg}': ${destValidationResult.error}`);
        }
        const isDestADirectory = destValidationResult.data.node && destValidationResult.data.node.type === 'directory';

        // 2. Input Validation
        if (sourcePathArgs.length > 1 && !isDestADirectory) {
            return ErrorHandler.createError(`target '${destPathArg}' is not a directory`);
        }

        // 3. Operation Plan Creation
        const operationsPlan = [];
        for (const sourcePath of sourcePathArgs) {
            // 3.1. Validate Source Path
            let sourceValidationResult;
            if (isCopy) {
                sourceValidationResult = validatePath(sourcePath, { permissions: ['read'] });
            } else { // isMove
                sourceValidationResult = validatePath(sourcePath);
                if (sourceValidationResult.success) {
                    const sourceParentPath = sourceValidationResult.data.resolvedPath.substring(0, sourceValidationResult.data.resolvedPath.lastIndexOf('/')) || '/';
                    const parentValidation = validatePath(sourceParentPath, { permissions: ['write'] });
                    if (!parentValidation.success) {
                        return ErrorHandler.createError(`cannot move '${sourcePath}', permission denied in source directory`);
                    }
                }
            }

            if (!sourceValidationResult.success) {
                return ErrorHandler.createError(`${sourcePath}: ${sourceValidationResult.error}`);
            }

            const { node: sourceNode, resolvedPath: sourceAbsPath } = sourceValidationResult.data;

            // 3.2. Determine Final Destination Path
            let destinationAbsPath;
            let finalName;
            let destinationParentNode;

            if (isDestADirectory) {
                finalName = sourceAbsPath.substring(sourceAbsPath.lastIndexOf('/') + 1);
                destinationAbsPath = getAbsolutePath(finalName, destValidationResult.data.resolvedPath);
                destinationParentNode = destValidationResult.data.node;
            } else {
                finalName = destValidationResult.data.resolvedPath.substring(destValidationResult.data.resolvedPath.lastIndexOf('/') + 1);
                destinationAbsPath = destValidationResult.data.resolvedPath;
                const destParentPath = destinationAbsPath.substring(0, destinationAbsPath.lastIndexOf('/')) || '/';
                const destParentValidation = validatePath(destParentPath, { expectedType: 'directory', permissions: ['write'] });
                if (!destParentValidation.success) {
                    return ErrorHandler.createError(destParentValidation.error);
                }
                destinationParentNode = destParentValidation.data.node;
            }

            // 3.3. Check for Overwrite
            const willOverwrite = !!destinationParentNode.children[finalName];

            // 3.4. Validate Destination Parent Writable (already done for non-directory dest)
            if (isDestADirectory) {
                const parentValidation = validatePath(destValidationResult.data.resolvedPath, { permissions: ['write'] });
                if (!parentValidation.success) {
                    return ErrorHandler.createError(parentValidation.error);
                }
            }

            // 3.5. Critical check for move
            if (isMove) {
                if (sourceAbsPath === '/') {
                    return ErrorHandler.createError("cannot move root directory");
                }
                if (sourceNode.type === 'directory' && destinationAbsPath.startsWith(sourceAbsPath + '/')) {
                    return ErrorHandler.createError(`cannot move '${sourcePath}' to a subdirectory of itself, '${destinationAbsPath}'`);
                }
            }

            // 3.6. Push to Plan
            operationsPlan.push({
                sourceNode,
                sourceAbsPath,
                destinationAbsPath,
                destinationParentNode,
                finalName,
                willOverwrite
            });
        }

        // 4. Return Plan
        return ErrorHandler.createSuccess(operationsPlan);
    }

    return {
        createUserHomeDirectory,
        save,
        load,
        clearAllFS,
        getCurrentPath,
        setCurrentPath,
        getFsData,
        setFsData,
        getAbsolutePath,
        getNodeByPath,
        createParentDirectoriesIfNeeded,
        calculateNodeSize,
        validatePath,
        hasPermission,
        formatModeToString,
        _updateNodeAndParentMtime,
        _createNewFileNode,
        _createNewDirectoryNode,
        deleteNodeRecursive,
        createOrUpdateFile,
        canUserModifyNode,
        prepareFileOperation
    };
})();