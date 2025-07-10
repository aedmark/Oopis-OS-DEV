/**
 * code.js
 *
 * The user-facing entry point for the 'code' command.
 * It validates input and launches the main Code Editor application.
 */
'use strict';

(function () {
    const codeCommandDefinition = {
        commandName: 'code',
        description: 'Opens a file in the Code editor. A new file is created if the path does not exist.',
        helpText: 'Usage: code [file_path]\n\nOpens the specified file in a dedicated code editor with syntax highlighting. If no file path is provided, it opens an empty, untitled editor.',
        argValidation: {
            max: 1
        },
        pathValidation: {
            0: { // First argument
                argIndex: 0,
                isFile: true,
                optional: true,
                allowMissing: true, // Allow creating new files
            }
        },
        coreLogic: async function (context) {
            const {
                validatedPaths,
                isInteractive
            } = context;

            if (!isInteractive) {
                return {
                    success: false,
                    error: "'code' command can only be run in an interactive session."
                };
            }

            if (typeof CodeManager === 'undefined' || typeof CodeUI === 'undefined') {
                return {
                    success: false,
                    error: "The Code Editor modules are not loaded. Catastrophic failure."
                };
            }

            let filePath = null;
            let fileContent = '';

            if (validatedPaths && validatedPaths[0]) {
                const file = validatedPaths[0];
                filePath = file.fullPath;
                if (file.exists) {
                    fileContent = file.content;
                }
            }

            // Hand off control to the main application logic.
            // This is its only purpose.
            CodeManager.enter(filePath, fileContent);

            // The command itself resolves once the editor is opened.
            // The editor's lifecycle is managed by CodeManager and CodeUI.
            return {
                success: true,
                // No output is necessary for the command line itself.
            };
        }
    };

    // Register the command with the system.
    if (typeof CommandRegistry !== 'undefined') {
        CommandRegistry.registerCommand(codeCommandDefinition);
    }
})();