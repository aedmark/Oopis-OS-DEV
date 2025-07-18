// scripts/commands/rmdir.js
(() => {
    "use strict";

    const rmdirCommandDefinition = {
        commandName: "rmdir",
        description: "Removes empty directories.",
        helpText: `Usage: rmdir [DIRECTORY]...

Remove the DIRECTORY(ies), if they are empty.

DESCRIPTION
       The rmdir command removes empty directories from the filesystem.
       This command provides a safe way to clean up directory structures,
       as it will fail rather than delete a directory that still contains
       files or other subdirectories.

EXAMPLES
       rmdir old_project/
              Removes the 'old_project' directory, but only if it is empty.

SEE ALSO
       rm(1)`,
        completionType: "paths",
        argValidation: {
            min: 1,
            error: "missing operand"
        },
        pathValidation: {
            argIndex: 0,
            options: { expectedType: 'directory' },
            permissions: []
        },
        coreLogic: async (context) => {
            const { args, currentUser, node, resolvedPath } = context;
            const pathArg = args[0];

            try {
                if (Object.keys(node.children).length > 0) {
                    return ErrorHandler.createError(`rmdir: failed to remove '${pathArg}': Directory not empty`);
                }

                const parentPath = resolvedPath.substring(0, resolvedPath.lastIndexOf('/')) || '/';
                const parentNode = FileSystemManager.getNodeByPath(parentPath);

                if (!FileSystemManager.hasPermission(parentNode, currentUser, "write")) {
                    return ErrorHandler.createError(`rmdir: failed to remove '${pathArg}': Permission denied`);
                }

                const dirName = resolvedPath.split('/').pop();
                delete parentNode.children[dirName];
                parentNode.mtime = new Date().toISOString();

                await FileSystemManager.save();

                return ErrorHandler.createSuccess("");
            } catch (e) {
                return ErrorHandler.createError(`rmdir: An unexpected error occurred: ${e.message}`);
            }
        }
    };
    CommandRegistry.register(rmdirCommandDefinition);
})();