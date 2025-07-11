// Corrected File: aedmark/oopis-os-dev/Oopis-OS-DEV-befc361c8feaa9a1cfa0107f68f24425f5419b9b/scripts/commands/grep.js
(() => {
    "use strict";

    const grepCommandDefinition = {
        commandName: "grep",
        flagDefinitions: [
            { name: "ignoreCase", short: "-i", long: "--ignore-case" },
            { name: "invertMatch", short: "-v", long: "--invert-match" },
            { name: "lineNumber", short: "-n", long: "--line-number" },
            { name: "count", short: "-c", long: "--count" },
            {name: "recursive", short: "-R", long: "--recursive"},
        ],
        coreLogic: async (context) => {
            const {args, flags, currentUser, options} = context;

            if (args.length === 0) {
                return { success: false, error: "grep: missing pattern" };
            }

            const patternStr = args[0];
            const filePaths = args.slice(1);
            let regex;

            try {
                regex = new RegExp(patternStr, flags.ignoreCase ? "i" : "");
            } catch (e) {
                return { success: false, error: `grep: invalid regular expression '${patternStr}': ${e.message}` };
            }

            const outputLines = [];

            const processContent = (content, filePathForDisplay, totalSources) => {
                const lines = content.split("\n");
                let fileMatchCount = 0;
                let currentFileLines = [];

                lines.forEach((line, index) => {
                    if (index === lines.length - 1 && line === "") return;

                    const isMatch = regex.test(line);
                    const effectiveMatch = flags.invertMatch ? !isMatch : isMatch;

                    if (effectiveMatch) {
                        fileMatchCount++;
                        if (!flags.count) {
                            let outputLine = "";
                            if (filePathForDisplay && totalSources > 1) {
                                outputLine += `${filePathForDisplay}:`;
                            }
                            if (flags.lineNumber) {
                                outputLine += `${index + 1}:`;
                            }
                            outputLine += line;
                            currentFileLines.push(outputLine);
                        }
                    }
                });

                if (flags.count) {
                    let countOutput = "";
                    if (filePathForDisplay && totalSources > 1) {
                        countOutput += `${filePathForDisplay}:`;
                    }
                    countOutput += fileMatchCount;
                    outputLines.push(countOutput);
                } else {
                    outputLines.push(...currentFileLines);
                }
            };

            if (filePaths.length > 0) {
                for (const pathArg of filePaths) {
                    const pathInfo = FileSystemManager.validatePath("grep", pathArg, {expectedType: 'file'});
                    if (pathInfo.error) {
                        return {success: false, error: pathInfo.error};
                    }
                    if (!FileSystemManager.hasPermission(pathInfo.node, currentUser, "read")) {
                        return {success: false, error: `grep: ${pathArg}: Permission denied`};
                    }
                    processContent(pathInfo.node.content, pathArg, filePaths.length);
                }
            } else if (options.stdinContent !== null) {
                processContent(options.stdinContent, 'stdin', 1);
            } else {
                return {success: false, error: "grep: missing operand"};
            }

            return {
                success: true,
                output: outputLines.join("\n"),
            };
        },
    };

    const grepDescription = "Searches for a pattern in files or standard input.";
    const grepHelpText = `...`;
    CommandRegistry.register("grep", grepCommandDefinition, grepDescription, grepHelpText);
})();