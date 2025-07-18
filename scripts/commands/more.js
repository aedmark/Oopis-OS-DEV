// scripts/commands/more.js
(() => {
    "use strict";
    const moreCommandDefinition = {
        commandName: "more",
        dependencies: ['utils.js'],
        description: "Displays content one screen at a time.",
        helpText: `Usage: more [file]

Displays file content or standard input one screen at a time.

DESCRIPTION
        more is a filter for paging through text one screenful at a time.
        When used in a non-interactive script, it prints the entire input
        without pausing. In an interactive session, press SPACE to view
        the next page, and 'q' to quit.

EXAMPLES
        more long_document.txt
               Displays the document, pausing after each screen.

        ls -l / | more
               Pages through a long directory listing.`,
        isInputStream: true,
        completionType: "paths",
        coreLogic: async (context) => {
            const { options, inputItems, inputError } = context;

            try {
                if (inputError) {
                    return ErrorHandler.createError("more: Could not read one or more sources.");
                }

                if (!inputItems || inputItems.length === 0) {
                    return ErrorHandler.createSuccess("");
                }

                const content = inputItems.map(item => item.content).join('\\n');

                if (!options.isInteractive) {
                    return ErrorHandler.createSuccess(content);
                }

                await PagerManager.enter(content, { mode: 'more' });

                return ErrorHandler.createSuccess("");
            } catch (e) {
                return ErrorHandler.createError(`more: An unexpected error occurred: ${e.message}`);
            }
        },
    };
    CommandRegistry.register(moreCommandDefinition);
})();