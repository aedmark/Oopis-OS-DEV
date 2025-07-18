// scripts/commands/upload.js
(() => {
    "use strict";

    const uploadCommandDefinition = {
        commandName: "upload",
        description: "Uploads files or folders from your local machine to OopisOS.",
        helpText: `Usage: upload [-f] [-r] [destination_directory]

Upload one or more files from your local machine to OopisOS.

DESCRIPTION
       The upload command opens your browser's file selection dialog,
       allowing you to choose one or more files from your actual computer
       to upload into the OopisOS virtual file system.

       If a <destination_directory> is specified, the files will be
       uploaded there. Otherwise, they will be uploaded to the current
       working directory.

       If a file with the same name already exists in the destination,
       you will be prompted to confirm before overwriting it.

OPTIONS
       -f, --force
              Do not prompt for confirmation; automatically overwrite any
              existing files with the same name.
       -r, --recursive
              Allows uploading of an entire directory. The directory
              structure will be recreated in OopisOS.`,
        flagDefinitions: [
            { name: "force", short: "-f", long: "--force" },
            { name: "recursive", short: "-r", long: "--recursive" },
        ],
        argValidation: {
            max: 1,
        },
        coreLogic: async (context) => {
            const { args, flags, currentUser, options } = context;

            try {
                if (!options.isInteractive)
                    return ErrorHandler.createError("upload: Can only be run in interactive mode.");

                let targetDirPath = FileSystemManager.getCurrentPath();
                const operationMessages = [];
                let allFilesSuccess = true;
                let anyChangeMade = false;

                if (args.length === 1) {
                    const pathValidationResult = FileSystemManager.validatePath(args[0], { expectedType: 'directory', permissions: ['write'] });
                    if (!pathValidationResult.success) {
                        return ErrorHandler.createError(`upload: ${pathValidationResult.error}`);
                    }
                    targetDirPath = pathValidationResult.data.resolvedPath;
                } else {
                    const pathValidationResult = FileSystemManager.validatePath(targetDirPath, { expectedType: 'directory', permissions: ['write'] });
                    if (!pathValidationResult.success) {
                        return ErrorHandler.createError(`upload: cannot write to current directory: ${pathValidationResult.error}`);
                    }
                }

                const input = Utils.createElement("input", { type: "file" });
                if (flags.recursive) {
                    input.webkitdirectory = true;
                } else {
                    input.multiple = true;
                }
                input.style.display = "none";
                document.body.appendChild(input);

                const fileResult = await new Promise((resolve) => {
                    input.onchange = (e) => {
                        if (e.target.files?.length > 0) {
                            resolve(ErrorHandler.createSuccess(e.target.files));
                        } else {
                            resolve(ErrorHandler.createError(Config.MESSAGES.UPLOAD_NO_FILE));
                        }
                    };
                    input.addEventListener('cancel', () => {
                        resolve(ErrorHandler.createError(Config.MESSAGES.UPLOAD_NO_FILE));
                    });
                    input.click();
                });

                if (!fileResult.success) {
                    document.body.removeChild(input);
                    return ErrorHandler.createSuccess(`upload: ${fileResult.error}`);
                }

                const filesToUpload = fileResult.data;
                const primaryGroup = UserManager.getPrimaryGroupForUser(currentUser);
                const ALLOWED_EXTENSIONS = new Set(['txt', 'md', 'html', 'sh', 'js', 'css', 'json', 'oopic', 'bas']);

                if (!primaryGroup) {
                    return ErrorHandler.createError("upload: Could not determine primary group for user.");
                }

                for (const file of Array.from(filesToUpload)) {
                    try {
                        const fileExtension = Utils.getFileExtension(file.name);
                        if (!ALLOWED_EXTENSIONS.has(fileExtension) && file.name.includes('.')) {
                            operationMessages.push(`${Config.MESSAGES.UPLOAD_INVALID_TYPE_PREFIX}'${fileExtension}'${Config.MESSAGES.UPLOAD_INVALID_TYPE_SUFFIX}`);
                            continue;
                        }

                        const content = await file.text();
                        const relativePath = (flags.recursive && file.webkitRelativePath) ? file.webkitRelativePath : file.name;
                        const fullDestPath = FileSystemManager.getAbsolutePath(relativePath, targetDirPath);

                        const existingFileNode = FileSystemManager.getNodeByPath(fullDestPath);
                        if (existingFileNode) {
                            if (existingFileNode.type !== 'file') {
                                operationMessages.push(`upload: cannot overwrite non-file '${relativePath}'`);
                                allFilesSuccess = false;
                                continue;
                            }
                            if (!flags.force) {
                                const confirmed = await new Promise((r) =>
                                    ModalManager.request({
                                        context: "terminal",
                                        type: "confirm",
                                        messageLines: [`'${relativePath}' already exists. Overwrite?`],
                                        onConfirm: () => r(true),
                                        onCancel: () => r(false),
                                        options,
                                    })
                                );
                                if (!confirmed) {
                                    operationMessages.push(`Skipped '${relativePath}'.`);
                                    continue;
                                }
                            }
                        }

                        const saveResult = await FileSystemManager.createOrUpdateFile(fullDestPath, content, { currentUser, primaryGroup });

                        if (!saveResult.success) {
                            operationMessages.push(`Error for '${relativePath}': ${saveResult.error}`);
                            allFilesSuccess = false;
                            continue;
                        }

                        operationMessages.push(`${Config.MESSAGES.UPLOAD_SUCCESS_PREFIX}'${relativePath}'${Config.MESSAGES.UPLOAD_SUCCESS_MIDDLE}'${targetDirPath}'${Config.MESSAGES.UPLOAD_SUCCESS_SUFFIX}`);
                        anyChangeMade = true;

                    } catch (fileError) {
                        operationMessages.push(`${Config.MESSAGES.UPLOAD_READ_ERROR_PREFIX}'${file.name}'${Config.MESSAGES.UPLOAD_READ_ERROR_SUFFIX}: ${fileError.message}`);
                        allFilesSuccess = false;
                    }
                }

                if (anyChangeMade) {
                    const fsSaveResult = await FileSystemManager.save();
                    if (!fsSaveResult.success) {
                        operationMessages.push(`Critical: Failed to save file system changes after uploads: ${fsSaveResult.error}`);
                        allFilesSuccess = false;
                    }
                }

                document.body.removeChild(input);
                const outputMessage = operationMessages.join("\\n");

                if (allFilesSuccess) {
                    return ErrorHandler.createSuccess(outputMessage);
                } else {
                    return ErrorHandler.createError(outputMessage || "Upload process completed with some issues.");
                }

            } catch (e) {
                if (document.getElementById('file-upload-input')) {
                    document.body.removeChild(document.getElementById('file-upload-input'));
                }
                return ErrorHandler.createError(`upload: An unexpected error occurred: ${e.message}`);
            }
        },
    };
    CommandRegistry.register(uploadCommandDefinition);
})();