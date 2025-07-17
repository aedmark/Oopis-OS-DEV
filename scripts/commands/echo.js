// scripts/commands/echo.js
(() => {
    "use strict";

    const echoCommandDefinition = {
        commandName: "echo",
        description: "Writes arguments to the standard output.",
        helpText: `Usage: echo [-e] [STRING]...

Write arguments to the standard output.

DESCRIPTION
       The echo utility writes its arguments separated by spaces,
       terminated by a newline, to the standard output.

OPTIONS
       -e     Enable interpretation of backslash escapes.

ESCAPES
       If -e is in effect, the following sequences are recognized:
       \\\\\\\\     backslash
       \\\\n     new line
       \\\\t     horizontal tab
       \\\\c     produce no further output (the trailing newline is suppressed)

EXAMPLES
       echo Hello, world!
              Displays "Hello, world!".

       echo -e "A line.\\\\nA second line."
              Displays two lines of text.

       echo "User: $USER"
              Displays the name of the current user by expanding the
              $USER environment variable.`,
        flagDefinitions: [
            {name: "enableBackslashEscapes", short: "-e"}
        ],
        coreLogic: async (context) => {
            try {
                let output = context.args.join(" ");
                let suppressNewline = false;

                if (context.flags.enableBackslashEscapes) {
                    // Correctly handle \c to suppress newline and further output
                    const cIndex = output.indexOf('\\c');
                    if (cIndex !== -1) {
                        output = output.substring(0, cIndex);
                        suppressNewline = true;
                    }

                    // Now interpret other escapes on the potentially truncated string
                    output = output.replace(/\\n/g, '\n')
                        .replace(/\\t/g, '\t')
                        .replace(/\\\\/g, '\\');
                }

                return {
                    success: true,
                    output: suppressNewline ? output : output + '\n',
                };
            } catch (e) {
                return { success: false, error: `echo: An unexpected error occurred: ${e.message}` };
            }
        },
    };
    CommandRegistry.register(echoCommandDefinition);
})();