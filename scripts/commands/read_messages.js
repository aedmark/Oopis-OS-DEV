// /scripts/commands/read_messages.js

(() => {
    "use strict";

    const readMessagesCommandDefinition = {
        commandName: "read_messages",
        description: "Reads messages from the job's own message queue.",
        helpText: "Usage: read_messages (must be run within a background job)",
        argValidation: { exact: 0 },
        coreLogic: async (context) => {
            const jobId = context.options?.jobId;

            if (jobId === undefined) {
                return ErrorHandler.createError("read_messages: can only be run from within a background job.");
            }

            const messages = MessageBusManager.getMessages(jobId);

            if (messages.length === 0) {
                return ErrorHandler.createSuccess("");
            }

            return ErrorHandler.createSuccess(messages.join('\n'));
        },
    };

    CommandRegistry.register(readMessagesCommandDefinition);
})();