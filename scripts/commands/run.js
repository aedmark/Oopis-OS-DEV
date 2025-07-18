// scripts/commands/run.js
(() => {
    "use strict";

    const runCommandDefinition = {
        commandName: "run",
        description: "Executes a shell script.",
        helpText: `Usage: run <script_path> [arguments...]

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
              stop execution immediately.`,
        completionType: "paths",
        argValidation: {
            min: 1,
        },
        coreLogic: async (context) => {
            const { args, options, signal } = context;
            const scriptPathArg = args[0];

            EnvironmentManager.push();

            try {
                const currentDepth = (options.scriptingContext?.depth || 0) + 1;
                if (currentDepth > Config.FILESYSTEM.MAX_SCRIPT_DEPTH) {
                    return ErrorHandler.createError(`Maximum script recursion depth (${Config.FILESYSTEM.MAX_SCRIPT_DEPTH}) exceeded. Halting execution.`);
                }

                const pathValidationResult = FileSystemManager.validatePath(scriptPathArg, {
                    expectedType: 'file',
                    permissions: ['read', 'execute']
                });

                if (!pathValidationResult.success) {
                    return ErrorHandler.createError(`run: ${scriptPathArg}: ${pathValidationResult.error}`);
                }

                const scriptNode = pathValidationResult.data.node;
                const scriptContent = scriptNode.content || "";
                const scriptArgs = args.slice(1);
                const lines = scriptContent.split('\n');

                const scriptingContext = {
                    sourceFile: scriptPathArg,
                    isScripting: true,
                    lines: lines,
                    currentLineIndex: -1,
                    depth: currentDepth
                };

                let finalResult = ErrorHandler.createSuccess("");

                for (let i = 0; i < lines.length; i++) {
                    scriptingContext.currentLineIndex = i;

                    if (signal?.aborted) {
                        await OutputManager.appendToOutput("Script execution aborted by user.", { typeClass: "text-warning" });
                        finalResult = ErrorHandler.createError("Aborted by user");
                        break;
                    }

                    let line = lines[i].trim();

                    if (line.startsWith('#') || line === '') {
                        continue;
                    }

                    line = line.replace(/\$@/g, scriptArgs.join(' '));
                    line = line.replace(/\$#/g, scriptArgs.length);
                    scriptArgs.forEach((j, k) => {
                        const regex = new RegExp(`\\$${k + 1}`, 'g');
                        line = line.replace(regex, j);
                    });

                    const result = await CommandExecutor.processSingleCommand(line, {
                        isInteractive: false,
                        scriptingContext: scriptingContext
                    });

                    i = scriptingContext.currentLineIndex;

                    if (!result.success) {
                        await OutputManager.appendToOutput(`Script '${scriptPathArg}' error on line ${i + 1}: ${line}\nError: ${result.error || 'Command failed.'}`, { typeClass: 'text-error' });
                        finalResult = result;
                        break;
                    }
                }

                return finalResult;

            } catch (e) {
                return ErrorHandler.createError(`run: An unexpected error occurred: ${e.message}`);
            } finally {
                EnvironmentManager.pop();
            }
        }
    };
    CommandRegistry.register(runCommandDefinition);
})();