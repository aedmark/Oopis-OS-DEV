(() => {
    "use strict";

    const unsetCommandDefinition = {
        commandName: "unset",
        argValidation: { min: 1, error: "Usage: unset <variable_name>..." },
        coreLogic: async (context) => {
            context.args.forEach(varName => context.sessionContext.environment.unset(varName));
            return { success: true };
        }
    };

    const unsetDescription = "Unsets one or more environment variables.";

    const unsetHelpText = `Usage: unset <variable_name>...

Unset environment variable values.

DESCRIPTION
       The unset command removes the specified environment variables from
       the current session. After a variable is unset, it will no longer
       be available for expansion by the shell (e.g., using $VAR).

EXAMPLES
       set GREETING="Hello"
       echo $GREETING
              Hello

       unset GREETING
       echo $GREETING
              (prints a blank line)`;

    CommandRegistry.register("unset", unsetCommandDefinition, unsetDescription, unsetHelpText);
})();