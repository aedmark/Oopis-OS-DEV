// scripts/commands/ocrypt.js
(() => {
    "use strict";

    async function getKey(password, salt) {
        const enc = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            'raw',
            enc.encode(password),
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );
        return window.crypto.subtle.deriveKey(
            {
                "name": 'PBKDF2',
                salt: salt,
                "iterations": 100000,
                "hash": 'SHA-256'
            },
            keyMaterial,
            { "name": 'AES-GCM', "length": 256 },
            true,
            [ "encrypt", "decrypt" ]
        );
    }

    async function encryptData(plaintext, password) {
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const key = await getKey(password, salt);
        const enc = new TextEncoder();

        const encryptedContent = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            enc.encode(plaintext)
        );

        const encryptedContentArr = new Uint8Array(encryptedContent);
        const base64Content = btoa(String.fromCharCode.apply(null, encryptedContentArr));
        const base64Salt = btoa(String.fromCharCode.apply(null, salt));
        const base64Iv = btoa(String.fromCharCode.apply(null, iv));

        const output = {
            salt: base64Salt,
            iv: base64Iv,
            data: base64Content
        };

        return JSON.stringify(output, null, 2);
    }

    async function decryptData(jsonString, password) {
        const encryptedData = JSON.parse(jsonString);
        const salt = new Uint8Array(atob(encryptedData.salt).split('').map(c => c.charCodeAt(0)));
        const iv = new Uint8Array(atob(encryptedData.iv).split('').map(c => c.charCodeAt(0)));
        const data = new Uint8Array(atob(encryptedData.data).split('').map(c => c.charCodeAt(0)));

        const key = await getKey(password, salt);
        const dec = new TextDecoder();

        try {
            const decryptedContent = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                data
            );
            return dec.decode(decryptedContent);
        } catch (e) {
            throw new Error("Decryption failed. The password may be incorrect or the data corrupted.");
        }
    }

    const ocryptCommandDefinition = {
        commandName: "ocrypt",
        description: "Securely encrypts or decrypts a file using AES-GCM.",
        helpText: `Usage: ocrypt <-e|-d> [password] <file>

Encrypt or decrypt a file using a password.

DESCRIPTION
       ocrypt provides strong, password-based encryption for files using the
       AES-GCM standard. This is a secure method for protecting sensitive data.

       You must specify either -e to encrypt or -d to decrypt.

       If a password is not provided on the command line, you will be prompted
       for one in interactive sessions.

OPTIONS
       -e, --encrypt
              Encrypt the specified file. If the file exists, it will be
              overwritten with the encrypted content. If it does not exist,
              it will be created.

       -d, --decrypt
              Decrypt the specified file and print its contents to standard
              output. This does not modify the original encrypted file.

EXAMPLES
       ocrypt -e mySecretPass /home/Guest/secrets.txt
              Encrypts the contents of secrets.txt, saving the result back
              to the same file.

       ocrypt -d mySecretPass /home/Guest/secrets.txt
              Decrypts secrets.txt and prints the original content to the
              terminal.`,
        completionType: "paths",
        flagDefinitions: [
            { name: "encrypt", short: "-e", long: "--encrypt" },
            { name: "decrypt", short: "-d", long: "--decrypt" }
        ],
        coreLogic: async (context) => {
            const {args, flags, options, currentUser} = context;

            try {
                if ((!flags.encrypt && !flags.decrypt) || (flags.encrypt && flags.decrypt)) {
                    return ErrorHandler.createError("ocrypt: You must specify exactly one of -e (encrypt) or -d (decrypt).");
                }

                let password = args[0];
                const filePath = args[1];

                if (!filePath) {
                    return ErrorHandler.createError("ocrypt: File path is required.");
                }

                if (!password) {
                    if (!options.isInteractive) {
                        return ErrorHandler.createError("ocrypt: password must be provided as an argument in non-interactive mode.");
                    }
                    password = await new Promise(resolve => {
                        ModalManager.request({
                            context: 'terminal',
                            type: 'input',
                            messageLines: ["Enter password for ocrypt:"],
                            obscured: true,
                            onConfirm: (pw) => resolve(pw),
                            onCancel: () => resolve(null)
                        });
                    });

                    if (password === null) return ErrorHandler.createSuccess("Operation cancelled.");
                    if (!password) return ErrorHandler.createError("ocrypt: password cannot be empty.");
                }

                const pathValidationResult = FileSystemManager.validatePath(filePath, { allowMissing: flags.encrypt, expectedType: 'file' });

                if (!pathValidationResult.success && !pathValidationResult.data.node) {
                    return ErrorHandler.createError(`ocrypt: ${pathValidationResult.error}`);
                }
                const pathValidation = pathValidationResult.data;

                if (flags.encrypt) {
                    const contentToEncrypt = pathValidation.node?.content || '';
                    const encryptedString = await encryptData(contentToEncrypt, password);

                    const saveResult = await FileSystemManager.createOrUpdateFile(
                        pathValidation.resolvedPath,
                        encryptedString,
                        { currentUser, primaryGroup: UserManager.getPrimaryGroupForUser(currentUser) }
                    );

                    if (!saveResult.success) {
                        return ErrorHandler.createError(`ocrypt: ${saveResult.error}`);
                    }
                    const fsSaveResult = await FileSystemManager.save();
                    if (!fsSaveResult.success) {
                        return ErrorHandler.createError("ocrypt: Failed to save encrypted file.");
                    }
                    return ErrorHandler.createSuccess(`File '${filePath}' encrypted successfully.`);

                } else { // Decrypt
                    if (!pathValidation.node) {
                        return ErrorHandler.createError(`ocrypt: file not found: ${filePath}`);
                    }
                    if (!FileSystemManager.hasPermission(pathValidation.node, currentUser, "read")) {
                        return ErrorHandler.createError(`ocrypt: cannot read '${filePath}': Permission denied`);
                    }
                    try {
                        const decryptedContent = await decryptData(pathValidation.node.content, password);
                        return ErrorHandler.createSuccess(decryptedContent);
                    } catch (e) {
                        return ErrorHandler.createError(e.message);
                    }
                }
            } catch (e) {
                return ErrorHandler.createError(`ocrypt: An unexpected error occurred: ${e.message}`);
            }
        }
    };
    CommandRegistry.register(ocryptCommandDefinition);
})();