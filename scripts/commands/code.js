/**
 * code.js
 *
 * The user-facing entry point for the 'code' command.
 * It validates input and launches the main Code Editor application.
 */
'use strict';

(function () {
    // The core definition object, now stripped of metadata which is passed separately.
    const codeCommandDefinition = {
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
            CodeManager.enter(filePath, fileContent);

            return {
                success: true,
            };
        }
    };

    // The metadata is now defined separately, following the correct pattern.
    const codeDescription = 'Opens a file in the Code editor. A new file is created if the path does not exist.';
    const codeHelpText = `Usage: code [file_path]

Opens the specified file in a dedicated code editor with syntax highlighting.
If no file path is provided, it opens an empty, untitled editor.

The editor supports syntax highlighting for JavaScript (.js) and Markdown (.md) files.`;

    // The correct registration method, as shown in the 'help.js' example.
    if (typeof CommandRegistry !== 'undefined') {
        CommandRegistry.register("code", codeCommandDefinition, codeDescription, codeHelpText);
    }
})();