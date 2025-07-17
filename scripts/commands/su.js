// scripts/commands/su.js
(() => {
    "use strict";

    const suCommandDefinition = {
        commandName: "su",
        description: "Switches to another user, stacking the session.",
        helpText: `Usage: su [username] [password]

Change the current user ID to another user.

DESCRIPTION
       The su (substitute user) command allows you to run a new shell
       session as another user. If no <username> is provided, it defaults
       to 'root'.

       If the target account has a password, you will be prompted to
       enter it.

       This command "stacks" the new session on top of the old one.
       To return to your original user session, use the 'logout' command.
       This is different from 'login', which replaces the current
       session entirely.

EXAMPLES
       su
              Switches to the 'root' user (will prompt for password).

       su Guest
              Switches to the 'Guest' user.`,
        completionType: "users",
        argValidation: {
            max: 2,
        },
        coreLogic: async (context) => {
            const {args, options} = context;
            const targetUser = args.length > 0 ? args[0] : "root";
            const providedPassword = args.length > 1 ? args[1] : null;

            try {
                const result = await UserManager.su(targetUser, providedPassword, options);
                if (result.success && !result.noAction) {
                    OutputManager.clearOutput();
                    await OutputManager.appendToOutput(`${Config.MESSAGES.WELCOME_PREFIX} ${targetUser}${Config.MESSAGES.WELCOME_SUFFIX}`);
                }

                return {
                    success: result.success,
                    output: result.noAction ? result.message : null,
                    error: result.success ? null : result.error,
                };
            } catch (e) {
                return { success: false, error: `su: An unexpected error occurred: ${e.message}` };
            }
        },
    };
    CommandRegistry.register(suCommandDefinition);
})();