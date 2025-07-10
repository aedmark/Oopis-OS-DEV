class EnvironmentManager {
    constructor(initialUser) {
        this.envStack = [{}];
        this.initialize(initialUser);
    }

    _getActiveEnv() {
        return this.envStack[this.envStack.length - 1];
    }

    push() {
        this.envStack.push(JSON.parse(JSON.stringify(this._getActiveEnv())));
    }

    pop() {
        if (this.envStack.length > 1) {
            this.envStack.pop();
        } else {
            console.error("EnvironmentManager: Attempted to pop the base environment stack.");
        }
    }

    initialize(currentUser) {
        const baseEnv = {};
        baseEnv['USER'] = currentUser;
        baseEnv['HOME'] = `/home/${currentUser}`;
        baseEnv['HOST'] = Config.OS.DEFAULT_HOST_NAME;
        baseEnv['PATH'] = '/bin:/usr/bin';
        this.envStack = [baseEnv];
    }

    get(varName) {
        return this._getActiveEnv()[varName] || '';
    }

    set(varName, value) {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(varName)) {
            return { success: false, error: `Invalid variable name: '${varName}'. Must start with a letter or underscore, followed by letters, numbers, or underscores.` };
        }
        this._getActiveEnv()[varName] = value;
        return { success: true };
    }

    unset(varName) {
        delete this._getActiveEnv()[varName];
    }

    getAll() {
        return {...this._getActiveEnv()};
    }

    load(vars) {
        this.envStack[this.envStack.length - 1] = {...(vars || {})};
    }

    clear() {
        this.envStack[this.envStack.length - 1] = {};
    }
}

class HistoryManager {
    constructor() {
        this.commandHistory = [];
        this.historyIndex = 0;
    }

    add(command) {
        const trimmedCommand = command.trim();
        if (
            trimmedCommand &&
            (this.commandHistory.length === 0 ||
                this.commandHistory[this.commandHistory.length - 1] !== trimmedCommand)
        ) {
            this.commandHistory.push(trimmedCommand);
            if (this.commandHistory.length > Config.TERMINAL.MAX_HISTORY_SIZE)
                this.commandHistory.shift();
        }
        this.historyIndex = this.commandHistory.length;
    }

    getPrevious() {
        if (this.commandHistory.length > 0 && this.historyIndex > 0) {
            this.historyIndex--;
            return this.commandHistory[this.historyIndex];
        }
        return null;
    }

    getNext() {
        if (this.historyIndex < this.commandHistory.length - 1) {
            this.historyIndex++;
            return this.commandHistory[this.historyIndex];
        } else if (this.historyIndex >= this.commandHistory.length - 1) {
            this.historyIndex = this.commandHistory.length;
            return "";
        }
        return null;
    }

    resetIndex() {
        this.historyIndex = this.commandHistory.length;
    }

    getFullHistory() {
        return [...this.commandHistory];
    }

    clearHistory() {
        this.commandHistory = [];
        this.historyIndex = 0;
    }

    setHistory(newHistory) {
        this.commandHistory = Array.isArray(newHistory) ? [...newHistory] : [];
        if (this.commandHistory.length > Config.TERMINAL.MAX_HISTORY_SIZE)
            this.commandHistory = this.commandHistory.slice(
                this.commandHistory.length - Config.TERMINAL.MAX_HISTORY_SIZE
            );
        this.historyIndex = this.commandHistory.length;
    }
}


const AliasManager = (() => {
    "use strict";
    let aliases = {};

    function initialize() {
        aliases = StorageManager.loadItem(
            Config.STORAGE_KEYS.ALIAS_DEFINITIONS,
            "Aliases",
            {}
        );
    }

    function _save() {
        StorageManager.saveItem(
            Config.STORAGE_KEYS.ALIAS_DEFINITIONS,
            aliases,
            "Aliases"
        );
    }

    function setAlias(name, value) {
        if (!name || typeof value !== "string") return false;
        aliases[name] = value;
        _save();
        return true;
    }

    function removeAlias(name) {
        if (!aliases[name]) return false;
        delete aliases[name];
        _save();
        return true;
    }

    function getAlias(name) {
        return aliases[name] || null;
    }

    function getAllAliases() {
        return { ...aliases };
    }

    function resolveAlias(commandString, environment) {
        const parts = commandString.split(/\s+/);
        let commandName = parts[0];
        const remainingArgs = parts.slice(1).join(" ");
        const MAX_RECURSION = 10;
        let count = 0;

        while (aliases[commandName] && count < MAX_RECURSION) {
            const aliasValue = aliases[commandName];
            const aliasParts = aliasValue.split(/\s+/);
            commandName = aliasParts[0];
            const aliasArgs = aliasParts.slice(1).join(" ");
            commandString = `${commandName} ${aliasArgs} ${remainingArgs}`.trim();
            count++;
        }
        if (count === MAX_RECURSION) {
            return {
                error: `Alias loop detected for '${parts[0]}'`,
            };
        }
        return {
            newCommand: commandString,
        };
    }
    return {
        initialize,
        setAlias,
        removeAlias,
        getAlias,
        getAllAliases,
        resolveAlias,
    };
})();

