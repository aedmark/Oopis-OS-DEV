// scripts/commands/cat.js
(() => {
    "use strict";

    const catCommandDefinition = {
        commandName: "cat",
        isInputStream: true,
        flagDefinitions: [
            { name: "numberLines", short: "-n", long: "--number" }
        ],
        coreLogic: async (context) => {
            const { flags, args, currentUser, options } = context;

            // Handle piped input first
            if (options.stdinContent !== null && options.stdinContent !== undefined) {
                const lines = options.stdinContent.split('\n');
                if (flags.numberLines) {
                    const numberedOutput = lines.map((line, i) => `     ${String(i + 1).padStart(5)}  ${line}`).join('\n');
                    return { success: true, output: numberedOutput };
                }
                return { success: true, output: options.stdinContent };
            }

            if (args.length === 0) {
                return { success: false, error: "cat: missing file operand" };
            }

            let allContent = [];
            let hadError = false;

            for (const pathArg of args) {
                const resolvedPath = FileSystemManager.getAbsolutePath(pathArg);
                const node = FileSystemManager.getNodeByPath(resolvedPath);

                if (!node) {
                    allContent.push(`cat: ${pathArg}: No such file or directory`);
                    hadError = true;
                    continue;
                }

                if (node.type !== 'file') {
                    allContent.push(`cat: ${pathArg}: Is not a file`);
                    hadError = true;
                    continue;
                }

                if (!FileSystemManager.hasPermission(node, currentUser, 'read')) {
                    allContent.push(`cat: ${pathArg}: Permission denied`);
                    hadError = true;
                    continue;
                }

                allContent.push(node.content || "");
            }

            const combinedContent = allContent.join('\n');

            if (hadError) {
                return { success: false, error: combinedContent };
            }

            if (flags.numberLines) {
                let lineCounter = 1;
                const lines = combinedContent.split('\n');
                const processedLines = (lines.length > 0 && lines[lines.length - 1] === '') ? lines.slice(0, -1) : lines;
                const numberedOutput = processedLines.map(line => `     ${String(lineCounter++).padStart(5)}  ${line}`).join('\n');
                return { success: true, output: numberedOutput };
            }

            return { success: true, output: combinedContent };
        },
    };

    const catDescription = "Concatenate and display the content of files.";
    const catHelpText = `Usage: cat [FILE]...

Concatenate and print files to the standard output.

DESCRIPTION
       The cat utility reads files sequentially, writing them to the standard
       output. The file operands are processed in command-line order.

       If no files are specified, cat reads from standard input. This makes
       it useful in pipelines for displaying the output of other commands.

OPTIONS
       -n, --number
              Number all output lines, starting from 1.

EXAMPLES
       cat file1.txt
              Displays the content of file1.txt.

       cat file1.txt file2.txt > newfile.txt
              Concatenates file1.txt and file2.txt and writes the
              result to newfile.txt.

       ls -l | cat
              Displays the output of the 'ls -l' command, demonstrating
              how cat handles piped input.`;

    CommandRegistry.register("cat", catCommandDefinition, catDescription, catHelpText);
})();