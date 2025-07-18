// scripts/commands/chgrp.js
(() => {
    "use strict";

    const chgrpCommandDefinition = {
        commandName: "chgrp",
        description: "Changes the group ownership of a file or directory.",
        helpText: `Usage: chgrp <group> <path>

Change the group ownership of a file or directory.

DESCRIPTION
       The chgrp command changes the group of the file or directory
       specified by <path> to <group>.

       Group ownership is a fundamental part of the OopisOS security model.
       File permissions can be set to allow or deny access based on whether
       a user is a member of a file's group. Use the 'ls -l' command to
       view file and directory ownership.

EXAMPLES
       chgrp developers /home/Guest/project
              Changes the group of the 'project' directory to 'developers'.

PERMISSIONS
       To change the group of a file, you must be the owner of the file
       or the superuser (root).`,
        completionType: "groups",
        argValidation: { exact: 2, error: "Usage: chgrp <groupname> <path>" },
        pathValidation: {
            argIndex: 1
        },
        coreLogic: async (context) => {
            const { args, currentUser, node } = context;
            const groupName = args[0];
            const pathArg = args[1]; // For messaging

            try {
                if (!FileSystemManager.canUserModifyNode(node, currentUser)) {
                    return ErrorHandler.createError(`chgrp: changing group of '${pathArg}': Operation not permitted`);
                }
                if (!GroupManager.groupExists(groupName)) {
                    return ErrorHandler.createError(`chgrp: invalid group: '${groupName}'`);
                }

                node.group = groupName;
                node.mtime = new Date().toISOString();
                const saveResult = await FileSystemManager.save();
                if (!saveResult.success) {
                    return ErrorHandler.createError("chgrp: Failed to save file system changes.");
                }

                return ErrorHandler.createSuccess("");
            } catch (e) {
                return ErrorHandler.createError(`chgrp: An unexpected error occurred: ${e.message}`);
            }
        },
    };
    CommandRegistry.register(chgrpCommandDefinition);
})();