// scripts/commands/alias.js
(() => {
    "use strict";

    const aliasCommandDefinition = {
        commandName: "alias",
        description: "Create, remove, and display command aliases.",
        helpText: `Usage: alias [name='command']...

Define or display command aliases.

DESCRIPTION
       The alias command allows you to create shortcuts for longer or more
       complex commands. Aliases are saved and persist across sessions.

       Running \`alias\` with no arguments lists all currently defined
       aliases in a reusable format.

       To create or redefine an alias, use the \`name='command'\` format.
       The command string should be quoted if it contains spaces or
       special characters.

       To display a specific alias, run \`alias <name>\`.

EXAMPLES
       alias ll='ls -la'
              Creates a shortcut 'll' for a long directory listing.

       alias mypath='echo $PATH'
              Creates an alias to display the current PATH variable.
       
       alias
              Lists all defined aliases.
       
       alias ll
              Displays the definition for the 'll' alias.`,
        coreLogic: async (context) => {
            const { args } = context;

            try {
                if (args.length === 0) {
                    const allAliases = AliasManager.getAllAliases();
                    if (Object.keys(allAliases).length === 0) {
                        return ErrorHandler.createSuccess("");
                    }
                    const outputLines = [];
                    for (const name in allAliases) {
                        const value = allAliases[name];
                        outputLines.push(`alias ${name}='${value}'`);
                    }
                    return ErrorHandler.createSuccess(outputLines.sort().join("\\n"));
                }

                const combinedArg = args.join(" ");
                const eqIndex = combinedArg.indexOf("=");

                if (eqIndex !== -1) {
                    const name = combinedArg.substring(0, eqIndex).trim();
                    let value = combinedArg.substring(eqIndex + 1).trim();
                    if (!name) {
                        return ErrorHandler.createError("alias: invalid format. Missing name.");
                    }
                    if (
                        (value.startsWith("'") && value.endsWith("'")) ||
                        (value.startsWith('"') && value.endsWith('"'))
                    ) {
                        value = value.substring(1, value.length - 1);
                    }
                    if (AliasManager.setAlias(name, value)) {
                        return ErrorHandler.createSuccess("");
                    }
                    return ErrorHandler.createError("alias: failed to set alias.");
                }
                else {
                    const outputLines = [];
                    const errorLines = [];
                    let allFound = true;
                    for (const name of args) {
                        const value = AliasManager.getAlias(name);
                        if (value) {
                            outputLines.push(`alias ${name}='${value}'`);
                        } else {
                            errorLines.push(`alias: ${name}: not found`);
                            allFound = false;
                        }
                    }
                    if(allFound) {
                        return ErrorHandler.createSuccess(outputLines.join("\\n"));
                    } else {
                        return ErrorHandler.createError(errorLines.join("\\n"));
                    }
                }
            } catch (e) {
                return ErrorHandler.createError(`alias: An unexpected error occurred: ${e.message}`);
            }
        },
    };
    CommandRegistry.register(aliasCommandDefinition);
})();