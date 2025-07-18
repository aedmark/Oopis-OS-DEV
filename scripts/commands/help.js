// scripts/commands/help.js
(() => {
    "use strict";

    const helpCommandDefinition = {
        commandName: "help",
        description: "Displays a list of commands or a command's syntax.",
        helpText: `Usage: help [command]

Displays a list of all available commands.
If a command name is provided, it displays the command's usage syntax.

For a full, detailed manual page for a command, use 'man <command>'.`,
        completionType: "commands",
        argValidation: {
            max: 1,
        },
        coreLogic: async (context) => {
            const { args } = context;

            try {
                if (args.length === 0) {
                    const allCommandNames = Config.COMMANDS_MANIFEST.sort();
                    const loadedCommands = CommandRegistry.getDefinitions();

                    let output = "OopisOS Help\\n\\nAvailable commands:\\n";
                    allCommandNames.forEach((cmdName) => {
                        const loadedCmd = loadedCommands[cmdName];
                        const description = loadedCmd ? loadedCmd.description : "";
                        output += `  ${cmdName.padEnd(15)} ${description}\\n`;
                    });
                    output += "\\nType 'help [command]' or 'man [command]' for more details.";
                    return ErrorHandler.createSuccess(output);

                } else {
                    const cmdName = args[0].toLowerCase();
                    const isLoaded = await CommandExecutor._ensureCommandLoaded(cmdName);

                    if (!isLoaded) {
                        return ErrorHandler.createError(`help: command not found: ${cmdName}`);
                    }

                    const commandData = CommandRegistry.getDefinitions()[cmdName];
                    let output = "";

                    if (commandData?.helpText) {
                        const helpLines = commandData.helpText.split('\\n');
                        const usageLine = helpLines.find(line => line.trim().toLowerCase().startsWith('usage:'));
                        if (usageLine) {
                            output = usageLine.trim();
                        } else {
                            output = `Synopsis for '${cmdName}':\\n  ${commandData.description || 'No usage information available.'}`;
                        }
                        output += `\\n\\nFor more details, run 'man ${cmdName}'`;
                    } else {
                        return ErrorHandler.createError(`help: command not found: ${args[0]}`);
                    }
                    return ErrorHandler.createSuccess(output);
                }
            } catch (e) {
                return ErrorHandler.createError(`help: An unexpected error occurred: ${e.message}`);
            }
        },
    };
    CommandRegistry.register(helpCommandDefinition);
})();