// scripts/commands/zip.js
(() => {
    "use strict";

    async function _archiveNode(node) {
        if (node.type === Config.FILESYSTEM.DEFAULT_FILE_TYPE) {
            return {
                type: 'file',
                content: node.content
            };
        }

        if (node.type === Config.FILESYSTEM.DEFAULT_DIRECTORY_TYPE) {
            const children = {};
            const childNames = Object.keys(node.children).sort();
            for (const childName of childNames) {
                const childNode = node.children[childName];
                children[childName] = await _archiveNode(childNode);
            }
            return {
                type: 'directory',
                children: children
            };
        }
        return null;
    }

    const zipCommandDefinition = {
        commandName: "zip",
        description: "Creates a compressed .zip archive of a file or directory.",
        helpText: `Usage: zip <archive.zip> <path>

Creates a simulated compressed archive of a file or directory.

DESCRIPTION
       The zip command recursively archives the contents of the specified
       <path> into a single file named <archive.zip>. The resulting
       .zip file is a JSON representation of the file structure, not
       a standard binary zip file. It can be unzipped using the 'unzip'
       command.

EXAMPLES
       zip my_project.zip /home/Guest/project
              Creates 'my_project.zip' containing the 'project' directory.`,
        completionType: "paths",
        argValidation: {
            exact: 2,
            error: "Usage: zip <archive.zip> <path_to_zip>"
        },
        coreLogic: async (context) => {
            const { args, currentUser } = context;
            let archivePath = args[0];
            const sourcePath = args[1];

            try {
                if (!archivePath.endsWith('.zip')) {
                    archivePath += '.zip';
                }

                const sourceValidationResult = FileSystemManager.validatePath(sourcePath, {
                    permissions: ['read']
                });
                if (!sourceValidationResult.success) {
                    return ErrorHandler.createError(`zip: ${sourceValidationResult.error}`);
                }
                const sourceValidation = sourceValidationResult.data;

                const archiveValidationResult = FileSystemManager.validatePath(archivePath, {
                    allowMissing: true,
                    expectedType: 'file'
                });
                if (!archiveValidationResult.success && archiveValidationResult.data?.node) {
                    return ErrorHandler.createError(`zip: ${archiveValidationResult.error}`);
                }
                const archiveValidation = archiveValidationResult.data;
                if (archiveValidation.node && archiveValidation.node.type === 'directory') {
                    return ErrorHandler.createError(`zip: cannot overwrite directory '${archivePath}' with a file`);
                }

                await OutputManager.appendToOutput(`Zipping '${sourcePath}'...`);

                const sourceName = sourceValidation.resolvedPath.split('/').pop() || sourceValidation.resolvedPath;
                const archiveObject = {
                    [sourceName]: await _archiveNode(sourceValidation.node)
                };
                const archiveContent = JSON.stringify(archiveObject, null, 2);

                const primaryGroup = UserManager.getPrimaryGroupForUser(currentUser);
                const saveResult = await FileSystemManager.createOrUpdateFile(
                    archiveValidation.resolvedPath,
                    archiveContent,
                    { currentUser, primaryGroup }
                );

                if (!saveResult.success) {
                    return ErrorHandler.createError(`zip: ${saveResult.error}`);
                }

                const fsSaveResult = await FileSystemManager.save();
                if (!fsSaveResult.success) {
                    return ErrorHandler.createError(`zip: Failed to save file system changes: ${fsSaveResult.error}`);
                }

                return ErrorHandler.createSuccess(`Successfully zipped '${sourcePath}' to '${archivePath}'.`);
            } catch (e) {
                return ErrorHandler.createError(`zip: An unexpected error occurred: ${e.message}`);
            }
        }
    };
    CommandRegistry.register(zipCommandDefinition);
})();