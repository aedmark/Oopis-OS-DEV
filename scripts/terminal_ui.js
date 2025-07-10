const ModalManager = (() => {
    "use strict";
    let isAwaitingTerminalInput = false;
    let activeModalContext = null;

    function _renderGraphicalModal(options) {
        const {
            messageLines,
            onConfirm,
            onCancel,
            confirmText = "OK",
            cancelText = "Cancel",
            session // <-- The session is now passed here
        } = options;

        // --- MODIFICATION START ---
        // The modal is now attached to the session's specific app layer, not the global bezel.
        const parentContainer = session.domElements.appLayer;
        if (!parentContainer) {
            console.error("ModalManager: Cannot find the session's app-layer to attach modal.");
            if (options.onCancel) options.onCancel();
            return;
        }
        parentContainer.classList.remove('hidden'); // Make the layer visible
        // --- MODIFICATION END ---


        const removeModal = () => {
            const modal = parentContainer.querySelector("#dynamic-modal-dialog");
            if (modal && modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
            // --- MODIFICATION START ---
            // Hide the app layer again when the modal is closed.
            parentContainer.classList.add('hidden');
            // --- MODIFICATION END ---
        };

        const confirmButton = Utils.createElement("button", {className: "btn btn--confirm", textContent: confirmText});
        const cancelButton = Utils.createElement("button", {className: "btn btn--cancel", textContent: cancelText});

        confirmButton.addEventListener('click', () => {
            removeModal();
            onConfirm?.();
        });
        cancelButton.addEventListener('click', () => {
            removeModal();
            onCancel?.();
        });

        const buttonContainer = Utils.createElement("div", { className: "modal-dialog__buttons" }, [confirmButton, cancelButton]);
        const messageContainer = Utils.createElement("div");
        messageLines.forEach((line) => {
            messageContainer.appendChild(Utils.createElement("p", { textContent: line }));
        });

        const modalDialog = Utils.createElement("div", { className: "modal-dialog" }, [messageContainer, buttonContainer]);
        const modalOverlay = Utils.createElement("div", { id: "dynamic-modal-dialog", className: "modal-overlay" }, [modalDialog]);

        parentContainer.appendChild(modalOverlay);
    }

    function _renderGraphicalInputModal(options) {
        const {
            messageLines,
            onConfirm,
            onCancel,
            confirmText = "OK",
            cancelText = "Cancel",
            placeholder = "",
            session // <-- The session is now passed here
        } = options;

        // --- MODIFICATION START ---
        const parentContainer = session.domElements.appLayer;
        if (!parentContainer) {
            if (onCancel) onCancel();
            return;
        }
        parentContainer.classList.remove('hidden'); // Make the layer visible
        // --- MODIFICATION END ---


        const removeModal = () => {
            const modal = parentContainer.querySelector("#dynamic-modal-dialog");
            if (modal && modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
            // --- MODIFICATION START ---
            parentContainer.classList.add('hidden');
            // --- MODIFICATION END ---
        };


        const inputField = Utils.createElement('input', {
            type: 'text',
            placeholder: placeholder,
            className: 'modal-dialog__input'
        });
        const confirmButton = Utils.createElement("button", { className: "btn btn--confirm", textContent: confirmText });
        const cancelButton = Utils.createElement("button", { className: "btn btn--cancel", textContent: cancelText });

        const handleConfirm = () => {
            removeModal();
            onConfirm?.(inputField.value);
        };
        const handleCancel = () => {
            removeModal();
            onCancel?.();
        };

        confirmButton.addEventListener('click', handleConfirm);
        cancelButton.addEventListener('click', handleCancel);

        inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleConfirm();
            else if (e.key === 'Escape') handleCancel();
        });

        const buttonContainer = Utils.createElement("div", { className: "modal-dialog__buttons" }, [confirmButton, cancelButton]);
        const messageContainer = Utils.createElement("div");
        messageLines.forEach(line => messageContainer.appendChild(Utils.createElement("p", {textContent: line})));

        const modalDialog = Utils.createElement("div", { className: "modal-dialog" }, [messageContainer, inputField, buttonContainer]);
        const modalOverlay = Utils.createElement("div", { id: "dynamic-modal-dialog", className: "modal-overlay" }, [modalDialog]);

        parentContainer.appendChild(modalOverlay);
        inputField.focus();
    }

    function _renderTerminalPrompt(options) {
        const {session} = options;
        if (isAwaitingTerminalInput) {
            if (options.onCancel) options.onCancel();
            return;
        }
        isAwaitingTerminalInput = true;
        activeModalContext = {
            onConfirm: options.onConfirm,
            onCancel: options.onCancel,
            data: options.data || {},
            session: session
        };
        options.messageLines.forEach((line) => void OutputManager.appendToOutput(line, {
            typeClass: 'text-warning',
            outputEl: session.domElements.output
        }));
        void OutputManager.appendToOutput(Config.MESSAGES.CONFIRMATION_PROMPT, {
            typeClass: 'text-subtle',
            outputEl: session.domElements.output
        });

        session.domElements.inputLine.classList.remove('hidden');
        session.domElements.input.contentEditable = "true";
        session.domElements.input.focus();
        session.domElements.input.textContent = "";

        session.domElements.output.scrollTop = session.domElements.output.scrollHeight;
    }

    function request(options) {
        const session = options.sessionContext || TerminalManager.getActiveSession();
        if (!session) {
            console.error("ModalManager.request called without active session.");
            return;
        }
        options.session = session;

        if (options.options?.scriptingContext?.isScripting) {
            const scriptContext = options.options.scriptingContext;
            let inputLine = null;
            let nextLineIndex = scriptContext.currentLineIndex + 1;
            while (nextLineIndex < scriptContext.lines.length) {
                const line = scriptContext.lines[nextLineIndex].trim();
                if (line && !line.startsWith('#')) {
                    inputLine = line;
                    scriptContext.currentLineIndex = nextLineIndex;
                    break;
                }
                nextLineIndex++;
            }
            if (inputLine !== null) {
                options.messageLines.forEach(line => OutputManager.appendToOutput(line, {
                    typeClass: 'text-warning',
                    outputEl: session.domElements.output
                }));
                OutputManager.appendToOutput(Config.MESSAGES.CONFIRMATION_PROMPT, {
                    typeClass: 'text-subtle',
                    outputEl: session.domElements.output
                });
                const promptEcho = `${session.domElements.prompt.textContent} `;
                OutputManager.appendToOutput(`${promptEcho}${inputLine}`, {outputEl: session.domElements.output});
                if (inputLine.toUpperCase() === 'YES') {
                    if (options.onConfirm) options.onConfirm(options.data);
                } else {
                    if (options.onCancel) options.onCancel(options.data);
                }
            } else {
                if (options.onCancel) options.onCancel(options.data);
            }
            return;
        }

        switch (options.context) {
            case 'graphical':
                _renderGraphicalModal(options);
                break;
            case 'graphical-input':
                _renderGraphicalInputModal(options);
                break;
            default:
                _renderTerminalPrompt(options);
        }
    }

    async function handleTerminalInput(input) {
        if (!isAwaitingTerminalInput) return false;
        const {session} = activeModalContext;

        const promptString = `${session.domElements.prompt.textContent} `;
        await OutputManager.appendToOutput(`${promptString}${input.trim()}`, {outputEl: session.domElements.output});

        if (input.trim().toUpperCase() === "YES") {
            await activeModalContext.onConfirm(activeModalContext.data);
        } else {
            if (typeof activeModalContext.onCancel === "function") {
                await activeModalContext.onCancel(activeModalContext.data);
            } else {
                await OutputManager.appendToOutput(Config.MESSAGES.OPERATION_CANCELLED, {
                    typeClass: 'text-subtle',
                    outputEl: session.domElements.output
                });
            }
        }

        isAwaitingTerminalInput = false;
        activeModalContext = null;
        return true;
    }

    return { request, handleTerminalInput, isAwaiting: () => isAwaitingTerminalInput };
})();

