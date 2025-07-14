// scripts/commands/xargs.js
(() => {
    "use strict";

    const xargsCommandDefinition = {
        commandName: "xargs",
        isInputStream: true, // Declares use of the unified input stream
        flagDefinitions: [{
            name: "replaceStr",
            short: "-I",
            takesValue: true,
        }, ],
        argValidation: {
            min: 1,
            error: "missing command",
        },
        coreLogic: async (context) => {
            const {
                args,
                flags,
                inputItems,
                inputError
            } = context;

            try {
                if (inputError) {
                    return { success: false, error: "xargs: No readable input provided or permission denied." };
                }

                if (!inputItems || inputItems.length === 0) {
                    return { success: true, output: "" };
                }

                const inputText = inputItems.map(item => item.content).join('\\n');
                if (inputText.trim() === "") {
                    return { success: true, output: "" };
                }

                const baseCommandArgs = args;
                const lines = inputText.trim().split('\\n');
                let lastResult = {
                    success: true,
                    output: ""
                };
                let combinedOutput = [];

                const replaceStr = flags.replaceStr;

                const escapeRegex = (str) => {
                    if (!str) return null;
                    return str.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
                };

                const replaceRegex = replaceStr ? new RegExp(escapeRegex(replaceStr), 'g') : null;

                for (const line of lines) {
                    if (line.trim() === "") continue;

                    const rawLine = line;
                    let commandToExecute;

                    if (replaceRegex) {
                        const commandParts = baseCommandArgs.map(part => {
                            const newPart = part.replace(replaceRegex, rawLine);
                            return newPart.includes(" ") && !newPart.startsWith('"') ? `"${newPart}"` : newPart;
                        });
                        commandToExecute = commandParts.join(" ");
                    } else {
                        const finalArg = rawLine.includes(" ") ? `"${rawLine}"` : rawLine;
                        commandToExecute = [...baseCommandArgs, finalArg].join(" ");
                    }


                    lastResult = await CommandExecutor.processSingleCommand(
                        commandToExecute, {
                            isInteractive: false
                        }
                    );

                    if (lastResult.output) {
                        combinedOutput.push(lastResult.output);
                    }

                    if (!lastResult.success) {
                        const errorMsg = `xargs: ${commandToExecute}: ${lastResult.error || 'Command failed'}`;
                        return {
                            success: false,
                            error: errorMsg
                        };
                    }
                }

                return {
                    success: lastResult.success,
                    output: combinedOutput.join('\\n')
                };
            } catch (e) {
                return { success: false, error: `xargs: An unexpected error occurred: ${e.message}` };
            }
        },
    };

    const xargsDescription = "Builds and executes command lines from standard input.";
    const xargsHelpText = `Usage: xargs [OPTION]... [command]

Read items from standard input and execute a command for each item.

DESCRIPTION
       The xargs command reads newline-delimited items from standard
       input and executes the specified [command] for each item.

       By default, the item is appended as the last argument.

OPTIONS
       -I <replace-str>
              Replace occurrences of <replace-str> in the initial arguments
              with names read from standard input.

EXAMPLES
       ls *.log | xargs rm
              Deletes all files ending in .log in the current directory.

       find . -name "*.tmp" | xargs rm
              Finds and deletes all files ending in .tmp in the
              current directory and its subdirectories.
              
       ls *.txt | xargs -I {} mv {} {}.bak
              Renames all .txt files to .txt.bak.`;

    CommandRegistry.register("xargs", xargsCommandDefinition, xargsDescription, xargsHelpText);
})();