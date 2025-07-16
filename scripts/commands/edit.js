// scripts/commands/edit.js
(() => {
    "use strict";

    const editCommandDefinition = {
        commandName: "edit",
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
                    return { success: false, error: "edit: Can only be run in interactive mode." };
                }

                if (typeof EditorManager === 'undefined' || typeof EditorUI === 'undefined') {
                    return { success: false, error: "edit: The editor application modules are not loaded." };
                }

                const fileContent = node ? node.content || "" : "";

                EditorManager.enter(resolvedPath, fileContent);

                return { success: true, output: "" };
            } catch (e) {
                return { success: false, error: `edit: An unexpected error occurred: ${e.message}` };
            }
        }
    };

    const editDescription = "A powerful, context-aware text, code, and markdown editor.";
    const editHelpText = `Usage: edit [filepath]

Launches the OopisOS universal editor.

DESCRIPTION
       The 'edit' command opens a powerful, full-screen modal application for creating
       and editing files. It intelligently adapts its interface and features based on the file type.

       - If a filepath is provided, it opens that file.
       - If the file does not exist, a new empty file will be created with that name upon saving.
       - If no filepath is given, it opens a new, untitled document.

MODES
       - Code (.js, .sh, etc.): Activates syntax highlighting and developer-focused features.
       - Markdown (.md): Activates a live preview and a formatting toolbar.
       - HTML (.html): Activates a live, sandboxed preview of the rendered HTML.
       - Plain Text (.txt): Provides a clean, standard text editing experience.

KEYBOARD SHORTCUTS
       Ctrl+S: Save       Ctrl+O: Exit
       Ctrl+P: Toggle Preview    Ctrl+B: Bold (Markdown)
       Ctrl+I: Italic (Markdown) Ctrl+K: Insert Link (Markdown)`;

    CommandRegistry.register("edit", editCommandDefinition, editDescription, editHelpText);
})();