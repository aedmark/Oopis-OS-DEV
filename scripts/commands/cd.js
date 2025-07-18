// scripts/commands/cd.js
(() => {
    "use strict";

    const cdCommandDefinition = {
        commandName: "cd",
        description: "Changes the current working directory.",
        helpText: `Usage: cd <directory>

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
       permissions on that directory.`,
        completionType: "paths",
        argValidation: {
            exact: 1,
            error: "incorrect number of arguments",
        },
        coreLogic: async (context) => {
            const { args, options } = context;
            const pathArg = args[0];

            try {
                const pathValidationResult = FileSystemManager.validatePath(pathArg, {
                    expectedType: 'directory',
                    permissions: ['execute']
                });

                if (!pathValidationResult.success) {
                    return ErrorHandler.createError(`cd: ${pathValidationResult.error.replace(pathArg + ':', '').trim()}`);
                }
                const { resolvedPath } = pathValidationResult.data;

                if (FileSystemManager.getCurrentPath() === resolvedPath) {
                    return ErrorHandler.createSuccess("");
                }

                FileSystemManager.setCurrentPath(resolvedPath);

                if (options.isInteractive) {
                    TerminalUI.updatePrompt();
                }

                return ErrorHandler.createSuccess("");
            } catch (e) {
                return ErrorHandler.createError(`cd: An unexpected error occurred: ${e.message}`);
            }
        },
    };
    CommandRegistry.register(cdCommandDefinition);
})();