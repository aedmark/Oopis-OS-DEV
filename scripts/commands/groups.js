// scripts/commands/groups.js
(() => {
    "use strict";

    const groupsCommandDefinition = {
        commandName: "groups",
        description: "Prints the groups a user is in.",
        helpText: `Usage: groups [username]

Print group memberships for a user.

DESCRIPTION
       The groups command prints the names of the primary and supplementary
       groups for each given username, or the current process if none are
       given.

EXAMPLES
       groups
              Displays the groups for the current user.

       groups root
              Displays the groups for the 'root' user.`,
        completionType: "users",
        argValidation: {
            max: 1,
        },
        coreLogic: async (context) => {
            const { args, currentUser } = context;
            const targetUser = args.length > 0 ? args[0] : currentUser;

            try {
                if (!await UserManager.userExists(targetUser)) {
                    return ErrorHandler.createError(`groups: user '${targetUser}' does not exist`);
                }

                const userGroups = GroupManager.getGroupsForUser(targetUser);

                if (userGroups.length === 0) {
                    return ErrorHandler.createSuccess(`groups: user '${targetUser}' is not a member of any group`);
                }

                return ErrorHandler.createSuccess(userGroups.join(' '));
            } catch (e) {
                return ErrorHandler.createError(`groups: An unexpected error occurred: ${e.message}`);
            }
        },
    };
    CommandRegistry.register(groupsCommandDefinition);
})();