(() => {
    "use strict";

    const codeCommandDefinition = {
        commandName: "code",
        argValidation: {
            max: 1,
            error: "Usage: code [filepath]"
        },
        pathValidation: [{
            argIndex: 0,
            optional: true,
            options: {
                allowMissing: true,
                expectedType: 'file'
            }
        }],
        coreLogic: async (context) => {
            const {args, options, currentUser, validatedPaths} = context;

            if (!options.isInteractive) {
                return {success: false, error: "code: Can only be run in an interactive session."};
            }

            if (typeof CodeManager === 'undefined' || typeof CodeUI === 'undefined') {
                return {success: false, error: "code: The Code Editor application modules are not loaded."};
            }

            const pathArg = args.length > 0 ? args[0] : null;
            let fileNode = null;
            let resolvedPath = null;

            if (pathArg) {
                const pathInfo = validatedPaths[0];
                if (pathInfo.error) {
                    return {success: false, error: `code: ${pathInfo.error}`};
                }
                if (pathInfo.node && !FileSystemManager.hasPermission(pathInfo.node, currentUser, "read")) {
                    return {success: false, error: `code: cannot read file '${pathArg}': Permission denied`};
                }
                fileNode = pathInfo.node;
                resolvedPath = pathInfo.resolvedPath;
            }

            const fileContent = fileNode ? fileNode.content : "";
            CodeManager.enter(resolvedPath, fileContent);

            return {success: true, output: ""};
        }
    };

    const codeDescription = "Opens a syntax-highlighting code editor.";
    const codeHelpText = `Usage: code [filepath]\n\nLaunches the OopisOS Code Editor.\n\nDESCRIPTION\n       The 'code' command opens a dedicated, full-screen modal application for\n       viewing and editing code files. It provides syntax highlighting for\n       various languages, powered by Prism.js.\n\n       - If a filepath is provided, it opens that file.\n       - If the file does not exist, a new empty file will be created with that name upon saving.\n       - If no filepath is given, it opens a new, untitled document.\n\nKEYBOARD SHORTCUTS\n       Ctrl+S: Save       Ctrl+O: Exit\n       Ctrl+Z: Undo       Ctrl+Y: Redo`;

    CommandRegistry.register("code", codeCommandDefinition, codeDescription, codeHelpText);
})();