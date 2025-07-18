// scripts/commands/clear.js
(() => {
    "use strict";

    const clearCommandDefinition = {
        commandName: "clear",
        description: "Clears the terminal screen of all previous output.",
        helpText: `Usage: clear

Clear the terminal screen.

DESCRIPTION
       The clear command clears your screen, removing all previous output
       and moving the command prompt to the top of the visible area.

       This does not clear your command history, which can still be
       accessed with the up and down arrow keys. To clear history, use
       the 'history -c' command.`,
        argValidation: {
            exact: 0,
        },
        coreLogic: async (context) => {
            try {
                if (context.options.isInteractive) {
                    OutputManager.clearOutput();
                }
                return ErrorHandler.createSuccess("");
            } catch (e) {
                return ErrorHandler.createError(`clear: An unexpected error occurred: ${e.message}`);
            }
        },
    };
    CommandRegistry.register(clearCommandDefinition);
})();