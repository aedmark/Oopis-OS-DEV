// scripts/commands/cd.js
(() => {
    "use strict";

    const cdCommandDefinition = {
        commandName: "cd",
        argValidation: {
            exact: 1,
            error: "incorrect number of arguments",
        },
        coreLogic: async (context) => {
            const { args, currentUser, options } = context;
            const pathArg = args[0];

            // 1. Resolve Path
            const resolvedPath = FileSystemManager.getAbsolutePath(pathArg);

            // 2. Retrieve Node (checks execute permissions during traversal)
            const node = FileSystemManager.getNodeByPath(resolvedPath);

            // 3. Validate Existence
            if (!node) {
                return { success: false, error: `cd: ${pathArg}: No such file or directory` };
            }

            // 4. Validate Type
            if (node.type !== 'directory') {
                return { success: false, error: `cd: ${pathArg}: Not a directory` };
            }

            // 5. Final Permission Check (already done by getNodeByPath, but good for clarity)
            if (!FileSystemManager.hasPermission(node, currentUser, "execute")) {
                return { success: false, error: `cd: ${pathArg}: Permission denied` };
            }

            // 6. Execute Logic
            if (FileSystemManager.getCurrentPath() === resolvedPath) {
                return {
                    success: true,
                    output: `${Config.MESSAGES.ALREADY_IN_DIRECTORY_PREFIX}${resolvedPath}${Config.MESSAGES.ALREADY_IN_DIRECTORY_SUFFIX} ${Config.MESSAGES.NO_ACTION_TAKEN}`,
                    messageType: Config.CSS_CLASSES.CONSOLE_LOG_MSG,
                };
            }

            FileSystemManager.setCurrentPath(resolvedPath);

            if (options.isInteractive) {
                TerminalUI.updatePrompt();
            }

            return {
                success: true,
                output: "",
            };
        },
    };

    const cdDescription = "Changes the current working directory.";
    const cdHelpText = `Usage: cd <directory>

Change the current working directory.

DESCRIPTION
       The cd command changes the current working directory of the shell
       to the specified <directory>.

       The command recognizes special directory names:
       .      Refers to the current directory.
       ..     Refers to the parent directory of the current directory.

       Absolute paths (starting with /) and relative paths are supported.

EXAMPLES
       cd /home/Guest
              Changes the current directory to /home/Guest.

       cd ../..
              Moves up two directory levels from the current location.

PERMISSIONS
       To change into a directory, the user must have 'execute' (x)
       permissions on that directory.`;

    CommandRegistry.register("cd", cdCommandDefinition, cdDescription, cdHelpText);
})();