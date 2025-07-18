// scripts/commands/edit.js
(() => {
    "use strict";

    const editCommandDefinition = {
        commandName: "edit",
        dependencies: [
            'apps/editor/editor_ui.js',
            'apps/editor/editor_manager.js'
        ],
        description: "A powerful, context-aware text and code editor.",
        helpText: `Usage: edit [filepath]

Launches the OopisOS text editor.

DESCRIPTION
       The 'edit' command opens a powerful, full-screen modal application for creating
       and editing files. It intelligently adapts its interface based on the file type.

       - If a filepath is provided, it opens that file.
       - If the file does not exist, a new empty file will be created with that name upon saving.
       - If no filepath is given, it opens a new, untitled document.

MODES
       - Markdown (.md): Activates a live preview and a formatting toolbar.
       - HTML (.html): Activates a live, sandboxed preview of the rendered HTML.
       - Other (e.g., .txt, .js, .sh): Provides a clean, standard text editing experience.

KEYBOARD SHORTCUTS
       Ctrl+S: Save       Ctrl+O: Exit
       Ctrl+P: Toggle Preview`,
        completionType: "paths",
        argValidation: {
            max: 1,
            error: "Usage: edit [filepath]"
        },
        pathValidation: {
            argIndex: 0,
            options: { allowMissing: true, expectedType: 'file' },
            permissions: ['read'],
            required: false
        },
        coreLogic: async (context) => {
            const { options, resolvedPath, node } = context;

            try {
                if (!options.isInteractive) {
                    return ErrorHandler.createError("edit: Can only be run in interactive mode.");
                }

                if (typeof Editor === 'undefined' || typeof EditorUI === 'undefined' || typeof App === 'undefined') {
                    return ErrorHandler.createError("edit: The editor application modules are not loaded.");
                }

                const fileContent = node ? node.content || "" : "";

                AppLayerManager.show(Editor, { filePath: resolvedPath, fileContent });

                return ErrorHandler.createSuccess("");
            } catch (e) {
                return ErrorHandler.createError(`edit: An unexpected error occurred: ${e.message}`);
            }
        }
    };
    CommandRegistry.register(editCommandDefinition);
})();