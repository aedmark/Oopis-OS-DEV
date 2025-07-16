// scripts/commands/paint.js
(() => {
    "use strict";

    const paintCommandDefinition = {
        commandName: "paint",
        completionType: "paths",
        argValidation: {
            max: 1,
            error: "Usage: paint [filename.oopic]"
        },
        pathValidation: { // Added contract for the executor
            argIndex: 0,
            options: { allowMissing: true, expectedType: 'file' },
            permissions: ['read'],
            required: false // path is optional
        },
        coreLogic: async (context) => {
            const { args, options, node, resolvedPath } = context;

            try {
                if (!options.isInteractive) {
                    return { success: false, error: "paint: Can only be run in interactive mode." };
                }

                if (typeof PaintManager === 'undefined' || typeof PaintUI === 'undefined') {
                    return {
                        success: false,
                        error: "paint: The Paint application module is not loaded."
                    };
                }

                const pathArg = args.length > 0 ? args[0] : `untitled-${new Date().getTime()}.oopic`;
                const filePath = resolvedPath || FileSystemManager.getAbsolutePath(pathArg);

                if (Utils.getFileExtension(filePath) !== 'oopic') {
                    return { success: false, error: `paint: can only edit .oopic files.` };
                }

                const fileContent = node ? node.content || "" : "";

                PaintManager.enter(filePath, fileContent);

                return {
                    success: true,
                    output: ""
                };
            } catch (e) {
                return { success: false, error: `paint: An unexpected error occurred: ${e.message}` };
            }
        }
    };

    const paintDescription = "Opens the character-based art editor.";
    const paintHelpText = `Usage: paint [filename.oopic]

Launch the OopisOS character-based art editor.

DESCRIPTION
       The paint command opens a full-screen, grid-based editor for
       creating ASCII and ANSI art. The canvas is 80 characters wide
       by 24 characters high.

       If a <filename> is provided, it will be opened. If it does not
       exist, it will be created upon saving. Files must have the
       '.oopic' extension.

KEYBOARD SHORTCUTS
       P - Pencil      E - Eraser      L - Line      R - Rect
       G - Toggle Grid
       1-7 - Select Color (Red, Green, Blue, Yellow, Magenta, Cyan, White)

       Ctrl+S - Save and Exit
       Ctrl+O - Exit (prompts if unsaved)
       Ctrl+Z - Undo
       Ctrl+Y - Redo`;

    CommandRegistry.register("paint", paintCommandDefinition, paintDescription, paintHelpText);
})();