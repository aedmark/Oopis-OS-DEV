// scripts/commands/diff.js
(() => {
    "use strict";

    const diffCommandDefinition = {
        commandName: "diff",
        description: "Compares two files line by line.",
        helpText: `Usage: diff <file1> <file2>

Compare two files line by line.

DESCRIPTION
       The diff command analyzes two files and prints the lines that are
       different.

       The output format uses the following prefixes:
       <      A line that is in <file1> but not in <file2>.
       >      A line that is in <file2> but not in <file1>.
         (a space) A line that is common to both files (context).

EXAMPLES
       diff original.txt updated.txt
              Shows the differences between the two text text files.`,
        completionType: "paths",
        argValidation: {
            exact: 2,
            error: "Usage: diff <file1> <file2>",
        },
        coreLogic: async (context) => {
            const { args } = context;
            const file1Path = args[0];
            const file2Path = args[1];

            try {
                const validation1Result = FileSystemManager.validatePath(file1Path, { expectedType: 'file', permissions: ['read'] });
                if (!validation1Result.success) {
                    return ErrorHandler.createError(`diff: ${file1Path}: ${validation1Result.error.replace(file1Path + ':', '').trim()}`);
                }
                const { node: file1Node } = validation1Result.data;

                const validation2Result = FileSystemManager.validatePath(file2Path, { expectedType: 'file', permissions: ['read'] });
                if (!validation2Result.success) {
                    return ErrorHandler.createError(`diff: ${file2Path}: ${validation2Result.error.replace(file2Path + ':', '').trim()}`);
                }
                const { node: file2Node } = validation2Result.data;

                const diffResult = DiffUtils.compare(
                    file1Node.content || "",
                    file2Node.content || ""
                );

                return ErrorHandler.createSuccess(diffResult);
            } catch (e) {
                return ErrorHandler.createError(`diff: An unexpected error occurred: ${e.message}`);
            }
        },
    };
    CommandRegistry.register(diffCommandDefinition);
})();