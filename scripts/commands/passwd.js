// scripts/commands/passwd.js
(() => {
    "use strict";

    const passwdCommandDefinition = {
        commandName: "passwd",
        completionType: "users",
        argValidation: {
            max: 1,
        },
        coreLogic: async (context) => {
            const { args, currentUser, options } = context;

            try {
                if (!options.isInteractive) {
                    return { success: false, error: "passwd: can only be run in interactive mode." };
                }

                const targetUsername = args[0] || currentUser;

                if (currentUser !== 'root' && currentUser !== targetUsername) {
                    return { success: false, error: "passwd: you may only change your own password." };
                }

                if (!await UserManager.userExists(targetUsername)) {
                    return { success: false, error: `passwd: user '${targetUsername}' does not exist.` };
                }

                return new Promise(resolve => {
                    const getNewPassword = (oldPassword) => {
                        ModalManager.request({
                            context: 'terminal',
                            type: 'input',
                            messageLines: [`Enter new password for ${targetUsername}:`],
                            obscured: true,
                            onConfirm: (newPassword) => {
                                if (!newPassword) {
                                    resolve({ success: false, error: Config.MESSAGES.EMPTY_PASSWORD_NOT_ALLOWED });
                                    return;
                                }
                                ModalManager.request({
                                    context: 'terminal',
                                    type: 'input',
                                    messageLines: [`Confirm new password:`],
                                    obscured: true,
                                    onConfirm: async (confirmPassword) => {
                                        if (newPassword !== confirmPassword) {
                                            resolve({ success: false, error: Config.MESSAGES.PASSWORD_MISMATCH });
                                            return;
                                        }
                                        const result = await UserManager.changePassword(currentUser, targetUsername, oldPassword, newPassword);
                                        resolve(result);
                                    },
                                    onCancel: () => resolve({ success: true, output: Config.MESSAGES.OPERATION_CANCELLED })
                                });
                            },
                            onCancel: () => resolve({ success: true, output: Config.MESSAGES.OPERATION_CANCELLED })
                        });
                    };

                    if (currentUser === 'root' && currentUser !== targetUsername) {
                        getNewPassword(null);
                    } else {
                        ModalManager.request({
                            context: 'terminal',
                            type: 'input',
                            messageLines: [`Enter current password for ${currentUser}:`],
                            obscured: true,
                            onConfirm: (oldPassword) => getNewPassword(oldPassword),
                            onCancel: () => resolve({ success: true, output: Config.MESSAGES.OPERATION_CANCELLED })
                        });
                    }
                });
            } catch (e) {
                return { success: false, error: `passwd: An unexpected error occurred: ${e.message}` };
            }
        }
    };

    const passwdDescription = "Change a user's password.";
    const passwdHelpText = `Usage: passwd [username]

Change a user's password.

DESCRIPTION
       The passwd command updates the password for a user account.

       If run without arguments, it changes the password for the current user.
       You will be prompted for your current password, and then for the new password twice.

       The root user can change the password for any user by specifying their
       username, and will not be prompted for the old password.

EXAMPLES
       passwd
              Initiates the process to change your own password.

       sudo passwd Guest
              As root, initiates the process to change the password for 'Guest'.`;

    CommandRegistry.register("passwd", passwdCommandDefinition, passwdDescription, passwdHelpText);
})();