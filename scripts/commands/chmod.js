// scripts/commands/chmod.js
(() => {
    "use strict";

    const chmodCommandDefinition = {
        commandName: "chmod",
        completionType: "paths", // Preserved for tab completion
        argValidation: {
            exact: 2,
            error: "Usage: chmod <mode> <path>",
        },
        coreLogic: async (context) => {
            const { args, currentUser } = context;
            const modeArg = args[0];
            const pathArg = args[1];
            const nowISO = new Date().toISOString();

            try {
                if (!/^[0-7]{3,4}$/.test(modeArg)) {
                    return {
                        success: false,
                        error: `chmod: invalid mode: ‘${modeArg}’ (must be 3 or 4 octal digits)`,
                    };
                }

                const node = context.node; // Assumes node is passed in context.

                if (!FileSystemManager.canUserModifyNode(node, currentUser)) {
                    return {
                        success: false,
                        error: `chmod: changing permissions of '${pathArg}': Operation not permitted`,
                    };
                }

                const newMode = parseInt(modeArg, 8);
                node.mode = newMode;
                node.mtime = nowISO;

                if (!(await FileSystemManager.save())) {
                    return {
                        success: false,
                        error: "chmod: Failed to save file system changes.",
                    };
                }
                return {
                    success: true,
                    output: "", // No output on success
                };
            } catch (e) {
                return { success: false, error: `chmod: An unexpected error occurred: ${e.message}` };
            }
        },
    };

    const chmodDescription = "Changes the access permissions of a file or directory.";
    const chmodHelpText = `Usage: chmod <mode> <path>

Change the access permissions of a file or directory.

DESCRIPTION
       The chmod command changes the file mode bits of the file or
       directory specified by <path>. The <mode> is a 3-digit octal
       number that represents the permissions for the owner, the group,
       and all other users.

       Each digit is a sum of the following values:
       4 - read (r)
       2 - write (w)
       1 - execute (x)

       The three digits of the mode correspond to:
       1st digit: Owner's permissions
       2nd digit: Group's permissions
       3rd digit: Others' permissions

       For example, a mode of 754 means:
       - Owner: 7 (4+2+1) -> read, write, and execute
       - Group: 5 (4+0+1) -> read and execute
       - Other: 4 (4+0+0) -> read only

EXAMPLES
       chmod 755 script.sh
              Makes 'script.sh' executable by the owner, and readable
              and executable by the group and others. A common mode for
              executable scripts.

       chmod 640 secret.txt
              Makes 'secret.txt' readable and writable by the owner,
              readable by the group, and completely inaccessible to
              other users.

PERMISSIONS
       To change the permissions of a file, you must be the owner of
       the file or the superuser (root).`;

    CommandRegistry.register("chmod", chmodCommandDefinition, chmodDescription, chmodHelpText);
})();