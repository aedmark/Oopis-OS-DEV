// scripts/commands/loadstate.js
(() => {
    "use strict";

    const loadstateCommandDefinition = {
        commandName: "loadstate",
        description: "Loads the last manually saved session state.",
        helpText: `Usage: loadstate

Load the last manually saved session state for the current user.

DESCRIPTION
       The loadstate command restores the OopisOS environment to the
       last state that was explicitly saved using the 'savestate'
       command.

       This includes the entire file system, the state of the terminal
       screen, and command history at the moment 'savestate' was run.
       It only loads the state for the currently active user.

WARNING
       This operation is destructive and will overwrite your current
       file system and session with the saved data. The command will
       prompt for confirmation before proceeding.`,
        argValidation: {
            exact: 0,
        },
        coreLogic: async () => {
            try {
                const result = await SessionManager.loadManualState();
                if (result.success) {
                    return ErrorHandler.createSuccess(result.data.message);
                }
                return ErrorHandler.createError(result.data.message || "Failed to load state.");
            } catch (e) {
                return ErrorHandler.createError(`loadstate: An unexpected error occurred: ${e.message}`);
            }
        },
    };
    CommandRegistry.register(loadstateCommandDefinition);
})();