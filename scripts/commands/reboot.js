// scripts/commands/reboot.js
(() => {
    "use strict";

    const rebootCommandDefinition = {
        commandName: "reboot",
        description: "Reboots the OopisOS virtual machine.",
        helpText: `Usage: reboot

Reboot the OopisOS virtual machine.

DESCRIPTION
       The reboot command safely reloads the OopisOS environment by
       reloading the browser page.

       Because all user data, files, and session information are saved
       to persistent browser storage, your entire system state will be
       preserved and restored after the reboot is complete. This is
       useful for applying certain configuration changes or recovering
       from a UI glitch.`,
        argValidation: { exact: 0 },
        coreLogic: async () => {
            try {
                await OutputManager.appendToOutput(
                    "Rebooting OopisOS (reloading browser page)...",
                    {
                        typeClass: Config.CSS_CLASSES.SUCCESS_MSG,
                    }
                );
                setTimeout(() => {
                    window.location.reload();
                }, 500);
                return ErrorHandler.createSuccess(null);
            } catch (e) {
                return ErrorHandler.createError(`reboot: An unexpected error occurred: ${e.message}`);
            }
        },
    };
    CommandRegistry.register(rebootCommandDefinition);
})();