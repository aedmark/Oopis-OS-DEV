// scripts/commands/explore.js
(() => {
    "use strict";

    const exploreCommandDefinition = {
        commandName: "explore",
        completionType: "paths", // Preserved for tab completion
        argValidation: {
            max: 1,
            error: "Usage: explore [path]",
        },

        coreLogic: async (context) => {
            const { args, options } = context;

            try {
                if (!options.isInteractive) {
                    return {
                        success: false,
                        error: "explore: Can only be run in an interactive session.",
                    };
                }

                if (typeof Explorer === 'undefined' || typeof AppLayerManager === 'undefined') {
                    return {
                        success: false,
                        error: "explore: Explorer application module is not loaded.",
                    };
                }

                const startPath = args.length > 0 ? args[0] : null;

                // CORRECTED: Use AppLayerManager to show the singleton Explorer instance
                AppLayerManager.show(Explorer, { startPath: startPath });

                return {
                    success: true,
                    output: "" // The command returns immediately; the app layer handles the UI
                };
            } catch(e) {
                return { success: false, error: `explore: An unexpected error occurred: ${e.message}` };
            }
        },
    };

    const exploreDescription = "Opens the graphical file explorer.";
    const exploreHelpText = `Usage: explore [path]

Launches the graphical file explorer application.

DESCRIPTION
       The explore command opens a two-pane graphical user interface for
       navigating the file system. The left pane shows a directory tree,
       and the right pane shows the contents of the selected directory.

       If an optional [path] is provided, the explorer will attempt to
       start at that location.

       Right-click on files, directories, or the pane background to access
       actions like creating, renaming, moving, and deleting items.`;

    CommandRegistry.register("explore", exploreCommandDefinition, exploreDescription, exploreHelpText);

})();