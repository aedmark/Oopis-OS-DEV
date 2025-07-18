// scripts/commands/whoami.js
(() => {
    "use strict";

    const whoamiCommandDefinition = {
        commandName: "whoami",
        description: "Prints the current effective user name.",
        helpText: `Usage: whoami

Print the current user name.

DESCRIPTION
       The whoami command prints the user name associated with the
       current effective user ID.`,
        argValidation: {
            exact: 0,
        },
        coreLogic: async () => {
            try {
                return ErrorHandler.createSuccess(UserManager.getCurrentUser().name);
            } catch (e) {
                return ErrorHandler.createError(`whoami: An unexpected error occurred: ${e.message}`);
            }
        },
    };
    CommandRegistry.register(whoamiCommandDefinition);
})();