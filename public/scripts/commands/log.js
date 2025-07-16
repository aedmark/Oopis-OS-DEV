// scripts/commands/log.js
(() => {
    "use strict";

    const logCommandDefinition = {
        commandName: "log",
        argValidation: {
            max: 1,
            error: "Usage: log [\"quick entry text\"]"
        },
        coreLogic: async (context) => {
            const { args, currentUser, options } = context;

            try {
                if (!options.isInteractive) {
                    return {
                        success: false,
                        error: "log: Can only be run in interactive mode."
                    };
                }

                if (typeof Log === 'undefined' || typeof LogUI === 'undefined' || typeof App === 'undefined') {
                    return {
                        success: false,
                        error: "log: The Log application module is not loaded."
                    };
                }

                if (args.length === 1) {
                    const entryText = args[0];
                    const result = await Log.quickAdd(entryText, currentUser);
                    if (result.success) {
                        await OutputManager.appendToOutput(result.message, { typeClass: Config.CSS_CLASSES.SUCCESS_MSG });
                        return { success: true, output: "" };
                    } else {
                        return { success: false, error: result.error };
                    }
                }

                // Launch the full application using the AppLayerManager
                AppLayerManager.show(Log);

                return { success: true, output: "" };
            } catch (e) {
                return { success: false, error: `log: An unexpected error occurred: ${e.message}` };
            }
        }
    };

    const description = "A personal, timestamped journal and log application.";
    const helpText = `
Usage: log ["entry text"]

DESCRIPTION
    The 'log' command is your personal journal within OopisOS.

    Running 'log' with a quoted string as an argument will instantly
    create a new, timestamped journal entry without opening the app.

    Running 'log' with no arguments launches the full-screen application,
    allowing you to view, search, and manage all your entries.

EXAMPLES
    log "Finished the first draft of the proposal."
        Creates a new entry with the specified text.

    log
        Opens the main journal application.
`;

    CommandRegistry.register("log", logCommandDefinition, description, helpText);
})();