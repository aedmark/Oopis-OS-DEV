// scripts/commands/kill.js
(() => {
    "use strict";

    const killCommandDefinition = {
        commandName: "kill",
        description: "Terminates a background job.",
        helpText: `Usage: kill <job_id>

Terminate a background job.

DESCRIPTION
       The kill command sends a termination signal to the background job
       identified by <job_id>.

       This is part of OopisOS's job control feature set. Use the 'ps'
       command to get a list of active background jobs and their
       corresponding job IDs.

EXAMPLES
       delay 10000 &
              [1] Backgrounded.
              
       ps
                PID   COMMAND
                1     delay 10000

       kill 1
              Signal sent to terminate job 1.`,
        argValidation: {
            exact: 1,
            error: "Usage: kill <job_id>",
        },
        coreLogic: async (context) => {
            const { args } = context;

            try {
                const jobId = parseInt(args[0], 10);

                if (isNaN(jobId)) {
                    return ErrorHandler.createError(`kill: invalid job ID: ${args[0]}`);
                }

                const result = await CommandExecutor.killJob(jobId);

                if (result.success) {
                    return ErrorHandler.createSuccess(result.data || "");
                } else {
                    return ErrorHandler.createError(result.error || "Failed to kill job.");
                }
            } catch (e) {
                return ErrorHandler.createError(`kill: An unexpected error occurred: ${e.message}`);
            }
        },
    };
    CommandRegistry.register(killCommandDefinition);
})();