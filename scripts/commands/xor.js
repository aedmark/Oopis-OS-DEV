// scripts/commands/xor.js
(() => {
    "use strict";

    function xorCipher(data, key) {
        let output = '';
        for (let i = 0; i < data.length; i++) {
            const charCode = data.charCodeAt(i) ^ key.charCodeAt(i % key.length);
            output += String.fromCharCode(charCode);
        }
        return output;
    }

    const xorCommandDefinition = {
        commandName: "xor",
        description: "Simple symmetric XOR cipher for data obfuscation (educational).",
        helpText: `Usage: xor [password] [FILE]
       cat [FILE] | xor [password]

Obfuscate data using a simple password-based XOR cipher.

DESCRIPTION
       xor transforms data from a FILE or standard input using a symmetric
       XOR cipher. The same command and password are used for both obfuscation
       and reversal.

       WARNING: This utility is for educational purposes only. It provides
       NO REAL SECURITY and should not be used to protect sensitive data.

PIPELINE SECURITY
       For enhanced security, use the new 'ocrypt' command which implements
       strong, modern encryption. 'xor' can be combined with 'base64' to make
       its binary output safe for text-based storage.

       Obfuscate: cat secret.txt | xor "my-pass" | base64 > safe.txt
       De-obfuscate: cat safe.txt | base64 -d | xor "my-pass" > secret.txt`,
        isInputStream: true,
        completionType: "paths",
        firstFileArgIndex: 1,
        coreLogic: async (context) => {
            const { args, options, inputItems, inputError } = context;

            try {
                if (inputError) {
                    return ErrorHandler.createError("xor: No readable input provided or permission denied.");
                }

                if (!inputItems || inputItems.length === 0) {
                    return ErrorHandler.createSuccess("");
                }

                const inputData = inputItems.map(item => item.content).join('\\n');

                let password = args[0];

                if (password === null || password === undefined) {
                    if (!options.isInteractive) {
                        return ErrorHandler.createError("xor: password must be provided as an argument in non-interactive mode.");
                    }
                    password = await new Promise(resolve => {
                        ModalManager.request({
                            context: "terminal",
                            type: "input",
                            messageLines: ["Enter password for xor:"],
                            obscured: true,
                            onConfirm: (pw) => resolve(pw),
                            onCancel: () => resolve(null)
                        });
                    });

                    if (password === null) {
                        return ErrorHandler.createSuccess("Operation cancelled.");
                    }
                }

                if (!password) {
                    return ErrorHandler.createError("xor: password cannot be empty.");
                }

                const processedData = xorCipher(inputData, password);
                return ErrorHandler.createSuccess(processedData);
            } catch (e) {
                return ErrorHandler.createError(`xor: An unexpected error occurred: ${e.message}`);
            }
        }
    };
    CommandRegistry.register(xorCommandDefinition);
})();