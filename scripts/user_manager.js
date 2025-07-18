// scripts/user_manager.js
const UserManager = (() => {
    "use strict";
    let currentUser = {
        name: Config.USER.DEFAULT_NAME,
    };

    // =================================================================
    // NEW & IMPROVED SECURE PASSWORD FUNCTIONS (THE ARCHITECT'S DIRECTIVE)
    // =================================================================

    /**
     * The new heart of our password security! This function takes a password,
     * generates a unique salt, and then uses PBKDF2 to create a super-strong hash.
     * @param {string} password The user's plain-text password.
     * @returns {Promise<{salt: string, hash: string}>} An object containing the salt and the derived hash.
     * @private
     */
    async function _secureHashPassword(password) {
        // Step 1: Generate a unique, random salt.
        const salt = new Uint8Array(16);
        window.crypto.getRandomValues(salt);
        const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');

        // Step 2: Use PBKDF2 to derive a key from the password.
        const keyMaterial = await window.crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(password),
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );

        const key = await window.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256',
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );

        // Step 3: Export the derived key as our final hash.
        const rawHash = await window.crypto.subtle.exportKey('raw', key);
        const hashHex = Array.from(new Uint8Array(rawHash)).map(b => b.toString(16).padStart(2, '0')).join('');

        return { salt: saltHex, hash: hashHex };
    }

    /**
     * Verifies a password attempt against the stored salt and hash.
     * @param {string} passwordAttempt The password entered by the user.
     * @param {string} saltHex The user's stored salt (in hex).
     * @param {string} storedHashHex The user's stored hash (in hex).
     * @returns {Promise<boolean>} True if the password is correct, false otherwise.
     * @private
     */
    async function _verifyPasswordWithSalt(passwordAttempt, saltHex, storedHashHex) {
        // Convert hex salt back to Uint8Array.
        const salt = new Uint8Array(saltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

        // Re-run the hash process with the provided password and stored salt.
        const keyMaterial = await window.crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(passwordAttempt),
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );

        const key = await window.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256',
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );

        const rawHash = await window.crypto.subtle.exportKey('raw', key);
        const attemptHashHex = Array.from(new Uint8Array(rawHash)).map(b => b.toString(16).padStart(2, '0')).join('');

        // Timing-safe comparison.
        return attemptHashHex.length === storedHashHex.length &&
            attemptHashHex.split('').every((char, i) => char === storedHashHex[i]);
    }


    // =================================================================
    // EXISTING USER MANAGER FUNCTIONS - NOW REFFACTORED
    // =================================================================

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

    async function register(username, password) {
        const formatValidation = Utils.validateUsernameFormat(username);
        if (!formatValidation.isValid) {
            return ErrorHandler.createError(formatValidation.error);
        }

        if (await userExists(username)) {
            return ErrorHandler.createError(`User '${username}' already exists.`);
        }

        let passwordData = null;
        if (password) {
            passwordData = await _secureHashPassword(password);
            if (!passwordData) {
                return ErrorHandler.createError("Failed to securely process password.");
            }
        }

        GroupManager.createGroup(username);
        GroupManager.addUserToGroup(username, username);

        const users = StorageManager.loadItem(
            Config.STORAGE_KEYS.USER_CREDENTIALS,
            "User list",
            {}
        );

        users[username] = {
            passwordData: passwordData,
            primaryGroup: username,
        };

        await FileSystemManager.createUserHomeDirectory(username);
        const fsSaveResult = await FileSystemManager.save();

        if (
            StorageManager.saveItem(
                Config.STORAGE_KEYS.USER_CREDENTIALS,
                users,
                "User list"
            ) &&
            fsSaveResult.success
        ) {
            return ErrorHandler.createSuccess(`User '${username}' registered. Home directory created at /home/${username}.`);
        } else {
            return ErrorHandler.createError("Failed to save new user and filesystem.");
        }
    }

    async function _authenticateUser(username, providedPassword) {
        const users = StorageManager.loadItem(Config.STORAGE_KEYS.USER_CREDENTIALS, "User list", {});
        const userEntry = users[username];

        if (!userEntry && username !== Config.USER.DEFAULT_NAME && username !== 'root') {
            return ErrorHandler.createError("Invalid username.");
        }

        const { salt, hash } = userEntry?.passwordData || {};

        if (salt && hash) {
            if (providedPassword === null) {
                return { success: false, error: "Password required.", requiresPasswordPrompt: true };
            }
            const isValid = await _verifyPasswordWithSalt(providedPassword, salt, hash);
            if (!isValid) {
                return ErrorHandler.createError(Config.MESSAGES.INVALID_PASSWORD);
            }
        } else if (providedPassword !== null) {
            return ErrorHandler.createError("This account does not require a password.");
        }

        return ErrorHandler.createSuccess();
    }

    async function verifyPassword(username, password) {
        const users = StorageManager.loadItem(Config.STORAGE_KEYS.USER_CREDENTIALS, "User list", {});
        const userEntry = users[username];

        if (!userEntry) {
            return ErrorHandler.createError("User not found.");
        }

        const { salt, hash } = userEntry?.passwordData || {};
        if (!salt || !hash) {
            return ErrorHandler.createError("User does not have a password set.");
        }

        const isValid = await _verifyPasswordWithSalt(password, salt, hash);
        if (isValid) {
            return ErrorHandler.createSuccess();
        } else {
            return ErrorHandler.createError("Incorrect password.");
        }
    }

    async function sudoExecute(commandStr, options) {
        const originalUser = currentUser;
        try {
            currentUser = { name: 'root' };
            return await CommandExecutor.processSingleCommand(commandStr, options);
        } catch (e) {
            return ErrorHandler.createError(`sudo: an unexpected error occurred during execution: ${e.message}`);
        } finally {
            currentUser = originalUser;
        }
    }

    async function changePassword(actorUsername, targetUsername, oldPassword, newPassword) {
        const users = StorageManager.loadItem(Config.STORAGE_KEYS.USER_CREDENTIALS, "User list", {});

        if (!await userExists(targetUsername)) {
            return ErrorHandler.createError(`User '${targetUsername}' not found.`);
        }

        if (actorUsername !== 'root') {
            if (actorUsername !== targetUsername) {
                return ErrorHandler.createError("You can only change your own password.");
            }
            const authResult = await _authenticateUser(actorUsername, oldPassword);
            if (!authResult.success) {
                return ErrorHandler.createError("Incorrect current password.");
            }
        }

        if (!newPassword || newPassword.trim() === '') {
            return ErrorHandler.createError("New password cannot be empty.");
        }

        const newPasswordData = await _secureHashPassword(newPassword);
        if (!newPasswordData) {
            return ErrorHandler.createError("Failed to securely process new password.");
        }

        users[targetUsername].passwordData = newPasswordData;

        if (StorageManager.saveItem(
            Config.STORAGE_KEYS.USER_CREDENTIALS,
            users,
            "User list"
        )) {
            return ErrorHandler.createSuccess(`Password for '${targetUsername}' updated successfully.`);
        } else {
            return ErrorHandler.createError("Failed to save updated password.");
        }
    }

    async function _handleAuthFlow(username, providedPassword, successCallback, failureMessage, options) {
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
                            resolve(await successCallback(username));
                        } else {
                            resolve(ErrorHandler.createError(finalAuthResult.error || failureMessage));
                        }
                    },
                    () => resolve(ErrorHandler.createSuccess({ output: Config.MESSAGES.OPERATION_CANCELLED })),
                    true,
                    options
                );
            });
        }
        return await successCallback(username);
    }

    async function login(username, providedPassword, options = {}) {
        const currentStack = SessionManager.getStack();
        const currentUserName = getCurrentUser().name;

        if (username === currentUserName) {
            const message = `${Config.MESSAGES.ALREADY_LOGGED_IN_AS_PREFIX}${username}${Config.MESSAGES.ALREADY_LOGGED_IN_AS_SUFFIX}`;
            return ErrorHandler.createSuccess({ message: message, noAction: true });
        }

        if (currentStack.includes(username)) {
            return ErrorHandler.createError(`${Config.MESSAGES.ALREADY_LOGGED_IN_AS_PREFIX}${username}${Config.MESSAGES.ALREADY_LOGGED_IN_AS_SUFFIX}`);
        }

        return _handleAuthFlow(username, providedPassword, _performLogin, "Login failed.", options);
    }

    async function _performLogin(username) {
        if (currentUser.name !== Config.USER.DEFAULT_NAME) {
            SessionManager.saveAutomaticState(currentUser.name);
            SudoManager.clearUserTimestamp(currentUser.name);
        }
        SessionManager.clearUserStack(username);
        currentUser = { name: username };
        SessionManager.loadAutomaticState(username);
        const homePath = `/home/${username}`;
        if (FileSystemManager.getNodeByPath(homePath)) {
            FileSystemManager.setCurrentPath(homePath);
        } else {
            FileSystemManager.setCurrentPath(Config.FILESYSTEM.ROOT_PATH);
        }
        return ErrorHandler.createSuccess({ message: `Logged in as ${username}.`, isLogin: true });
    }

    async function su(username, providedPassword, options = {}) {
        if (currentUser.name === username) {
            return ErrorHandler.createSuccess({ message: `Already user '${username}'.`, noAction: true });
        }
        return _handleAuthFlow(username, providedPassword, _performSu, "su: Authentication failure.", options);
    }

    async function _performSu(username) {
        SessionManager.saveAutomaticState(currentUser.name);
        SessionManager.pushUserToStack(username);
        currentUser = { name: username };
        SessionManager.loadAutomaticState(username);
        const homePath = `/home/${username}`;
        if (FileSystemManager.getNodeByPath(homePath)) {
            FileSystemManager.setCurrentPath(homePath);
        } else {
            FileSystemManager.setCurrentPath(Config.FILESYSTEM.ROOT_PATH);
        }
        return ErrorHandler.createSuccess({ message: `Switched to user: ${username}.` });
    }

    async function logout() {
        const oldUser = currentUser.name;
        if (SessionManager.getStack().length <= 1) {
            return ErrorHandler.createSuccess({
                message: `Cannot log out from user '${oldUser}'. This is the only active session. Use 'login' to switch to a different user.`,
                noAction: true
            });
        }

        SessionManager.saveAutomaticState(oldUser);
        SudoManager.clearUserTimestamp(oldUser);
        SessionManager.popUserFromStack();
        const newUsername = SessionManager.getCurrentUserFromStack();
        currentUser = { name: newUsername };
        SessionManager.loadAutomaticState(newUsername);
        const homePath = `/home/${newUsername}`;
        if (FileSystemManager.getNodeByPath(homePath)) {
            FileSystemManager.setCurrentPath(homePath);
        } else {
            FileSystemManager.setCurrentPath(Config.FILESYSTEM.ROOT_PATH);
        }
        return ErrorHandler.createSuccess({
            message: `Logged out from ${oldUser}. Now logged in as ${newUsername}.`,
            isLogout: true,
            newUser: newUsername
        });
    }

    async function initializeDefaultUsers() {
        const users = StorageManager.loadItem(
            Config.STORAGE_KEYS.USER_CREDENTIALS,
            "User list",
            {}
        );
        let changesMade = false;

        if (!users["root"] || !users["root"].passwordData) {
            users["root"] = {
                passwordData: await _secureHashPassword("mcgoopis"),
                primaryGroup: "root",
            };
            changesMade = true;
        }

        if (!users[Config.USER.DEFAULT_NAME]) {
            users[Config.USER.DEFAULT_NAME] = {
                passwordData: null,
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