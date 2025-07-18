// scripts/commands/mv.js
(() => {
    "use strict";

    const mvCommandDefinition = {
        commandName: "mv",
        description: "Move or rename files and directories.",
        helpText: `Usage: mv [OPTION]... <source> <destination>
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
              'documents' directory.`,
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

                const destValidationResult = FileSystemManager.validatePath(destPathArg, { allowMissing: true });
                if (!destValidationResult.success && destValidationResult.data?.node === undefined) {
                    return ErrorHandler.createError(`mv: ${destValidationResult.error}`);
                }
                const destValidation = destValidationResult.data;
                const isDestADirectory = destValidation.node && destValidation.node.type === 'directory';

                if (sourcePathArgs.length > 1 && !isDestADirectory) {
                    return ErrorHandler.createError(`mv: target '${destPathArg}' is not a directory`);
                }

                for (const sourcePathArg of sourcePathArgs) {
                    const sourceValidationResult = FileSystemManager.validatePath(sourcePathArg);
                    if (!sourceValidationResult.success) {
                        return ErrorHandler.createError(`mv: ${sourceValidationResult.error}`);
                    }
                    const { node: sourceNode, resolvedPath: sourceAbsPath } = sourceValidationResult.data;


                    if (sourceAbsPath === '/') {
                        return ErrorHandler.createError("mv: cannot move root directory");
                    }

                    const sourceName = sourceAbsPath.substring(sourceAbsPath.lastIndexOf('/') + 1);
                    const sourceParentPath = sourceAbsPath.substring(0, sourceAbsPath.lastIndexOf('/')) || '/';

                    const sourceParentValidationResult = FileSystemManager.validatePath(sourceParentPath, {expectedType: 'directory', permissions: ['write']});
                    if (!sourceParentValidationResult.success) {
                        return ErrorHandler.createError(`mv: cannot move '${sourcePathArg}': Permission denied in source directory`);
                    }
                    const sourceParentNode = sourceParentValidationResult.data.node;

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
                        const destParentValidationResult = FileSystemManager.validatePath(destParentPath, {expectedType: 'directory', permissions: ['write']});
                        if (!destParentValidationResult.success){
                            return ErrorHandler.createError(`mv: ${destParentValidationResult.error}`);
                        }
                        targetContainerNode = destParentValidationResult.data.node;
                        finalDestPath = destValidation.resolvedPath;
                    }

                    if (sourceAbsPath === finalDestPath) {
                        continue;
                    }

                    if (sourceNode.type === 'directory' && finalDestPath.startsWith(sourceAbsPath + '/')) {
                        return ErrorHandler.createError(`mv: cannot move '${sourcePathArg}' to a subdirectory of itself, '${finalDestPath}'`);
                    }

                    const existingNodeAtDest = targetContainerNode.children[finalDestName];
                    if (existingNodeAtDest) {
                        const isPromptRequired = flags.interactive || (options.isInteractive && !flags.force);
                        if (isPromptRequired) {
                            const confirmed = await new Promise((resolve) => {
                                ModalManager.request({
                                    context: "terminal",
                                    type: "confirm",
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

                if (changesMade) {
                    const saveResult = await FileSystemManager.save();
                    if (!saveResult.success) {
                        return ErrorHandler.createError("mv: Failed to save file system changes.");
                    }
                }

                return ErrorHandler.createSuccess("");
            } catch (e) {
                return ErrorHandler.createError(`mv: An unexpected error occurred: ${e.message}`);
            }
        }
    };
    CommandRegistry.register(mvCommandDefinition);
})();