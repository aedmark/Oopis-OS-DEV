// scripts/commands/mkdir.js
(() => {
    "use strict";

    const mkdirCommandDefinition = {
        commandName: "mkdir",
        description: "Creates one or more new directories.",
        helpText: `Usage: mkdir [OPTION]... <DIRECTORY>...

Create the DIRECTORY(ies), if they do not already exist.

DESCRIPTION
       The mkdir command creates one or more new directories with the
       specified names.

OPTIONS
       -p, --parents
              Create parent directories as needed. If this option is not
              specified, the full path prefix of each operand must already
              exist.

EXAMPLES
       mkdir documents
              Creates a new directory named 'documents' in the current
              directory.

       mkdir -p projects/assets/images
              Creates the 'projects', 'assets', and 'images' directories
              if they do not already exist.`,
        completionType: "paths",
        flagDefinitions: [
            {
                name: "parents",
                short: "-p",
                long: "--parents",
            },
        ],
        argValidation: {
            min: 1,
        },
        coreLogic: async (context) => {
            const { args, flags, currentUser } = context;
            let allSuccess = true;
            const messages = [];
            let changesMade = false;
            const nowISO = new Date().toISOString();

            try {
                const primaryGroup = UserManager.getPrimaryGroupForUser(currentUser);
                if (!primaryGroup) {
                    return {
                        success: false,
                        error: `mkdir: critical - could not determine primary group for user '${currentUser}'`,
                    };
                }

                for (const pathArg of args) {
                    const resolvedPath = FileSystemManager.getAbsolutePath(pathArg);
                    const dirName = resolvedPath.substring(resolvedPath.lastIndexOf('/') + 1);

                    if (resolvedPath === '/' || dirName === "" || dirName === "." || dirName === "..") {
                        messages.push(`mkdir: cannot create directory '${pathArg}': Invalid path or name`);
                        allSuccess = false;
                        continue;
                    }

                    const parentPathForTarget = resolvedPath.substring(0, resolvedPath.lastIndexOf('/')) || '/';
                    let parentNodeToCreateIn;

                    if (flags.parents) {
                        const parentDirResult = FileSystemManager.createParentDirectoriesIfNeeded(resolvedPath);
                        if (parentDirResult.error) {
                            messages.push(`mkdir: ${parentDirResult.error}`);
                            allSuccess = false;
                            continue;
                        }
                        parentNodeToCreateIn = parentDirResult.parentNode;
                    } else {
                        const parentValidation = FileSystemManager.validatePath(parentPathForTarget, { expectedType: 'directory', permissions: ['write'] });
                        if (parentValidation.error) {
                            messages.push(`mkdir: cannot create directory '${pathArg}': ${parentValidation.error.replace(parentPathForTarget + ':', '').trim()}`);
                            allSuccess = false;
                            continue;
                        }
                        parentNodeToCreateIn = parentValidation.node;
                    }

                    if (parentNodeToCreateIn.children && parentNodeToCreateIn.children[dirName]) {
                        const existingItem = parentNodeToCreateIn.children[dirName];
                        if (existingItem.type === 'file') {
                            messages.push(`mkdir: cannot create directory '${pathArg}': File exists`);
                            allSuccess = false;
                        } else if (existingItem.type === 'directory' && !flags.parents) {
                            // This is not an error, just do nothing.
                        }
                    } else {
                        parentNodeToCreateIn.children[dirName] = FileSystemManager._createNewDirectoryNode(currentUser, primaryGroup);
                        parentNodeToCreateIn.mtime = nowISO;
                        changesMade = true;
                    }
                }

                if (changesMade && !(await FileSystemManager.save())) {
                    allSuccess = false;
                    messages.unshift("mkdir: Failed to save file system changes.");
                }

                if (!allSuccess) {
                    return {
                        success: false,
                        error: messages.join("\\n"),
                    };
                }
                return {
                    success: true,
                    output: "",
                };
            } catch (e) {
                return { success: false, error: `mkdir: An unexpected error occurred: ${e.message}` };
            }
        },
    };
    CommandRegistry.register(mkdirCommandDefinition);
})();