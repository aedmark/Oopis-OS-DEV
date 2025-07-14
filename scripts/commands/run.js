// scripts/commands/run.js
(() => {
    "use strict";

    const runCommandDefinition = {
        commandName: "run",
        completionType: "paths", // Preserved for tab completion
        argValidation: {
            min: 1,
        },
        coreLogic: async (context) => {
            const { args, options, signal, currentUser } = context;
            const scriptPathArg = args[0];

            try {
                const pathValidation = FileSystemManager.validatePath(scriptPathArg, {
                    expectedType: 'file',
                    permissions: ['read', 'execute']
                });

                if (pathValidation.error) {
                    return { success: false, error: `run: ${scriptPathArg}: ${pathValidation.error}` };
                }

                const scriptNode = pathValidation.node;
                const scriptContent = scriptNode.content || "";
                const scriptArgs = args.slice(1);

                // CORRECTED: The script is split by the newline character.
                const lines = scriptContent.split('\n');
                let overallSuccess = true;

                // Loop through each line of the script.
                for (let i = 0; i < lines.length; i++) {
                    if (signal?.aborted) {
                        await OutputManager.appendToOutput("Script execution aborted by user.", { typeClass: "text-warning" });
                        overallSuccess = false;
                        break;
                    }

                    let line = lines[i].trim();

                    // Skip comments and empty lines, which is correct behavior.
                    if (line.startsWith('#') || line === '') {
                        continue;
                    }

                    // Substitute script arguments ($1, $@, etc.) for the current line.
                    line = line.replace(/\$@/g, scriptArgs.join(' '));
                    line = line.replace(/\$#/g, scriptArgs.length);
                    scriptArgs.forEach((arg, j) => {
                        const regex = new RegExp(`\\$${j + 1}`, 'g');
                        line = line.replace(regex, arg);
                    });

                    // Execute just the single, processed line of the script.
                    const result = await CommandExecutor.processSingleCommand(line, {
                        isInteractive: false,
                        scriptingContext: { sourceFile: scriptPathArg } // Pass context for potential nested runs.
                    });

                    // If any command fails, stop the script.
                    if (!result.success) {
                        await OutputManager.appendToOutput(`Script '${scriptPathArg}' error on line ${i + 1}: ${line}\nError: ${result.error || 'Command failed.'}`, { typeClass: 'text-error' });
                        overallSuccess = false;
                        break;
                    }
                }

                return { success: overallSuccess };

            } catch (e) {
                // Catch any unexpected catastrophic errors.
                return { success: false, error: `run: An unexpected error occurred: ${e.message}` };
            }
        }
    };

    // The help text and description remain the same as the user-facing functionality has not changed.
    const runDescription = "Executes a shell script.";
    const runHelpText = `Usage: run <script_path> [arguments...]

Execute a shell script.

DESCRIPTION
       The run command executes a script file containing a sequence of
       OopisOS commands. The script is read and executed line by line.

       By convention, script files should have a '.sh' extension.
       To be executed, the script file must have execute (x) permissions
       for the current user (see 'chmod').

SCRIPTING
       Scripts can be made more powerful and flexible using the following
       features:

       Comments
              Lines beginning with a '#' are treated as comments and are
              ignored by the executor.

       Arguments
              You can pass arguments to your script from the command line.
              These arguments can be accessed within the script using
              special variables:
              $1, $2, ...  - The first, second, etc., argument.
              $@           - All arguments as a single string.
              $#           - The total number of arguments.

       Error Handling
              If any command within the script fails, the script will
              stop execution immediately.`;

    CommandRegistry.register(runCommandDefinition.commandName, runCommandDefinition, runDescription, runHelpText);
})();