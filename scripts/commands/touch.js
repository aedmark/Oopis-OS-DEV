// scripts/commands/touch.js
(() => {
    "use strict";

    const touchCommandDefinition = {
        commandName: "touch",
        description: "Changes file timestamps or creates empty files.",
        helpText: `Usage: touch [OPTION]... FILE...

Change file timestamps.

DESCRIPTION
       The touch command updates the modification time of each FILE to
       the current time.

       A FILE argument that does not exist is created empty, unless the
       -c option is supplied.

OPTIONS
       -c, --no-create
              Do not create any files.

       -d, --date=<string>
              Parse <string> and use it instead of the current time.
              Examples: "1 day ago", "2025-01-01"

       -t <stamp>
              Use [[CC]YY]MMDDhhmm[.ss] instead of the current time.

EXAMPLES
       touch newfile.txt
              Creates 'newfile.txt' if it does not exist, or updates its
              modification time if it does.

       touch -c existing_file.txt
              Updates the timestamp of 'existing_file.txt' but will not
              create it if it's missing.`,
        completionType: "paths",
        flagDefinitions: [
            { name: "noCreate", short: "-c", long: "--no-create" },
            { name: "dateString", short: "-d", long: "--date", takesValue: true },
            { name: "stamp", short: "-t", takesValue: true },
        ],
        argValidation: { min: 1 },
        coreLogic: async (context) => {
            const { args, flags, currentUser } = context;

            try {
                const timestampResult = TimestampParser.resolveTimestampFromCommandFlags(
                    flags,
                    "touch"
                );
                if (timestampResult.error)
                    return { success: false, error: timestampResult.error };

                const timestampToUse = timestampResult.timestampISO;
                let allSuccess = true;
                const messages = [];
                let changesMade = false;

                const primaryGroup = UserManager.getPrimaryGroupForUser(currentUser);

                for (const pathArg of args) {
                    const pathValidation = FileSystemManager.validatePath(pathArg, { allowMissing: true });
                    const { node, resolvedPath, error } = pathValidation;

                    if (error && !(node === null && error.includes("No such file or directory"))) {
                        messages.push(`touch: ${error}`);
                        allSuccess = false;
                        continue;
                    }

                    if (resolvedPath === '/') {
                        messages.push(`touch: cannot touch root directory`);
                        allSuccess = false;
                        continue;
                    }

                    if (node) {
                        if (!FileSystemManager.hasPermission(node, currentUser, "write")) {
                            messages.push(`touch: cannot update timestamp of '${pathArg}': Permission denied`);
                            allSuccess = false;
                            continue;
                        }
                        node.mtime = timestampToUse;
                        changesMade = true;
                    } else {
                        if (flags.noCreate) continue;

                        if (pathArg.trim().endsWith(Config.FILESYSTEM.PATH_SEPARATOR)) {
                            messages.push(`touch: cannot touch '${pathArg}': No such file or directory`);
                            allSuccess = false;
                            continue;
                        }

                        const createResult = await FileSystemManager.createOrUpdateFile(resolvedPath, "", { currentUser, primaryGroup });
                        if (!createResult.success) {
                            allSuccess = false;
                            messages.push(`touch: ${createResult.error}`);
                            continue;
                        }
                        const newNode = FileSystemManager.getNodeByPath(resolvedPath);
                        if(newNode) {
                            newNode.mtime = timestampToUse;
                            changesMade = true;
                        }
                    }
                }

                if (changesMade) {
                    const saveResult = await FileSystemManager.save();
                    if (!saveResult.success) {
                        allSuccess = false;
                        messages.unshift(`touch: CRITICAL - Failed to save file system changes: ${saveResult.error}`);
                    }
                }

                if (!allSuccess)
                    return {
                        success: false,
                        error: messages.join("\\n") || "touch: Not all operations were successful.",
                    };

                return { success: true, output: "" };
            } catch (e) {
                return { success: false, error: `touch: An unexpected error occurred: ${e.message}` };
            }
        },
    };
    CommandRegistry.register(touchCommandDefinition);
})();