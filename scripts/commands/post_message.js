// /scripts/commands/post_message.js

(() => {
    "use strict";

    const postMessageCommandDefinition = {
        commandName: "post_message",
        description: "Sends a message to a background job.",
        helpText: "Usage: post_message <job_id> <message>",
        argValidation: {
            exact: 2,
            error: "Usage: post_message <job_id> <message>",
        },
        coreLogic: async (context) => {
            const { args } = context;
            const jobId = parseInt(args[0], 10);
            const message = args[1];

            if (isNaN(jobId)) {
                return ErrorHandler.createError(`Invalid job ID: '${args[0]}'`);
            }

            if (!MessageBusManager.hasJob(jobId)) {
                return ErrorHandler.createError(`No active job with ID: ${jobId}`);
            }

            const result = MessageBusManager.postMessage(jobId, message);

            if (result.success) {
                return ErrorHandler.createSuccess(`Message sent to job ${jobId}.`);
            } else {
                return ErrorHandler.createError(result.error);
            }
        },
    };
    CommandRegistry.register(postMessageCommandDefinition);
})();