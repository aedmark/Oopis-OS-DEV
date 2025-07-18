// scripts/commands/date.js
(() => {
    "use strict";

    const dateCommandDefinition = {
        commandName: "date",
        description: "Display the current system date and time.",
        helpText: `Usage: date

Display the current system date and time.

DESCRIPTION
       The date command prints the current date and time as determined
       by the user's browser, including timezone information.`,
        argValidation: {
            exact: 0,
        },
        coreLogic: async () => {
            try {
                return ErrorHandler.createSuccess(new Date().toString());
            } catch (e) {
                return ErrorHandler.createError(`date: An unexpected error occurred: ${e.message}`);
            }
        },
    };
    CommandRegistry.register(dateCommandDefinition);
})();