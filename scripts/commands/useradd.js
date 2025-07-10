(() => {
    "use strict";

    const useraddCommandDefinition = {
        commandName: "useradd",
        argValidation: {
            exact: 1,
            error: "expects exactly one argument (username)",
        },

        coreLogic: async (context) => {
            const {args, options, sessionContext} = context;
            const username = args[0];

            const userCheck = StorageManager.loadItem(Config.STORAGE_KEYS.USER_CREDENTIALS, "User list", {});
            if (userCheck[username]) {
                return { success: false, error: `User '${username}' already exists.` };
            }

            if (!options.isInteractive) {
                // Non-interactive path for scripts like diag.sh
                const scriptContext = options.scriptingContext;
                if (!scriptContext || scriptContext.lines.length < scriptContext.currentLineIndex + 2) {
                    return {
                        success: false,
                        error: "useradd: in script mode, expects password and confirmation on the next two lines."
                    };
                }

                // Consume the next two lines from the script as the password and confirmation
                const firstPassword = scriptContext.lines[++scriptContext.currentLineIndex]?.trim();
                const confirmedPassword = scriptContext.lines[++scriptContext.currentLineIndex]?.trim();

                if (firstPassword === undefined || confirmedPassword === undefined) {
                    return {success: false, error: "useradd: script ended before password confirmation could be read."};
                }

                if (firstPassword !== confirmedPassword) {
                    return {success: false, error: "Passwords do not match in script."};
                }

                // Await the registration and return the result directly
                const registerResult = await UserManager.register(username, firstPassword);
                if (registerResult.success && registerResult.message) {
                    return {success: true, output: registerResult.message, messageType: Config.CSS_CLASSES.SUCCESS_MSG};
                }
                return registerResult;

            } else {
                // Interactive path for manual user input
                // This logic still depends on a ModalManager that can handle text input.
                // Since `ModalInputManager` is undefined, this path remains problematic, but the scripted path is fixed.
                return new Promise(async (resolve) => {
                    // This call will fail until ModalInputManager or its equivalent is correctly implemented and defined.
                    // For now, the scripted execution path is the priority fix.
                    resolve({
                        success: false,
                        error: "Interactive user creation is currently unavailable due to a missing UI component (ModalInputManager)."
                    });
                });
            }
        },
    };

    const useraddDescription = "Creates a new user account.";
    const useraddHelpText = `Usage: useradd <username>

Create a new user account.

DESCRIPTION
       The useradd command creates a new user account with the specified
       <username>. When run, the command will prompt you to enter and
       confirm a password for the new user in a secure, obscured input.

       When run from a script, it will consume the next two lines of the
       script as the password and confirmation.

EXAMPLES
       useradd newdev
              Starts the process to create a user named 'newdev',
              prompting for a password.`;

    CommandRegistry.register("useradd", useraddCommandDefinition, useraddDescription, useraddHelpText);
})();