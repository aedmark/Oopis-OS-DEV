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
                const scriptArgs = args.slice(1);
                const fileExtension = Utils.getFileExtension(scriptPathArg);
                const MAX_SCRIPT_STEPS = Config.FILESYSTEM.MAX_SCRIPT_STEPS;
                const MAX_RECURSION_DEPTH = 100;

                if (fileExtension !== "sh") {
                    return { success: false, error: `run: '${scriptPathArg}' is not a shell script (.sh) file.` };
                }
                if (!scriptNode.content) {
                    return { success: true, output: `run: Script '${scriptPathArg}' is empty.` };
                }
                if (options.scriptingContext && options.isInteractive) {
                    return { success: false, error: "run: Cannot execute a script while another is already running in interactive mode." };
                }

                const rawScriptLines = scriptNode.content.split('\\n');
                const isTopLevelCall = !options.scriptingContext;

                const scriptingContext = isTopLevelCall
                    ? { isScripting: true, waitingForInput: false, inputCallback: null, cancelCallback: null, steps: { count: 0 }, recursionDepth: 0 }
                    : options.scriptingContext;

                const parentScriptState = isTopLevelCall ? null : {
                    lines: scriptingContext.lines,
                    currentLineIndex: scriptingContext.currentLineIndex
                };

                scriptingContext.recursionDepth++;

                EnvironmentManager.push();
                if (isTopLevelCall) {
                    if (options.isInteractive) TerminalUI.setInputState(false);
                }

                let overallScriptSuccess = true;

                if (scriptingContext.recursionDepth > MAX_RECURSION_DEPTH) {
                    await OutputManager.appendToOutput(`Script '${scriptPathArg}' exceeded maximum recursion depth (${MAX_RECURSION_DEPTH}). Terminating.`, { typeClass: Config.CSS_CLASSES.ERROR_MSG });
                    overallScriptSuccess = false;
                } else {
                    let programCounter = 0;
                    while (programCounter < rawScriptLines.length) {
                        scriptingContext.currentLineIndex = programCounter;
                        scriptingContext.lines = rawScriptLines;

                        if (scriptingContext.steps.count++ > MAX_SCRIPT_STEPS) {
                            overallScriptSuccess = false;
                            await OutputManager.appendToOutput(`Script '${scriptPathArg}' exceeded maximum execution steps (${MAX_SCRIPT_STEPS}). Terminating.`, { typeClass: Config.CSS_CLASSES.ERROR_MSG });
                            break;
                        }

                        if (signal?.aborted) {
                            overallScriptSuccess = false;
                            await OutputManager.appendToOutput(`Script '${scriptPathArg}' cancelled.`, { typeClass: Config.CSS_CLASSES.WARNING_MSG });
                            if (scriptingContext.cancelCallback) scriptingContext.cancelCallback();
                            break;
                        }

                        const lineToExecuteIndex = programCounter;
                        let line = rawScriptLines[lineToExecuteIndex];

                        let inDoubleQuote = false, inSingleQuote = false, commentIndex = -1;
                        for (let i = 0; i < line.length; i++) {
                            const char = line[i], prevChar = i > 0 ? line[i - 1] : null;
                            if (char === '"' && prevChar !== '\\\\' && !inSingleQuote) inDoubleQuote = !inDoubleQuote;
                            else if (char === "'" && prevChar !== '\\\\' && !inDoubleQuote) inSingleQuote = !inSingleQuote;
                            else if (char === '#' && !inDoubleQuote && !inSingleQuote) { commentIndex = i; break; }
                        }
                        if (commentIndex !== -1) line = line.substring(0, commentIndex);
                        if (line.trim() === '') { programCounter++; continue; }

                        let processedLine = line.replace(/\\$@/g, scriptArgs.join(" ")).replace(/\\$#/g, scriptArgs.length.toString());
                        for (let i = 0; i < scriptArgs.length; i++) {
                            processedLine = processedLine.replace(new RegExp(`\\\\$${i + 1}`, 'g'), scriptArgs[i]);
                        }

                        const result = await CommandExecutor.processSingleCommand(processedLine.trim(), {
                            isInteractive: false,
                            scriptingContext
                        });
                        programCounter = scriptingContext.currentLineIndex + 1;

                        if (!result || !result.success) {
                            const errorMsg = `Script '${scriptPathArg}' error on line ${lineToExecuteIndex + 1}: ${rawScriptLines[lineToExecuteIndex]}\\nError: ${result.error || result.output || 'Unknown error.'}`;
                            await OutputManager.appendToOutput(errorMsg, { typeClass: Config.CSS_CLASSES.ERROR_MSG });
                            overallScriptSuccess = false;
                            break;
                        }
                    }
                }

                EnvironmentManager.pop();

                if (isTopLevelCall) {
                    if (options.isInteractive) {
                        TerminalUI.setInputState(true);
                    }
                }

                return {
                    success: overallScriptSuccess,
                    error: overallScriptSuccess ? null : `Script '${scriptPathArg}' failed.`
                };
            } catch (e) {
                return { success: false, error: `run: An unexpected error occurred: ${e.message}` };
            }
        }
    };

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
              stop execution immediately.

WARNING
       The scripting engine includes a governor to prevent infinite loops.
       A script that executes more than ${Config.FILESYSTEM.MAX_SCRIPT_STEPS} commands, or which
       calls other scripts too deeply, will be terminated to prevent the
       OS from becoming unresponsive.

EXAMPLES
       Suppose you have a file named 'greet.sh' with the following content:
       #!/bin/oopis_shell
       # This is a simple greeting script
       echo "Welcome to OopisOS, $1! You provided $# argument(s)."

       First, make the script executable:
       chmod 755 greet.sh

       Then, run it with an argument:
       run ./greet.sh "Brave User"

       This will output:
       Welcome to OopisOS, Brave User! You provided 1 argument(s).`;

    CommandRegistry.register(runCommandDefinition.commandName, runCommandDefinition, runDescription, runHelpText);
})();