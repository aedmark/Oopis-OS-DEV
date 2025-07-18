// scripts/commands/logout.js
(() => {
    "use strict";

    const logoutCommandDefinition = {
        commandName: "logout",
        description: "Logs out of the current user session.",
        helpText: `Usage: logout

Log out of the current user session.

DESCRIPTION
       The logout command terminates the current user's session and returns
       to the session of the previous user in the stack.

       This command is the counterpart to 'su'. If you use 'su' to become
       another user, 'logout' will return you to your original user session.

       If there is no previous session in the stack (i.e., you are in the
       initial session started with 'login'), logout will do nothing.

EXAMPLES
       su root
              (Enter password)
              ... perform actions as root ...
       logout
              Returns to the original user's session.`,
        argValidation: {
            exact: 0,
        },
        coreLogic: async () => {
            try {
                const result = await UserManager.logout();

                if (result.success) {
                    const resultData = result.data || {};
                    if (resultData.isLogout) {
                        OutputManager.clearOutput();
                        await OutputManager.appendToOutput(`${Config.MESSAGES.WELCOME_PREFIX} ${resultData.newUser}${Config.MESSAGES.WELCOME_SUFFIX}`);
                    }
                    if (resultData.noAction) {
                        return ErrorHandler.createSuccess(resultData.message);
                    }
                    return ErrorHandler.createSuccess(null);
                } else {
                    return result;
                }
            } catch (e) {
                return ErrorHandler.createError(`logout: An unexpected error occurred: ${e.message}`);
            }
        },
    };
    CommandRegistry.register(logoutCommandDefinition);
})();