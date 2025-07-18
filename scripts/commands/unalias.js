// scripts/commands/unalias.js
(() => {
    "use strict";

    const unaliasCommandDefinition = {
        commandName: "unalias",
        description: "Removes one or more defined aliases.",
        helpText: `Usage: unalias <alias_name>...

Remove aliases from the set of defined aliases.

DESCRIPTION
       The unalias command is used to remove one or more specified
       aliases. Once unaliased, the shortcut will no longer be available.

EXAMPLES
       unalias ll
              Removes the 'll' alias.

       unalias mypath mycommand
              Removes both the 'mypath' and 'mycommand' aliases.`,
        completionType: "aliases",
        argValidation: {
            min: 1,
            error: "Usage: unalias <alias_name>...",
        },
        coreLogic: async (context) => {
            const { args } = context;

            try {
                let allSuccess = true;
                const errorMessages = [];

                for (const aliasName of args) {
                    if (!AliasManager.removeAlias(aliasName)) {
                        allSuccess = false;
                        errorMessages.push(`unalias: no such alias: ${aliasName}`);
                    }
                }

                if (allSuccess) {
                    return ErrorHandler.createSuccess("");
                } else {
                    return ErrorHandler.createError(errorMessages.join("\\n"));
                }
            } catch (e) {
                return ErrorHandler.createError(`unalias: An unexpected error occurred: ${e.message}`);
            }
        },
    };
    CommandRegistry.register(unaliasCommandDefinition);
})();