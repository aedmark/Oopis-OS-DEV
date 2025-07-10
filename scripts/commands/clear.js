(() => {
    "use strict";

    const clearCommandDefinition = {
        commandName: "clear",
        argValidation: {
            exact: 0,
        },

        coreLogic: async (context) => {
            if (context.options.isInteractive) {
                OutputManager.clearOutput(context.sessionContext);
            }
            return {
                success: true,
                output: "",
            };
        },
    };

    const clearDescription = "Clears the terminal screen of all previous output.";

    const clearHelpText = `Usage: clear

Clear the terminal screen.

DESCRIPTION
       The clear command clears your screen, removing all previous output
       and moving the command prompt to the top of the visible area.

       This does not clear your command history, which can still be
       accessed with the up and down arrow keys. To clear history, use
       the 'history -c' command.`;

    CommandRegistry.register("clear", clearCommandDefinition, clearDescription, clearHelpText);
})();