// scripts/commands/printscreen.js
(() => {
    "use strict";

    const printscreenCommandDefinition = {
        commandName: "printscreen",
        description: "Saves the visible terminal output to a file.",
        helpText: `Usage: printscreen <filepath>

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
              Saves the output of the 'ls -la /' command into a new file.`,
        completionType: "paths",
        argValidation: {
            exact: 1,
            error: "Usage: printscreen <filepath>",
        },
        coreLogic: async (context) => {
            const { args, currentUser } = context;
            const filePathArg = args[0];

            try {
                const pathValidationResult = FileSystemManager.validatePath(filePathArg, {
                    allowMissing: true,
                    expectedType: 'file',
                    disallowRoot: true
                });

                if (!pathValidationResult.success && pathValidationResult.data?.node !== null) {
                    return ErrorHandler.createError(`printscreen: ${pathValidationResult.error}`);
                }
                const pathValidation = pathValidationResult.data;

                if (pathValidation.node && pathValidation.node.type === 'directory') {
                    return ErrorHandler.createError(`printscreen: cannot overwrite directory '${filePathArg}' with a file.`);
                }

                if (pathValidation.node && !FileSystemManager.hasPermission(pathValidation.node, currentUser, "write")) {
                    return ErrorHandler.createError(`printscreen: '${filePathArg}': Permission denied`);
                }

                const outputDiv = document.getElementById('output');
                const outputContent = outputDiv ? outputDiv.innerText : "";

                const saveResult = await FileSystemManager.createOrUpdateFile(
                    pathValidation.resolvedPath,
                    outputContent,
                    { currentUser, primaryGroup: UserManager.getPrimaryGroupForUser(currentUser) }
                );

                if (!saveResult.success) {
                    return ErrorHandler.createError(`printscreen: ${saveResult.error}`);
                }

                const fsSaveResult = await FileSystemManager.save();
                if (!fsSaveResult.success) {
                    return ErrorHandler.createError(`printscreen: Failed to save file system changes: ${fsSaveResult.error}`);
                }

                return ErrorHandler.createSuccess(`Terminal output saved to '${pathValidation.resolvedPath}'`);
            } catch (e) {
                return ErrorHandler.createError(`printscreen: An unexpected error occurred: ${e.message}`);
            }
        },
    };
    CommandRegistry.register(printscreenCommandDefinition);
})();