const AppLayerManager = (() => {
    "use strict";
    let isActive = false;
    let currentAppContainer = null;

    function show(appContainerElement, session = TerminalManager.getActiveSession()) {
        if (isActive || !appContainerElement || !session || !session.domElements.appLayer) {
            console.warn("AppLayerManager: Cannot show new app, one is already active or elements are missing.");
            return;
        }

        const {appLayer, input, inputLine, output} = session.domElements;

        input.contentEditable = false;
        OutputManager.setEditorActive(true);

        output.classList.add('hidden');
        inputLine.classList.add('hidden');

        currentAppContainer = appContainerElement;
        appLayer.appendChild(currentAppContainer);
        appLayer.classList.remove('hidden');
        isActive = true;
    }

    function hide(session = TerminalManager.getActiveSession()) {
        if (!isActive || !session || !session.domElements.appLayer) return;

        const {appLayer, input, inputLine, output} = session.domElements;

        appLayer.classList.add('hidden');
        if (currentAppContainer && appLayer.contains(currentAppContainer)) {
            currentAppContainer.remove();
        }
        currentAppContainer = null;

        output.classList.remove('hidden');
        inputLine.classList.remove('hidden');

        TerminalManager.updatePrompt(session);
        output.scrollTop = output.scrollHeight;

        input.textContent = "";
        input.contentEditable = true;
        OutputManager.setEditorActive(false);
        input.focus();

        isActive = false;
    }

    return {
        show,
        hide,
        isActive: () => isActive,
    };
})();