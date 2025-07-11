// Corrected File: aedmark/oopis-os-dev/Oopis-OS-DEV-aedb1e06b3c339d81e0dedd9bba1496acbdf4d36/scripts/commands/sudo.js
(() => {
    "use strict";

    const sudoCommandDefinition = {
        commandName: "sudo",
        argValidation: {
            min: 1,
            error: "usage: sudo <command> [args ...]"
        },
        coreLogic: async (context) => {
            const {args, currentUser, options, sessionContext} = context;
            const commandToRun = args[0];
            const fullCommandStr = args.join(' ');

            if (currentUser === 'root') {
                return await CommandExecutor.processSingleCommand(fullCommandStr, {
                    ...options,
                    isInteractive: options.isInteractive
                });
            }

            if (!SudoManager.canUserRunCommand(currentUser, commandToRun) && !SudoManager.canUserRunCommand(currentUser, 'ALL')) {
                return {
                    success: false,
                    error: `sudo: Sorry, user ${currentUser} is not allowed to execute '${commandToRun}' as root on OopisOs.`
                };
            }

            if (SudoManager.isUserTimestampValid(currentUser)) {
                return await UserManager.sudoExecute(fullCommandStr, options, sessionContext);
            }

            return new Promise(resolve => {
                ModalManager.request({
                    context: 'terminal',
                    messageLines: [`[sudo] password for ${currentUser}:`],
                    onConfirm: async (password) => {
                        const authResult = await UserManager.verifyPassword(currentUser, password);

                        if (authResult.success) {
                            SudoManager.updateUserTimestamp(currentUser);
                            resolve(await UserManager.sudoExecute(fullCommandStr, options, sessionContext));
                        } else {
                            setTimeout(() => {
                                resolve({ success: false, error: "sudo: Sorry, try again." });
                            }, 1000);
                        }
                    },
                    onCancel: () => resolve({success: true, output: ""}),
                    options: {...options, isObscured: true},
                    sessionContext
                });
            });
        }
    };

    const sudoDescription = "Executes a command as the superuser (root).";
    const sudoHelpText = `Usage: sudo <command> [arguments]

Execute a command with superuser privileges.

DESCRIPTION
       sudo allows a permitted user to execute a command as the superuser or another
       user, as specified by the security policy in the /etc/sudoers file.

       If the user has a valid timestamp (i.e., they have successfully authenticated
       recently), the command is executed without a password prompt. Otherwise, sudo
       requires the user to authenticate with their own password.

       To edit the sudoers file, use the 'visudo' command.`;

    CommandRegistry.register("sudo", sudoCommandDefinition, sudoDescription, sudoHelpText);

})();