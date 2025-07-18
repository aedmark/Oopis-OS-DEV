// scripts/commands/ps.js
(() => {
    "use strict";

    const psCommandDefinition = {
        commandName: "ps",
        description: "Reports a snapshot of current background jobs.",
        helpText: `Usage: ps

Report a snapshot of the current background processes.

DESCRIPTION
       The ps command displays information about active background jobs
       running in the current session.

       To start a background job, append an ampersand (&) to your command.
       Each job is assigned a unique Process ID (PID) which can be used
       by the 'kill' command to terminate the process.

EXAMPLES
       delay 10000 &
              [1] Backgrounded.
       ps
                PID   COMMAND
                1     delay 10000`,
        argValidation: {
            exact: 0,
        },
        coreLogic: async () => {
            try {
                const jobs = CommandExecutor.getActiveJobs();
                const jobIds = Object.keys(jobs);

                if (jobIds.length === 0) {
                    return ErrorHandler.createSuccess("No active background jobs.");
                }

                let outputLines = ["  PID   COMMAND"];

                jobIds.forEach((id) => {
                    const job = jobs[id];
                    outputLines.push(`  ${String(id).padEnd(5)} ${job.command}`);
                });

                return ErrorHandler.createSuccess(outputLines.join("\\n"));
            } catch (e) {
                return ErrorHandler.createError(`ps: An unexpected error occurred: ${e.message}`);
            }
        },
    };
    CommandRegistry.register(psCommandDefinition);
})();