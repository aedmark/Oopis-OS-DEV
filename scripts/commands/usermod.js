// scripts/commands/usermod.js
(() => {
    "use strict";

    const usermodCommandDefinition = {
        commandName: "usermod",
        description: "Modifies a user account, primarily for group membership.",
        helpText: `Usage: usermod -aG <groupname> <username>

Modify a user account.

DESCRIPTION
       The usermod command modifies the user account specified by
       <username>. Its primary function in OopisOS is to add a user to a
       supplementary group.

OPTIONS
       -aG <groupname>
              Add the user to the supplementary <groupname>. The -a flag
              (append) is important to ensure the user is not removed
              from other groups. The -G flag specifies that we are
              modifying a group membership. In OopisOS, these flags
              must be used together.

PERMISSIONS
       Only the superuser (root) can modify user accounts.

EXAMPLES
       usermod -aG developers newdev
              Adds the user 'newdev' to the 'developers' group.`,
        completionType: "users",
        argValidation: {
            exact: 3,
            error: "Usage: usermod -aG <groupname> <username>",
        },
        coreLogic: async (context) => {
            const { args, currentUser } = context;

            try {
                const flag = args[0];
                const groupName = args[1];
                const username = args[2];

                if (currentUser !== "root") {
                    return ErrorHandler.createError("usermod: only root can modify user groups.");
                }

                if (flag !== "-aG") {
                    return ErrorHandler.createError("usermod: invalid flag. Only '-aG' is supported.");
                }

                if (!GroupManager.groupExists(groupName)) {
                    return ErrorHandler.createError(`usermod: group '${groupName}' does not exist.`);
                }

                if (!await UserManager.userExists(username) && username !== Config.USER.DEFAULT_NAME) {
                    return ErrorHandler.createError(`usermod: user '${username}' does not exist.`);
                }

                if (GroupManager.addUserToGroup(username, groupName)) {
                    return ErrorHandler.createSuccess(`Added user '${username}' to group '${groupName}'.`);
                } else {
                    return ErrorHandler.createSuccess(`User '${username}' is already in group '${groupName}'.`);
                }
            } catch (e) {
                return ErrorHandler.createError(`usermod: An unexpected error occurred: ${e.message}`);
            }
        },
    };
    CommandRegistry.register(usermodCommandDefinition);
})();