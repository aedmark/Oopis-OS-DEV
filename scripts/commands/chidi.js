(() => {
    "use strict";

    async function _getFilesForAnalysis(startPath, startNode, currentUser) {
        const files = [];
        const visited = new Set();
        const SUPPORTED_EXTENSIONS = new Set(['md', 'txt', 'js', 'sh']);

        async function recurse(currentPath, node) {
            if (visited.has(currentPath)) return;
            visited.add(currentPath);

            if (!FileSystemManager.hasPermission(node, currentUser, "read")) {
                return;
            }

            if (node.type === Config.FILESYSTEM.DEFAULT_FILE_TYPE) {
                const extension = Utils.getFileExtension(currentPath);
                if (SUPPORTED_EXTENSIONS.has(extension)) {
                    files.push({
                        name: currentPath.split('/').pop(),
                        path: currentPath,
                        content: node.content || ''
                    });
                }
            } else if (node.type === Config.FILESYSTEM.DEFAULT_DIRECTORY_TYPE) {
                if (!FileSystemManager.hasPermission(node, currentUser, "execute")) {
                    return;
                }
                for (const childName of Object.keys(node.children || {})) {
                    const childNode = node.children[childName];
                    const childPath = FileSystemManager.getAbsolutePath(childName, currentPath);
                    await recurse(childPath, childNode);
                }
            }
        }

        await recurse(startPath, startNode);
        return files;
    }

    const chidiCommandDefinition = {
        commandName: "chidi",
        flagDefinitions: [{
            name: "new",
            short: "-n",
            long: "--new"
        }],
        argValidation: {
            max: 1,
            error: "Usage: chidi [-n] [path] or <command> | chidi [-n]"
        },
        pathValidation: [{
            argIndex: 0,
            optional: true,
            options: {
                allowMissing: false
            }
        }],
        permissionChecks: [{
            pathArgIndex: 0,
            permissions: ["read"]
        }],
        coreLogic: async (context) => {
            const {
                args,
                flags,
                currentUser,
                validatedPaths,
                options
            } = context;

            if (!options.isInteractive) {
                return {
                    success: false,
                    error: "chidi: Can only be run in interactive mode."
                };
            }

            let apiKey = StorageManager.loadItem(Config.STORAGE_KEYS.GEMINI_API_KEY, "Gemini API Key");
            if (!apiKey) {
                const keyResult = await new Promise(resolve => {
                    ModalInputManager.requestInput(
                        "A Gemini API key is required for Chidi. Please enter your key:",
                        (providedKey) => {
                            if (!providedKey || providedKey.trim() === "") {
                                resolve({
                                    success: false,
                                    error: "API key entry cancelled or empty."
                                });
                                return;
                            }
                            StorageManager.saveItem(Config.STORAGE_KEYS.GEMINI_API_KEY, providedKey, "Gemini API Key");
                            OutputManager.appendToOutput("API Key saved. Launching Chidi...", {
                                typeClass: Config.CSS_CLASSES.SUCCESS_MSG
                            });
                            resolve({
                                success: true,
                                key: providedKey
                            });
                        },
                        () => {
                            resolve({
                                success: false,
                                error: "API key entry cancelled."
                            });
                        },
                        false,
                        options
                    );
                });

                if (!keyResult.success) {
                    return {
                        success: false,
                        error: `chidi: ${keyResult.error}`
                    };
                }
            }

            let files = [];
            let hadErrors = false;
            const SUPPORTED_EXTENSIONS = new Set(['md', 'txt', 'js', 'sh']);

            if (options.stdinContent) {
                if (args.length > 0) {
                    return {
                        success: false,
                        error: "chidi: does not accept file arguments when receiving piped input."
                    };
                }
                const pathsFromPipe = options.stdinContent.trim().split('\n');
                for (const path of pathsFromPipe) {
                    if (!path.trim()) continue;

                    const pathValidation = FileSystemManager.validatePath("chidi (pipe)", path, {
                        expectedType: 'file'
                    });
                    if (pathValidation.error) {
                        await OutputManager.appendToOutput(`chidi: skipping '${path}': ${pathValidation.error}`, {
                            typeClass: Config.CSS_CLASSES.WARNING_MSG
                        });
                        hadErrors = true;
                        continue;
                    }

                    const node = pathValidation.node;
                    if (!FileSystemManager.hasPermission(node, currentUser, "read")) {
                        await OutputManager.appendToOutput(`chidi: skipping '${path}': Permission denied`, {
                            typeClass: Config.CSS_CLASSES.WARNING_MSG
                        });
                        hadErrors = true;
                        continue;
                    }

                    const extension = Utils.getFileExtension(pathValidation.resolvedPath);
                    if (SUPPORTED_EXTENSIONS.has(extension)) {
                        files.push({
                            name: pathValidation.resolvedPath.split('/').pop(),
                            path: pathValidation.resolvedPath,
                            content: node.content || ''
                        });
                    }
                }
            } else {
                let startPath;
                let startNode;

                if (args.length === 0) {
                    startPath = FileSystemManager.getCurrentPath();
                    startNode = FileSystemManager.getNodeByPath(startPath);
                    if (!startNode) {
                        return {
                            success: false,
                            error: "chidi: Critical error - cannot access current working directory."
                        };
                    }
                } else {
                    const pathInfo = validatedPaths[0];
                    startNode = pathInfo.node;
                    startPath = pathInfo.resolvedPath;
                }

                try {
                    files = await _getFilesForAnalysis(startPath, startNode, currentUser);
                } catch (error) {
                    return {
                        success: false,
                        error: `chidi: ${error.message}`
                    };
                }
            }

            if (files.length === 0) {
                return {
                    success: true,
                    output: `No supported files (.md, .txt, .js, .sh) found to open.`
                };
            }

            await new Promise(resolve => {
                ChidiApp.launch(files, {
                    onExit: resolve,
                    isNewSession: flags.new
                });
            });

            return {
                success: !hadErrors,
                output: ""
            };

        }
    };

    const description = "Opens the Chidi.md document and code analyst.";
    const helpText = `
Usage: chidi [-n] [path] | <command> | chidi [-n]

DESCRIPTION
    Launches a modal application to read and analyze documents. Chidi
    supports Markdown (.md), text (.txt), JavaScript (.js), and shell
    scripts (.sh). For code files, it analyzes the comments.

    In the first form, 'chidi' will recursively find all supported files
    within the optional [path] (or the current directory if no path is given).

    In the second form, 'chidi' reads a newline-separated list of file
    paths from standard input (e.g., from 'find') and uses that as its
    corpus.

OPTIONS
    -n, --new
          Start a new session. This clears any cached state in the application.

EXAMPLES
    chidi /src
        Opens all supported documents found inside the /src directory.

    find . -name "*.js" | chidi
        Opens all .js files found by the 'find' command for analysis.
`;

    CommandRegistry.register(chidiCommandDefinition.commandName, chidiCommandDefinition, description, helpText);
})();