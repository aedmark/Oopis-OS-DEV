const UserManager = (() => {
    "use strict";
    let currentUser = {
        name: Config.USER.DEFAULT_NAME,
    };

    async function _secureHashPassword(password) {
        if (!password || typeof password !== "string" || password.trim() === "") {
            return null;
        }
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(password);
            const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
        } catch (error) {
            console.error("Password hashing failed:", error);
            return null;
        }
    }

    function getCurrentUser() {
        return currentUser;
    }

    function getPrimaryGroupForUser(username) {
        const users = StorageManager.loadItem(
            Config.STORAGE_KEYS.USER_CREDENTIALS,
            "User list",
            {}
        );
        return users[username]?.primaryGroup || null;
    }

    async function userExists(username) {
        const users = StorageManager.loadItem(Config.STORAGE_KEYS.USER_CREDENTIALS, "User list", {});
        return users.hasOwnProperty(username);
    }

    async function register(username, password, sessionContext) { // MODIFIED
        const formatValidation = Utils.validateUsernameFormat(username);
        if (!formatValidation.isValid)
            return {
                success: false,
                error: formatValidation.error,
            };

        if (await userExists(username))
            return {
                success: false,
                error: `User '${username}' already exists.`,
            };

        const passwordHash = password ? await _secureHashPassword(password) : null;
        if (password && !passwordHash) {
            return {
                success: false,
                error: "Failed to securely process password.",
            };
        }

        GroupManager.createGroup(username);
        GroupManager.addUserToGroup(username, username);

        const users = StorageManager.loadItem(
            Config.STORAGE_KEYS.USER_CREDENTIALS,
            "User list",
            {}
        );

        users[username] = {
            passwordHash: passwordHash,
            primaryGroup: username,
        };

        await FileSystemManager.createUserHomeDirectory(username);

        if (
            StorageManager.saveItem(
                Config.STORAGE_KEYS.USER_CREDENTIALS,
                users,
                "User list"
            ) &&
            (await FileSystemManager.save())
        ) {
            return {
                success: true,
                message: `User '${username}' registered. Home directory created at /home/${username}.`,
            };
        } else {
            return {
                success: false,
                error: "Failed to save new user and filesystem.",
            };
        }
    }

    async function _authenticateUser(username, providedPassword) {
        const users = StorageManager.loadItem(Config.STORAGE_KEYS.USER_CREDENTIALS, "User list", {});
        const userEntry = users[username];

        if (!userEntry && username !== Config.USER.DEFAULT_NAME && username !== 'root') {
            return { success: false, error: "Invalid username." };
        }

        const storedPasswordHash = userEntry ? userEntry.passwordHash : null;

        if (storedPasswordHash !== null) {
            if (providedPassword === null) {
                return { success: false, error: "Password required.", requiresPasswordPrompt: true };
            }
            const providedPasswordHash = await _secureHashPassword(providedPassword);
            if (providedPasswordHash !== storedPasswordHash) {
                return { success: false, error: Config.MESSAGES.INVALID_PASSWORD };
            }
        } else if (providedPassword !== null) {
            return { success: false, error: "This account does not require a password." };
        }

        return { success: true };
    }

    async function verifyPassword(username, password) {
        const users = StorageManager.loadItem(Config.STORAGE_KEYS.USER_CREDENTIALS, "User list", {});
        const userEntry = users[username];

        if (!userEntry) {
            return { success: false, error: "User not found." };
        }

        const storedPasswordHash = userEntry.passwordHash;
        if (storedPasswordHash === null) {
            return { success: false, error: "User does not have a password set."};
        }

        const providedPasswordHash = await _secureHashPassword(password);
        if (providedPasswordHash === storedPasswordHash) {
            return { success: true };
        } else {
            return { success: false, error: "Incorrect password." };
        }
    }

    async function sudoExecute(commandStr, options, sessionContext) { // MODIFIED
        const originalUser = currentUser;
        try {
            currentUser = { name: 'root' };
            // Pass sessionContext to the command executor
            return await CommandExecutor.processSingleCommand(commandStr, {...options, sessionContext});
        } catch (e) {
            return { success: false, error: `sudo: an unexpected error occurred during execution: ${e.message}` };
        } finally {
            currentUser = originalUser;
        }
    }

    async function changePassword(actorUsername, targetUsername, oldPassword, newPassword) {
        const users = StorageManager.loadItem(Config.STORAGE_KEYS.USER_CREDENTIALS, "User list", {});

        if (!await userExists(targetUsername)) {
            return { success: false, error: `User '${targetUsername}' not found.` };
        }

        if (actorUsername !== 'root') {
            if (actorUsername !== targetUsername) {
                return { success: false, error: "You can only change your own password." };
            }
            const authResult = await _authenticateUser(actorUsername, oldPassword);
            if (!authResult.success) {
                return { success: false, error: "Incorrect current password." };
            }
        }

        if (!newPassword || newPassword.trim() === '') {
            return { success: false, error: "New password cannot be empty." };
        }

        const newPasswordHash = await _secureHashPassword(newPassword);
        if (!newPasswordHash) {
            return { success: false, error: "Failed to securely process new password." };
        }

        users[targetUsername].passwordHash = newPasswordHash;

        if (StorageManager.saveItem(
            Config.STORAGE_KEYS.USER_CREDENTIALS,
            users,
            "User list"
        )) {
            return { success: true, message: `Password for '${targetUsername}' updated successfully.` };
        } else {
            return { success: false, error: "Failed to save updated password." };
        }
    }

    async function _handleAuthFlow(username, providedPassword, successCallback, failureMessage, options, sessionContext) { // MODIFIED
        const authResult = await _authenticateUser(username, providedPassword);

        if (!authResult.success) {
            if (!authResult.requiresPasswordPrompt) {
                return authResult;
            }
            return new Promise(resolve => {
                ModalInputManager.requestInput(
                    Config.MESSAGES.PASSWORD_PROMPT,
                    async (passwordFromPrompt) => {
                        const finalAuthResult = await _authenticateUser(username, passwordFromPrompt);
                        if (finalAuthResult.success) {
                            // Pass sessionContext to the success callback
                            resolve(await successCallback(username, sessionContext));
                        } else {
                            resolve({ success: false, error: finalAuthResult.error || failureMessage });
                        }
                    },
                    () => resolve({ success: true, output: Config.MESSAGES.OPERATION_CANCELLED }),
                    true,
                    options,
                    sessionContext // Pass sessionContext to modal
                );
            });
        }
        // Pass sessionContext to the success callback
        return await successCallback(username, sessionContext);
    }

    async function login(username, providedPassword, options = {}, sessionContext) { // MODIFIED
        const currentUserName = getCurrentUser().name;

        if (username === currentUserName) {
            const message = `${Config.MESSAGES.ALREADY_LOGGED_IN_AS_PREFIX}${username}${Config.MESSAGES.ALREADY_LOGGED_IN_AS_SUFFIX}`;
            return { success: true, message: message, noAction: true };
        }

        return _handleAuthFlow(username, providedPassword, _performLogin, "Login failed.", options, sessionContext); // MODIFIED
    }

    async function _performLogin(username, sessionContext) { // MODIFIED
        SessionManager.clearUserStack(username);
        currentUser = { name: username };

        const allSessions = TerminalManager.getAllSessions();
        allSessions.forEach(session => {
            session.environment.initialize(username);
            const homePath = `/home/${username}`;
            session.currentPath = FileSystemManager.getNodeByPath(homePath) ? homePath : Config.FILESYSTEM.ROOT_PATH;
            TerminalManager.updatePrompt(session);
        });

        // Use the provided sessionContext to clear the right screen
        OutputManager.clearOutput(sessionContext);
        await OutputManager.appendToOutput(
            `${Config.MESSAGES.WELCOME_PREFIX} ${username}${Config.MESSAGES.WELCOME_SUFFIX}`,
            {sessionContext: sessionContext} // MODIFIED
        );

        FileSystemManager.setCurrentPath(sessionContext.currentPath || Config.FILESYSTEM.ROOT_PATH);

        return { success: true, message: `Logged in as ${username}.`, isLogin: true };
    }


    async function su(username, providedPassword, options = {}, sessionContext) { // MODIFIED
        if (currentUser.name === username) {
            return { success: true, message: `Already user '${username}'.`, noAction: true };
        }
        return _handleAuthFlow(username, providedPassword, _performSu, "su: Authentication failure.", options, sessionContext); // MODIFIED
    }

    async function _performSu(username, sessionContext) { // MODIFIED
        SessionManager.pushUserToStack(username);
        currentUser = { name: username };

        sessionContext.environment.initialize(username);
        const homePath = `/home/${username}`;
        sessionContext.currentPath = FileSystemManager.getNodeByPath(homePath) ? homePath : Config.FILESYSTEM.ROOT_PATH;
        FileSystemManager.setCurrentPath(sessionContext.currentPath);
        TerminalManager.updatePrompt(sessionContext);
        OutputManager.clearOutput(sessionContext); // MODIFIED
        await OutputManager.appendToOutput(
            `${Config.MESSAGES.WELCOME_PREFIX} ${username}${Config.MESSAGES.WELCOME_SUFFIX}`,
            {sessionContext: sessionContext} // MODIFIED
        );

        return { success: true, message: `Switched to user: ${username}.` };
    }

    async function logout(sessionContext) { // MODIFIED
        const oldUser = currentUser.name;
        if (SessionManager.getStack().length <= 1) {
            return { success: true, message: `Cannot log out from user '${oldUser}'. This is the only active session. Use 'login' to switch to a different user.`, noAction: true };
        }

        SessionManager.popUserFromStack();
        const newUsername = SessionManager.getCurrentUserFromStack();
        currentUser = { name: newUsername };

        // Use the provided sessionContext
        sessionContext.environment.initialize(newUsername);
        const homePath = `/home/${newUsername}`;
        sessionContext.currentPath = FileSystemManager.getNodeByPath(homePath) ? homePath : Config.FILESYSTEM.ROOT_PATH;
        FileSystemManager.setCurrentPath(sessionContext.currentPath);
        TerminalManager.updatePrompt(sessionContext);
        OutputManager.clearOutput(sessionContext); // MODIFIED
        await OutputManager.appendToOutput(
            `${Config.MESSAGES.WELCOME_PREFIX} ${newUsername}${Config.MESSAGES.WELCOME_SUFFIX}`,
            {sessionContext: sessionContext} // MODIFIED
        );

        return { success: true, message: `Logged out from ${oldUser}. Now logged in as ${newUsername}.`, isLogout: true, newUser: newUsername };
    }

    async function initializeDefaultUsers() {
        const users = StorageManager.loadItem(
            Config.STORAGE_KEYS.USER_CREDENTIALS,
            "User list",
            {}
        );
        let changesMade = false;

        if (!users["root"]) {
            users["root"] = {
                passwordHash: await _secureHashPassword("mcgoopis"),
                primaryGroup: "root",
            };
            changesMade = true;
        }

        if (!users[Config.USER.DEFAULT_NAME]) {
            users[Config.USER.DEFAULT_NAME] = {
                passwordHash: null,
                primaryGroup: Config.USER.DEFAULT_NAME,
            };
            changesMade = true;
        }

        if (changesMade) {
            StorageManager.saveItem(
                Config.STORAGE_KEYS.USER_CREDENTIALS,
                users,
                "User list"
            );
        }
    }

    return {
        getCurrentUser,
        register,
        login,
        logout,
        su,
        verifyPassword,
        sudoExecute,
        changePassword,
        initializeDefaultUsers,
        getPrimaryGroupForUser,
        userExists
    };
})();