const SessionManager = (() => {
    "use strict";
    let userSessionStack = [];

    function initializeStack() {
        userSessionStack = [Config.USER.DEFAULT_NAME];
    }


    function getStack() {
        return userSessionStack;
    }

    function pushUserToStack(username) {
        userSessionStack.push(username);
    }

    function popUserFromStack() {
        if (userSessionStack.length > 1) {
            return userSessionStack.pop();
        }
        return null;
    }

    function getCurrentUserFromStack() {
        return userSessionStack.length > 0
            ? userSessionStack[userSessionStack.length - 1]
            : Config.USER.DEFAULT_NAME;
    }

    function clearUserStack(username) {
        userSessionStack = [username];
    }

    function _getAutomaticSessionStateKey(user) {
        return `${Config.STORAGE_KEYS.USER_TERMINAL_STATE_PREFIX}${user}`;
    }


    function _getManualUserTerminalStateKey(user) {
        const userName =
            typeof user === "object" && user !== null && user.name
                ? user.name
                : String(user);
        return `${Config.STORAGE_KEYS.MANUAL_TERMINAL_STATE_PREFIX}${userName}`;
    }

    function saveAutomaticState(username) {
        // This function will likely need to be adapted to save state for a specific tab/session ID
        // For now, it remains as-is, but we must acknowledge this will change.
        if (!username) {
            console.warn(
                "saveAutomaticState: No username provided. State not saved."
            );
            return;
        }
        const activeSession = TerminalManager.getActiveSession(); // This will be the new way
        if (!activeSession) return;


        const autoState = {
            currentPath: activeSession.currentPath,
            outputHTML: activeSession.domElements.output.innerHTML,
            currentInput: activeSession.domElements.input.textContent,
            commandHistory: activeSession.history.getFullHistory(),
            environmentVariables: activeSession.environment.getAll(),
        };
        StorageManager.saveItem(
            _getAutomaticSessionStateKey(username), // This might need session ID too
            autoState,
            `Auto session for ${username}`
        );
    }

    function loadAutomaticState(username) {
        // This function will also need adaptation for the multi-tab world.
        // It will likely set the state of the *first* tab on initial load.
        if (!username) {
            console.warn(
                "loadAutomaticState: No username provided. Cannot load state."
            );
            return false;
        }
        const autoState = StorageManager.loadItem(
            _getAutomaticSessionStateKey(username),
            `Auto session for ${username}`
        );

        const session = TerminalManager.getActiveSession(); // Will get the initial session
        if (!session) return false;

        if (autoState) {
            session.currentPath = autoState.currentPath || `/home/${username}` || Config.FILESYSTEM.ROOT_PATH;
            session.domElements.output.innerHTML = autoState.outputHTML || "";
            session.domElements.input.textContent = autoState.currentInput || "";
            session.history.setHistory(autoState.commandHistory || []);
            session.environment.load(autoState.environmentVariables);
        } else {
            session.domElements.output.innerHTML = "";
            const homePath = `/home/${username}`;
            session.currentPath = FileSystemManager.getNodeByPath(homePath) ? homePath : Config.FILESYSTEM.ROOT_PATH;
            session.history.clearHistory();
            session.environment.initialize(username);
            OutputManager.appendToOutput(
                `${Config.MESSAGES.WELCOME_PREFIX} ${username}${Config.MESSAGES.WELCOME_SUFFIX}`,
                session.domElements.output
            );
        }
        TerminalManager.updatePrompt();
        session.domElements.output.scrollTop = session.domElements.output.scrollHeight;
        return !!autoState;
    }

    async function saveManualState() {
        const currentUser = UserManager.getCurrentUser();
        const activeSession = TerminalManager.getActiveSession();
        if (!activeSession) return {success: false, error: "No active session to save."};

        const manualStateData = {
            user: currentUser.name,
            osVersion: Config.OS.VERSION,
            timestamp: new Date().toISOString(),
            currentPath: activeSession.currentPath,
            outputHTML: activeSession.domElements.output.innerHTML,
            currentInput: activeSession.domElements.input.textContent,
            fsDataSnapshot: Utils.deepCopyNode(FileSystemManager.getFsData()),
            commandHistory: activeSession.history.getFullHistory(),
        };
        if (
            StorageManager.saveItem(
                _getManualUserTerminalStateKey(currentUser),
                manualStateData,
                `Manual save for ${currentUser.name}`
            )
        )
            return {
                success: true,
                message: `${Config.MESSAGES.SESSION_SAVED_FOR_PREFIX}${currentUser.name}.`,
            };
        else
            return {
                success: false,
                error: "Failed to save session manually.",
            };
    }

    async function loadManualState() {
        const currentUser = UserManager.getCurrentUser();
        const manualStateData = StorageManager.loadItem(
            _getManualUserTerminalStateKey(currentUser),
            `Manual save for ${currentUser.name}`
        );
        if (manualStateData) {
            if (manualStateData.user && manualStateData.user !== currentUser.name) {
                const message = `Warning: Saved state is for user '${manualStateData.user}'. Current user is '${currentUser.name}'. Load aborted. Use 'login ${manualStateData.user}' then 'loadstate'.`;
                await OutputManager.appendToOutput(message, {typeClass: Config.CSS_CLASSES.WARNING_MSG});
                return {
                    success: false,
                    message: `Saved state user mismatch. Current: ${currentUser.name}, Saved: ${manualStateData.user}.`,
                };
            }
            ModalManager.request({
                context: "terminal",
                messageLines: [
                    `Load manually saved state for '${currentUser.name}'? This overwrites current session & filesystem.`,
                ],
                data: {
                    pendingData: manualStateData,
                    userNameToRestoreTo: currentUser.name,
                },
                onConfirm: async (data) => {
                    const session = TerminalManager.getActiveSession();
                    if (!session) return;

                    FileSystemManager.setFsData(
                        Utils.deepCopyNode(data.pendingData.fsDataSnapshot) || {
                            [Config.FILESYSTEM.ROOT_PATH]: {
                                type: Config.FILESYSTEM.DEFAULT_DIRECTORY_TYPE,
                                children: {},
                                owner: data.userNameToRestoreTo,
                                mode: Config.FILESYSTEM.DEFAULT_DIR_MODE,
                                mtime: new Date().toISOString(),
                            },
                        }
                    );
                    session.currentPath = data.pendingData.currentPath || Config.FILESYSTEM.ROOT_PATH;
                    session.domElements.output.innerHTML = data.pendingData.outputHTML || "";
                    session.domElements.input.textContent = data.pendingData.currentInput || "";
                    session.history.setHistory(data.pendingData.commandHistory || []);
                    await FileSystemManager.save(data.userNameToRestoreTo);
                    await OutputManager.appendToOutput(
                        Config.MESSAGES.SESSION_LOADED_MSG,
                        {
                            typeClass: Config.CSS_CLASSES.SUCCESS_MSG,
                            outputEl: session.domElements.output
                        }
                    );
                    TerminalManager.updatePrompt();
                    session.domElements.output.scrollTop = session.domElements.output.scrollHeight;
                },
                onCancel: () => {
                    OutputManager.appendToOutput(Config.MESSAGES.LOAD_STATE_CANCELLED, {
                        typeClass: Config.CSS_CLASSES.CONSOLE_LOG_MSG,
                    });
                },
            });
            return {
                success: true,
                message: "Confirmation requested for loading state.",
            };
        } else
            return {
                success: false,
                message: `${Config.MESSAGES.NO_MANUAL_SAVE_FOUND_PREFIX}${currentUser.name}.`,
            };
    }

    function clearUserSessionStates(username) {
        if (!username || typeof username !== "string") {
            console.warn(
                "SessionManager.clearUserSessionStates: Invalid username provided.",
                username
            );
            return false;
        }
        try {
            StorageManager.removeItem(_getAutomaticSessionStateKey(username));
            StorageManager.removeItem(_getManualUserTerminalStateKey(username));
            const users = StorageManager.loadItem(
                Config.STORAGE_KEYS.USER_CREDENTIALS,
                "User list",
                {}
            );
            if (users.hasOwnProperty(username)) {
                delete users[username];
                StorageManager.saveItem(
                    Config.STORAGE_KEYS.USER_CREDENTIALS,
                    users,
                    "User list"
                );
            }
            return true;
        } catch (e) {
            console.error(`Error clearing session states for user '${username}':`, e);
            return false;
        }
    }

    async function performFullReset() {
        TerminalManager.getActiveSession().domElements.output.innerHTML = "";
        TerminalManager.getActiveSession().domElements.input.textContent = "";

        const allKeys = StorageManager.getAllLocalStorageKeys();

        const OS_KEY_PREFIX = 'oopisOs';

        allKeys.forEach((key) => {
            if (key.startsWith(OS_KEY_PREFIX)) {
                StorageManager.removeItem(key);
            }
        });

        await OutputManager.appendToOutput(
            "All session states, credentials, aliases, groups, and editor settings cleared from local storage."
        );
        try {
            await FileSystemManager.clearAllFS();
            await OutputManager.appendToOutput(
                "All user filesystems cleared from DB."
            );
        } catch (error) {
            await OutputManager.appendToOutput(
                `Warning: Could not fully clear all user filesystems from DB. Error: ${error.message}`,
                {
                    typeClass: Config.CSS_CLASSES.WARNING_MSG,
                }
            );
        }
        await OutputManager.appendToOutput("Reset complete. Rebooting OopisOS...", {
            typeClass: Config.CSS_CLASSES.SUCCESS_MSG,
        });

        const activeSession = TerminalManager.getActiveSession();
        if (activeSession) {
            activeSession.domElements.input.parentElement.classList.add(Config.CSS_CLASSES.HIDDEN);
        }

        setTimeout(() => {
            window.location.reload();
        }, 1500);
    }

    return {
        initializeStack,
        getStack,
        pushUserToStack,
        popUserFromStack,
        getCurrentUserFromStack,
        clearUserStack,
        saveAutomaticState,
        loadAutomaticState,
        saveManualState,
        loadManualState,
        clearUserSessionStates,
        performFullReset,
    };
})();