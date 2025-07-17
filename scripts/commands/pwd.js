// scripts/commands/pwd.js
(() => {
    "use strict";

    const pwdCommandDefinition = {
        commandName: "pwd",
        description: "Prints the current working directory.",
        helpText: `Usage: pwd

Print the full path of the current working directory.

DESCRIPTION
       The pwd (print working directory) command writes the full, absolute
       pathname of the current working directory to the standard output.`,
        argValidation: {
            exact: 0,
        },
        coreLogic: async () => {
            try {
                return {
                    success: true,
                    output: FileSystemManager.getCurrentPath(),
                };
            } catch (e) {
                return { success: false, error: `pwd: An unexpected error occurred: ${e.message}` };
            }
        },
    };
    CommandRegistry.register(pwdCommandDefinition);
})();