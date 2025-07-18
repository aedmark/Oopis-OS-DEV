// scripts/commands/cp.js
(() => {
    "use strict";

    const cpCommandDefinition = {
        commandName: "cp",
        description: "Copies files and directories.",
        helpText: `Usage: cp [OPTION]... <source> <destination>
       cp [OPTION]... <source>... <directory>

Copy files and directories.

DESCRIPTION
       In the first form, the cp utility copies the contents of the <source>
       file to the <destination> file.

       In the second form, each <source> file is copied to the destination
       <directory>. The destination must be a directory and must exist.

       Copying a directory requires the -r or -R (recursive) option.

OPTIONS
       -f, --force
              If a destination file cannot be opened, remove it and try
              again. Overwrites existing files without prompting.

       -i, --interactive
              Prompt before overwriting an existing file.

       -p, --preserve
              Preserve the original file's mode, owner, group, and
              modification time.

       -r, -R, --recursive
              Copy directories recursively.

EXAMPLES
       cp file1.txt file2.txt
              Copies the content of file1.txt to file2.txt.

       cp -i notes.txt /home/Guest/docs/
              Copies 'notes.txt' to the docs directory, prompting if a
              file with the same name exists.

       cp -r project/ backup/
              Recursively copies the entire 'project' directory into the
              'backup' directory.`,
        completionType: "paths",
        flagDefinitions: [
            { name: "recursive", short: "-r", long: "--recursive", aliases: ["-R"] },
            { name: "force", short: "-f", long: "--force" },
            { name: "preserve", short: "-p", long: "--preserve" },
            { name: "interactive", short: "-i", long: "--interactive" },
        ],
        argValidation: {
            min: 2,
            error: "Usage: cp [OPTION]... <source> <destination> or cp [OPTION]... <source>... <directory>",
        },
        coreLogic: async (context) => {
            const { args, flags, currentUser, options } = context;
            const nowISO = new Date().toISOString();
            let anyChangesMade = false;

            try {
                const destPathArg = args.pop();
                const sourcePathArgs = args;

                const primaryGroup = UserManager.getPrimaryGroupForUser(currentUser);
                if (!primaryGroup) {
                    return ErrorHandler.createError("cp: critical - could not determine primary group for current user.");
                }

                const destValidationResult = FileSystemManager.validatePath(destPathArg, { allowMissing: true });
                if (!destValidationResult.success && destValidationResult.data?.node === undefined) {
                    return ErrorHandler.createError(`cp: ${destValidationResult.error}`);
                }
                const destValidation = destValidationResult.data;
                const isDestADirectory = destValidation.node && destValidation.node.type === 'directory';

                if (sourcePathArgs.length > 1 && !isDestADirectory) {
                    return ErrorHandler.createError(`cp: target '${destPathArg}' is not a directory`);
                }

                for (const sourcePathArg of sourcePathArgs) {
                    const sourceValidationResult = FileSystemManager.validatePath(sourcePathArg, { permissions: ['read'] });
                    if (!sourceValidationResult.success) {
                        return ErrorHandler.createError(`cp: ${sourceValidationResult.error}`);
                    }
                    const sourceValidation = sourceValidationResult.data;

                    let targetContainerAbsPath;
                    let targetEntryName;

                    if (isDestADirectory) {
                        targetContainerAbsPath = destValidation.resolvedPath;
                        targetEntryName = sourceValidation.resolvedPath.substring(sourceValidation.resolvedPath.lastIndexOf('/') + 1);
                    } else {
                        targetContainerAbsPath = destValidation.resolvedPath.substring(0, destValidation.resolvedPath.lastIndexOf('/')) || '/';
                        targetEntryName = destValidation.resolvedPath.substring(destValidation.resolvedPath.lastIndexOf('/') + 1);
                    }

                    const copyResult = await _executeCopyInternal(sourceValidation.node, sourceValidation.resolvedPath, targetContainerAbsPath, targetEntryName);

                    if (!copyResult.success) {
                        return copyResult;
                    }
                    if (copyResult.data.changed) anyChangesMade = true;
                }

                if (anyChangesMade) {
                    const saveResult = await FileSystemManager.save();
                    if (!saveResult.success) {
                        return ErrorHandler.createError(`cp: CRITICAL - Failed to save file system changes: ${saveResult.error}`);
                    }
                }

                return ErrorHandler.createSuccess("");

                async function _executeCopyInternal(sourceNode, sourcePathForMsg, targetContainerAbsPath, targetEntryName) {
                    const containerValidationResult = FileSystemManager.validatePath(targetContainerAbsPath, { expectedType: 'directory', permissions: ['write'] });
                    if (!containerValidationResult.success) {
                        return ErrorHandler.createError(`cp: ${containerValidationResult.error}`);
                    }
                    const targetContainerNode = containerValidationResult.data.node;

                    const fullFinalDestPath = FileSystemManager.getAbsolutePath(targetEntryName, targetContainerAbsPath);
                    const existingNodeAtDest = targetContainerNode.children[targetEntryName];

                    if (existingNodeAtDest) {
                        const isPromptRequired = flags.interactive || (options.isInteractive && !flags.force);
                        if (isPromptRequired) {
                            const confirmed = await new Promise((resolve) => {
                                ModalManager.request({
                                    context: "terminal",
                                    messageLines: [`Overwrite '${fullFinalDestPath}'?`],
                                    onConfirm: () => resolve(true),
                                    onCancel: () => resolve(false),
                                    options,
                                });
                            });
                            if (!confirmed) {
                                return ErrorHandler.createSuccess({ changed: false, message: `cp: not overwriting '${fullFinalDestPath}' (skipped)` });
                            }
                        }
                    }

                    if (sourceNode.type === 'file') {
                        const createResult = await FileSystemManager.createOrUpdateFile(fullFinalDestPath, sourceNode.content, { currentUser: flags.preserve ? sourceNode.owner : currentUser, primaryGroup: flags.preserve ? sourceNode.group : primaryGroup });
                        if (!createResult.success) {
                            return createResult;
                        }
                        const newNode = FileSystemManager.getNodeByPath(fullFinalDestPath);
                        if(flags.preserve) {
                            newNode.mode = sourceNode.mode;
                            newNode.mtime = sourceNode.mtime;
                        }

                    } else if (sourceNode.type === 'directory') {
                        if (!flags.recursive) {
                            await OutputManager.appendToOutput(`cp: omitting directory '${sourcePathForMsg}'`);
                            return ErrorHandler.createSuccess({ changed: false });
                        }

                        if (!existingNodeAtDest) {
                            const newDirNode = FileSystemManager._createNewDirectoryNode(
                                flags.preserve ? sourceNode.owner : currentUser,
                                flags.preserve ? sourceNode.group : primaryGroup,
                                flags.preserve ? sourceNode.mode : Config.FILESYSTEM.DEFAULT_DIR_MODE
                            );
                            if (flags.preserve) newDirNode.mtime = sourceNode.mtime;
                            targetContainerNode.children[targetEntryName] = newDirNode;
                        }

                        const newContainerPath = FileSystemManager.getAbsolutePath(targetEntryName, targetContainerAbsPath);
                        for (const childName in sourceNode.children) {
                            const childSourceNode = sourceNode.children[childName];
                            const childResult = await _executeCopyInternal(
                                childSourceNode,
                                FileSystemManager.getAbsolutePath(childName, sourcePathForMsg),
                                newContainerPath,
                                childName
                            );
                            if (!childResult.success) return childResult;
                        }
                    }
                    targetContainerNode.mtime = nowISO;
                    return ErrorHandler.createSuccess({ changed: true });
                }
            } catch (e) {
                return ErrorHandler.createError(`cp: An unexpected error occurred: ${e.message}`);
            }
        },
    };
    CommandRegistry.register(cpCommandDefinition);
})();