// scripts/commands/mv.js
(() => {
    "use strict";

    const mvCommandDefinition = {
        commandName: "mv",
        completionType: "paths",
        flagDefinitions: [
            { name: "force", short: "-f", long: "--force" },
            { name: "interactive", short: "-i", long: "--interactive" },
        ],
        argValidation: {
            min: 2,
            error: "Usage: mv [OPTION]... <source> <destination> or mv [OPTION]... <source>... <directory>",
        },
        coreLogic: async (context) => {
            const { args, currentUser, flags, options } = context;
            const nowISO = new Date().toISOString();
            let changesMade = false;

            try {
                const destPathArg = args.pop();
                const sourcePathArgs = args;

                // Centralized validation for the destination
                const destValidation = FileSystemManager.validatePath(destPathArg, { allowMissing: true });
                const isDestADirectory = destValidation.node && destValidation.node.type === 'directory';

                if (sourcePathArgs.length > 1 && !isDestADirectory) {
                    return { success: false, error: `mv: target '${destPathArg}' is not a directory` };
                }

                for (const sourcePathArg of sourcePathArgs) {
                    // Centralized validation for each source
                    const sourceValidation = FileSystemManager.validatePath(sourcePathArg);
                    if (sourceValidation.error) {
                        return { success: false, error: `mv: ${sourceValidation.error}` };
                    }

                    const { node: sourceNode, resolvedPath: sourceAbsPath } = sourceValidation;

                    if (sourceAbsPath === '/') {
                        return { success: false, error: "mv: cannot move root directory" };
                    }

                    const sourceName = sourceAbsPath.substring(sourceAbsPath.lastIndexOf('/') + 1);
                    const sourceParentPath = sourceAbsPath.substring(0, sourceAbsPath.lastIndexOf('/')) || '/';

                    // Centralized validation for the source's parent directory
                    const sourceParentValidation = FileSystemManager.validatePath(sourceParentPath, {expectedType: 'directory', permissions: ['write']});
                    if (sourceParentValidation.error) {
                        return { success: false, error: `mv: cannot move '${sourcePathArg}': Permission denied in source directory` };
                    }
                    const sourceParentNode = sourceParentValidation.node;

                    let finalDestPath;
                    let targetContainerNode;
                    let finalDestName;

                    if (isDestADirectory) {
                        finalDestName = sourceName;
                        targetContainerNode = destValidation.node;
                        finalDestPath = FileSystemManager.getAbsolutePath(finalDestName, destValidation.resolvedPath);
                    } else {
                        finalDestName = destValidation.resolvedPath.substring(destValidation.resolvedPath.lastIndexOf('/') + 1);
                        const destParentPath = destValidation.resolvedPath.substring(0, destValidation.resolvedPath.lastIndexOf('/')) || '/';
                        const destParentValidation = FileSystemManager.validatePath(destParentPath, {expectedType: 'directory', permissions: ['write']});
                        if (destParentValidation.error){
                            return { success: false, error: `mv: ${destParentValidation.error}` };
                        }
                        targetContainerNode = destParentValidation.node;
                        finalDestPath = destValidation.resolvedPath;
                    }

                    if (sourceAbsPath === finalDestPath) {
                        continue; // Nothing to do
                    }

                    if (sourceNode.type === 'directory' && finalDestPath.startsWith(sourceAbsPath + '/')) {
                        return { success: false, error: `mv: cannot move '${sourcePathArg}' to a subdirectory of itself, '${finalDestPath}'` };
                    }

                    const existingNodeAtDest = targetContainerNode.children[finalDestName];
                    if (existingNodeAtDest) {
                        const isPromptRequired = flags.interactive || (options.isInteractive && !flags.force);
                        if (isPromptRequired) {
                            const confirmed = await new Promise((resolve) => {
                                ModalManager.request({
                                    context: "terminal",
                                    messageLines: [`Overwrite '${finalDestPath}'?`],
                                    onConfirm: () => resolve(true),
                                    onCancel: () => resolve(false),
                                    options,
                                });
                            });
                            if (!confirmed) {
                                continue;
                            }
                        }
                    }

                    const movedNode = Utils.deepCopyNode(sourceNode);
                    movedNode.mtime = nowISO;
                    targetContainerNode.children[finalDestName] = movedNode;
                    targetContainerNode.mtime = nowISO;
                    delete sourceParentNode.children[sourceName];
                    sourceParentNode.mtime = nowISO;
                    changesMade = true;
                }

                if (changesMade && !(await FileSystemManager.save())) {
                    return { success: false, error: "mv: Failed to save file system changes." };
                }

                return { success: true, output: "" };
            } catch (e) {
                return { success: false, error: `mv: An unexpected error occurred: ${e.message}` };
            }
        }
    };

    const mvDescription = "Move or rename files and directories.";
    const mvHelpText = `Usage: mv [OPTION]... <source> <destination>
       mv [OPTION]... <source>... <directory>

Rename SOURCE to DEST, or move SOURCE(s) to DIRECTORY.

DESCRIPTION
       The mv command renames the file or directory at <source> to the
       name given by <destination>, or moves it into an existing
       <directory>.

       If the last argument is an existing directory, all preceding
       source files and directories are moved inside of it.

OPTIONS
       -f, --force
              Do not prompt before overwriting. This option overrides a
              previous -i option.

       -i, --interactive
              Prompt before overwriting an existing file.

EXAMPLES
       mv old_name.txt new_name.txt
              Renames 'old_name.txt' to 'new_name.txt'.

       mv report.txt notes.txt /home/Guest/documents/
              Moves both 'report.txt' and 'notes.txt' into the 
              'documents' directory.`;

    CommandRegistry.register("mv", mvCommandDefinition, mvDescription, mvHelpText);
})();