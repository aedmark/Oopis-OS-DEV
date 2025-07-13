// scripts/commands/chidi.js

(() => {
    "use strict";

    /**
     * Finds all supported files for analysis starting from a given path.
     * It recursively searches directories and collects files with supported extensions.
     * @param {string} startPath - The absolute path to start the search from.
     * @param {object} startNode - The filesystem node corresponding to the startPath.
     * @param {string} currentUser - The name of the user initiating the action.
     * @returns {Promise<Array<object>>} A promise that resolves to an array of file objects.
     */
    async function _getFilesForAnalysis(startPath, startNode, currentUser) {
        const files = [];
        const visited = new Set();
        const SUPPORTED_EXTENSIONS = new Set(['md', 'txt', 'js', 'sh']);

        async function recurse(currentPath, node) {
            if (visited.has(currentPath)) return;
            visited.add(currentPath);

            // Respect file system permissions
            if (!FileSystemManager.hasPermission(node, currentUser, "read")) return;

            if (node.type === Config.FILESYSTEM.DEFAULT_FILE_TYPE) {
                if (SUPPORTED_EXTENSIONS.has(Utils.getFileExtension(currentPath))) {
                    files.push({
                        name: currentPath.split('/').pop(),
                        path: currentPath,
                        content: node.content || ''
                    });
                }
            } else if (node.type === Config.FILESYSTEM.DEFAULT_DIRECTORY_TYPE) {
                // Also need execute permission to traverse a directory
                if (!FileSystemManager.hasPermission(node, currentUser, "execute")) return;
                for (const childName of Object.keys(node.children || {})) {
                    await recurse(FileSystemManager.getAbsolutePath(childName, currentPath), node.children[childName]);
                }
            }
        }

        await recurse(startPath, startNode);
        return files;
    }

    const chidiCommandDefinition = {
        commandName: "chidi",
        completionType: "paths",
        flagDefinitions: [
            {name: "new", short: "-n", long: "--new"},
            {name: "provider", short: "-p", long: "--provider", takesValue: true},
            {name: "model", short: "-m", long: "--model", takesValue: true},
        ],
        argValidation: {
            max: 1,
            error: "Usage: chidi [-n] [path] or <command> | chidi [-n]"
        },
        pathValidation: [{argIndex: 0, optional: true, options: {allowMissing: false}}],
        permissionChecks: [{pathArgIndex: 0, permissions: ["read"]}],

        coreLogic: async (context) => {
            const {args, flags, currentUser, validatedPaths, options} = context;

            if (!options.isInteractive) {
                return {success: false, error: "chidi: Can only be run in interactive mode."};
            }

            // CORRECTED LOGIC: Determine the provider before checking for the API key.
            const provider = flags.provider || 'gemini';

            // CORRECTED LOGIC: Only check for the Gemini API key if the 'gemini' provider is being used.
            if (provider === 'gemini' && !StorageManager.loadItem(Config.STORAGE_KEYS.GEMINI_API_KEY)) {
                return {
                    success: false,
                    error: "chidi: Gemini API key not set for the 'gemini' provider. Please run 'gemini' once to set it."
                };
            }

            let files = [];
            let hadErrors = false;
            const SUPPORTED_EXTENSIONS = new Set(['md', 'txt', 'js', 'sh']);

            if (options.stdinContent) {
                if (args.length > 0) return {
                    success: false,
                    error: "chidi: does not accept file arguments when receiving piped input."
                };

                const pathsFromPipe = options.stdinContent.trim().split('\n');
                for (const path of pathsFromPipe) {
                    if (!path.trim()) continue;
                    const pathValidation = FileSystemManager.validatePath("chidi (pipe)", path, {expectedType: 'file'});
                    if (pathValidation.error || !FileSystemManager.hasPermission(pathValidation.node, currentUser, "read")) {
                        hadErrors = true;
                        continue;
                    }
                    if (SUPPORTED_EXTENSIONS.has(Utils.getFileExtension(pathValidation.resolvedPath))) {
                        files.push({
                            name: pathValidation.resolvedPath.split('/').pop(),
                            path: pathValidation.resolvedPath,
                            content: pathValidation.node.content || ''
                        });
                    }
                }
            } else {
                const startPath = args.length > 0 ? validatedPaths[0].resolvedPath : FileSystemManager.getCurrentPath();
                const startNode = args.length > 0 ? validatedPaths[0].node : FileSystemManager.getNodeByPath(startPath);
                if (!startNode) return {success: false, error: "chidi: Cannot access specified path."};
                files = await _getFilesForAnalysis(startPath, startNode, currentUser);
            }

            if (files.length === 0) {
                return {success: true, output: `No supported files (.md, .txt, .js, .sh) found to open.`};
            }

            ChidiManager.launch(files, {
                isNewSession: flags.new,
                provider: provider, // Use the determined provider
                model: flags.model
            });

            return {success: !hadErrors, output: ""};
        }
    };

    const chidiDescription = "Opens the Chidi AI-powered document and code analyst.";

    const chidiHelpText = `Usage: chidi [-n] [-p provider] [-m model] [path]
       <command> | chidi

Opens the Chidi AI-powered document and code analyst.

DESCRIPTION
       Chidi is a powerful graphical tool that leverages a Large Language
       Model (LLM) to help you understand and interact with your files.
       It can summarize documents, suggest insightful questions, and answer
       your questions based on the content of the files you provide.

       You can launch Chidi on a specific file or directory, or pipe a list
       of file paths to it (e.g., from 'find').

MODES OF OPERATION
    1.  Directory/File Mode:
        Run 'chidi [path]' to analyze a specific file or all supported
        files within a directory and its subdirectories. If no path is
        given, it uses the current directory.

    2.  Piped Mode:
        Pipe the output of another command to Chidi to create a custom
        set of files for analysis. This is useful for analyzing files
        that are scattered across different locations.

PROVIDERS & MODELS
       -p, --provider <name>
              Specify the AI provider to use (e.g., 'gemini', 'ollama').
              If not specified, it defaults to 'gemini'. Using a local
              provider like 'ollama' does not require an API key.

       -m, --model <name>
              Specify a particular model for the chosen provider (e.g.,
              'llama3' for ollama). If not specified, the provider's
              default model is used.

OPTIONS
       -n, --new
              Starts a new, fresh conversation, clearing any previous
              conversational memory from the current session.

SUPPORTED FILE TYPES
       Chidi can analyze text-based files with the following extensions:
       .md, .txt, .js, .sh

EXAMPLES
       chidi ./docs
              Opens Chidi and loads all supported files from the 'docs'
              directory for analysis.

       chidi -p ollama ./src
              Opens Chidi using the local 'ollama' provider to analyze
              the 'src' directory, avoiding the need for a Gemini API key.

       find . -name "*.js" | chidi
              Finds all JavaScript files in the current directory and its
              subdirectories, then opens Chidi with that specific list
              of files for analysis.`;

    CommandRegistry.register("chidi", chidiCommandDefinition, chidiDescription, chidiHelpText);
})();