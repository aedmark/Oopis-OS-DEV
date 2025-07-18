// scripts/commands/listusers.js
(() => {
    "use strict";

    const listusersCommandDefinition = {
        commandName: "listusers",
        description: "Lists all registered users on the system.",
        helpText: `Usage: listusers

List all registered users.

DESCRIPTION
       The listusers command displays a list of all user accounts that
       currently exist on the system.

EXAMPLES
       listusers
              Registered users:
                Guest
                root
                userDiag`,
        argValidation: {
            exact: 0,
        },
        coreLogic: async () => {
            try {
                const users = StorageManager.loadItem(
                    Config.STORAGE_KEYS.USER_CREDENTIALS,
                    "User list",
                    {}
                );
                let userNames = Object.keys(users);

                if (!userNames.includes(Config.USER.DEFAULT_NAME)) {
                    userNames.push(Config.USER.DEFAULT_NAME);
                }

                userNames.sort();

                if (userNames.length === 0)
                    return ErrorHandler.createSuccess("No users registered.");

                const output = "Registered users:\\n" + userNames.map((u) => `  ${u}`).join("\\n");
                return ErrorHandler.createSuccess(output);
            } catch (e) {
                return ErrorHandler.createError(`listusers: An unexpected error occurred: ${e.message}`);
            }
        },
    };
    CommandRegistry.register(listusersCommandDefinition);
})();