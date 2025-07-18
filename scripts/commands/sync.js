// scripts/commands/sync.js
(() => {
    "use strict";

    const syncCommandDefinition = {
        commandName: "sync",
        description: "Commit filesystem caches to persistent storage.",
        helpText: `Usage: sync

Flush file system buffers.

DESCRIPTION
       The sync command forces a write of all buffered file system data
       in memory (the live fsData object) to the underlying persistent
       storage (IndexedDB).

       While most file operations in OopisOS trigger a save automatically,
       'sync' can be used to ensure all pending changes are written before
       a critical operation or closing the session.`,
        argValidation: {
            exact: 0,
        },
        coreLogic: async () => {
            try {
                const saveResult = await FileSystemManager.save();
                if (saveResult.success) {
                    return ErrorHandler.createSuccess("");
                } else {
                    return ErrorHandler.createError("sync: Filesystem failed to save state.");
                }
            } catch (error) {
                console.error("Error during sync operation:", error);
                return ErrorHandler.createError("sync: An unexpected error occurred.");
            }
        }
    };
    CommandRegistry.register(syncCommandDefinition);
})();