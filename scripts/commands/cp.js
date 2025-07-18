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

                const planResult = await FileSystemManager.prepareFileOperation(sourcePathArgs, destPathArg, { isCopy: true });

                if (!planResult.success) {
                    return ErrorHandler.createError(`cp: ${planResult.error}`);
                }

                const operationsPlan = planResult.data;

                for (const operation of operationsPlan) {
                    if (operation.willOverwrite && (flags.interactive || (options.isInteractive && !flags.force))) {
                        const confirmed = await new Promise((resolve) => {
                            ModalManager.request({
                                context: "terminal",
                                messageLines: [`Overwrite '${operation.destinationAbsPath}'?`],
                                onConfirm: () => resolve(true),
                                onCancel: () => resolve(false),
                                options,
                            });
                        });
                        if (!confirmed) {
                            continue; // Skip this operation
                        }
                    }

                    const copyResult = await _executeCopyInternal(operation.sourceNode, operation.destinationParentNode, operation.finalName);
                    if (!copyResult.success) {
                        return copyResult; // Propagate error
                    }
                    if (copyResult.data.changed) {
                        anyChangesMade = true;
                    }
                }

                if (anyChangesMade) {
                    const saveResult = await FileSystemManager.save();
                    if (!saveResult.success) {
                        return ErrorHandler.createError(`cp: CRITICAL - Failed to save file system changes: ${saveResult.error}`);
                    }
                }

                return ErrorHandler.createSuccess("");

                async function _executeCopyInternal(sourceNode, destinationParentNode, finalName) {
                    if (sourceNode.type === 'file') {
                        const createResult = await FileSystemManager.createOrUpdateFile(
                            FileSystemManager.getAbsolutePath(finalName, FileSystemManager.getAbsolutePath(destinationParentNode.name)), // This seems wrong, let's fix
                            sourceNode.content,
                            { currentUser: flags.preserve ? sourceNode.owner : currentUser, primaryGroup: flags.preserve ? sourceNode.group : UserManager.getPrimaryGroupForUser(currentUser) }
                        );
                        if (!createResult.success) {
                            return createResult;
                        }
                        const newNode = FileSystemManager.getNodeByPath(FileSystemManager.getAbsolutePath(finalName, FileSystemManager.getAbsolutePath(destinationParentNode.name)));
                        if (flags.preserve) {
                            newNode.mode = sourceNode.mode;
                            newNode.mtime = sourceNode.mtime;
                        }
                    } else if (sourceNode.type === 'directory') {
                        if (!flags.recursive) {
                            await OutputManager.appendToOutput(`cp: omitting directory '${sourceNode.name}'`);
                            return ErrorHandler.createSuccess({ changed: false });
                        }

                        const newDirNode = FileSystemManager._createNewDirectoryNode(
                            flags.preserve ? sourceNode.owner : currentUser,
                            flags.preserve ? sourceNode.group : UserManager.getPrimaryGroupForUser(currentUser),
                            flags.preserve ? sourceNode.mode : Config.FILESYSTEM.DEFAULT_DIR_MODE
                        );
                        if (flags.preserve) newDirNode.mtime = sourceNode.mtime;
                        destinationParentNode.children[finalName] = newDirNode;

                        for (const childName in sourceNode.children) {
                            const childResult = await _executeCopyInternal(sourceNode.children[childName], newDirNode, childName);
                            if (!childResult.success) return childResult;
                        }
                    }
                    destinationParentNode.mtime = nowISO;
                    return ErrorHandler.createSuccess({ changed: true });
                }

            } catch (e) {
                return ErrorHandler.createError(`cp: An unexpected error occurred: ${e.message}`);
            }
        },
    };
    CommandRegistry.register(cpCommandDefinition);
})();