// scripts/commands/printscreen.js
(() => {
    "use strict";

    const printscreenCommandDefinition = {
        commandName: "printscreen",
        completionType: "paths",
        argValidation: {
            exact: 1,
            error: "Usage: printscreen <filepath>",
        },
        // REMOVED: pathValidation property is gone.
        coreLogic: async (context) => {
            const { args, currentUser } = context;
            const filePathArg = args[0];
            const nowISO = new Date().toISOString();

            // --- NEW: Explicit validation sequence ---
            const resolvedPath = FileSystemManager.getAbsolutePath(filePathArg);

            if (resolvedPath === Config.FILESYSTEM.ROOT_PATH) {
                return {
                    success: false,
                    error: `printscreen: Cannot save directly to root ('${Config.FILESYSTEM.ROOT_PATH}'). Please specify a filename.`,
                };
            }

            if (resolvedPath.endsWith(Config.FILESYSTEM.PATH_SEPARATOR)) {
                return {
                    success: false,
                    error: `printscreen: Target path '${filePathArg}' must be a file, not a directory path (ending with '${Config.FILESYSTEM.PATH_SEPARATOR}').`,
                };
            }

            const existingNode = FileSystemManager.getNodeByPath(resolvedPath);

            if (existingNode) {
                if (existingNode.type === Config.FILESYSTEM.DEFAULT_DIRECTORY_TYPE) {
                    return {
                        success: false,
                        error: `printscreen: Cannot overwrite directory '${filePathArg}'.`,
                    };
                }
                if (!FileSystemManager.hasPermission(existingNode, currentUser, "write")) {
                    return {
                        success: false,
                        error: `printscreen: '${filePathArg}'${Config.MESSAGES.PERMISSION_DENIED_SUFFIX}`,
                    };
                }
            }
            // --- End of new validation sequence ---

            const outputContent = DOM.outputDiv ? DOM.outputDiv.innerText : "";

            const saveResult = await FileSystemManager.createOrUpdateFile(
                resolvedPath,
                outputContent,
                { currentUser, primaryGroup: UserManager.getPrimaryGroupForUser(currentUser), existingNode }
            );

            if (!saveResult.success) {
                return { success: false, error: `printscreen: ${saveResult.error}`};
            }

            FileSystemManager._updateNodeAndParentMtime(resolvedPath, nowISO);

            if (!(await FileSystemManager.save(currentUser))) {
                return {
                    success: false,
                    error: "printscreen: Failed to save file system changes.",
                };
            }

            return {
                success: true,
                output: `Terminal output saved to '${resolvedPath}'`,
                messageType: Config.CSS_CLASSES.SUCCESS_MSG,
            };
        },
    };

    const printscreenDescription = "Saves the visible terminal output to a file.";
    const printscreenHelpText = `Usage: printscreen <filepath>

Save the visible terminal output to a file.

DESCRIPTION
       The printscreen command captures all text currently visible in the
       terminal's output area and saves it as plain text to the specified
       <filepath>.

       This is useful for creating logs or saving the results of a series
       of commands for later review. If the file already exists, it will be
       overwritten.

EXAMPLES
       ls -la /
       printscreen /home/Guest/root_listing.txt
              Saves the output of the 'ls -la /' command into a new file.`;

    CommandRegistry.register("printscreen", printscreenCommandDefinition, printscreenDescription, printscreenHelpText);
})();