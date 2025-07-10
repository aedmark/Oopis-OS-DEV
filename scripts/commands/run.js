// aedmark/oopis-os-dev/Oopis-OS-DEV-33c780ad7f3af576fec163e3a060e1960f4bc842/scripts/commands/run.js
(() => {
    "use strict";

    const runCommandDefinition = {
        commandName: "run",
        argValidation: {
            min: 1,
        },
        pathValidation: [
            {
                argIndex: 0,
                options: {
                    expectedType: Config.FILESYSTEM.DEFAULT_FILE_TYPE,
                },
            },
        ],
        permissionChecks: [
            {
                pathArgIndex: 0,
                permissions: ["read", "execute"],
            },
        ],
        coreLogic: async (context) => {
            const {args, options, signal, sessionContext} = context;
            const scriptPathArg = args[0];
            const scriptArgs = args.slice(1);
            const scriptNode = context.validatedPaths[0].node;
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

            const rawScriptLines = scriptNode.content.split('\n');
            const isTopLevelCall = !options.scriptingContext;

            const scriptingContext = isTopLevelCall
                ? { isScripting: true, waitingForInput: false, inputCallback: null, cancelCallback: null, steps: { count: 0 }, recursionDepth: 0 }
                : options.scriptingContext;

            const parentScriptState = isTopLevelCall ? null : {
                lines: scriptingContext.lines,
                currentLineIndex: scriptingContext.currentLineIndex
            };

            scriptingContext.recursionDepth++;

            sessionContext.environment.push();
            if (isTopLevelCall && options.isInteractive) {
                TerminalManager.setInputState(false, sessionContext);
            }

            let overallScriptSuccess = true;

            try {
                if (scriptingContext.recursionDepth > MAX_RECURSION_DEPTH) {
                    await OutputManager.appendToOutput(`Script '${scriptPathArg}' exceeded maximum recursion depth (${MAX_RECURSION_DEPTH}). Terminating.`, {
                        typeClass: Config.CSS_CLASSES.ERROR_MSG,
                        sessionContext
                    });
                    overallScriptSuccess = false;
                } else {
                    let programCounter = 0;
                    while (programCounter < rawScriptLines.length) {
                        scriptingContext.currentLineIndex = programCounter;
                        scriptingContext.lines = rawScriptLines;

                        if (scriptingContext.steps.count++ > MAX_SCRIPT_STEPS) {
                            overallScriptSuccess = false;
                            await OutputManager.appendToOutput(`Script '${scriptPathArg}' exceeded maximum execution steps (${MAX_SCRIPT_STEPS}). Terminating.`, {
                                typeClass: Config.CSS_CLASSES.ERROR_MSG,
                                sessionContext
                            });
                            break;
                        }

                        if (signal?.aborted) {
                            overallScriptSuccess = false;
                            await OutputManager.appendToOutput(`Script '${scriptPathArg}' cancelled.`, {
                                typeClass: Config.CSS_CLASSES.WARNING_MSG,
                                sessionContext
                            });
                            if (scriptingContext.cancelCallback) scriptingContext.cancelCallback();
                            break;
                        }

                        const lineToExecuteIndex = programCounter;
                        let line = rawScriptLines[lineToExecuteIndex];

                        let inDoubleQuote = false, inSingleQuote = false, commentIndex = -1;
                        for (let i = 0; i < line.length; i++) {
                            const char = line[i], prevChar = i > 0 ? line[i - 1] : null;
                            if (char === '"' && prevChar !== '\\' && !inSingleQuote) inDoubleQuote = !inDoubleQuote;
                            else if (char === '\'' && prevChar !== '\\' && !inDoubleQuote) inSingleQuote = !inSingleQuote;
                            else if (char === '#' && !inDoubleQuote && !inSingleQuote) { commentIndex = i; break; }
                        }
                        if (commentIndex !== -1) line = line.substring(0, commentIndex);
                        if (line.trim() === '') { programCounter++; continue; }

                        let processedLine = line.replace(/\$@/g, scriptArgs.join(" ")).replace(/\$#/g, scriptArgs.length.toString());
                        for (let i = 0; i < scriptArgs.length; i++) {
                            processedLine = processedLine.replace(new RegExp(`\\$${i + 1}`, 'g'), scriptArgs[i]);
                        }

                        const result = await CommandExecutor.processSingleCommand(processedLine.trim(), {
                            isInteractive: false,
                            scriptingContext,
                            sessionContext
                        });
                        programCounter = scriptingContext.currentLineIndex + 1;

                        if (!result || !result.success) {
                            const errorMsg = `Script '${scriptPathArg}' error on line ${lineToExecuteIndex + 1}: ${rawScriptLines[lineToExecuteIndex]}\nError: ${result.error || result.output || 'Unknown error.'}`;
                            await OutputManager.appendToOutput(errorMsg, {
                                typeClass: Config.CSS_CLASSES.ERROR_MSG,
                                sessionContext
                            });
                            overallScriptSuccess = false;
                            break;
                        }
                    }
                }
            } finally {
                scriptingContext.recursionDepth--;

                if (parentScriptState) {
                    scriptingContext.lines = parentScriptState.lines;
                    scriptingContext.currentLineIndex = parentScriptState.currentLineIndex;
                }

                sessionContext.environment.pop();

                if (isTopLevelCall && options.isInteractive) {
                    TerminalManager.setInputState(true, sessionContext);
                }
            }

            return {
                success: overallScriptSuccess,
                error: overallScriptSuccess ? null : `Script '${scriptPathArg}' failed.`
            };
        }
    };

    CommandRegistry.register("run", runCommandDefinition, "Executes a shell script.", "See `man run` for details.");
})();