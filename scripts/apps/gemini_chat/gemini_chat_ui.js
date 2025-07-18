// scripts/apps/gemini_chat/gemini_chat_ui.js

const GeminiChatUI = (() => {
    "use strict";

    let elements = {};
    let managerCallbacks = {};

    function buildAndShow(callbacks) {
        managerCallbacks = callbacks;

        // Create DOM elements
        elements.container = Utils.createElement('div', { id: 'gemini-chat-container' });
        const title = Utils.createElement('h2', { textContent: 'Gemini Chat' });
        const exitBtn = Utils.createElement('button', { className: 'btn btn--cancel', textContent: 'Exit' });
        const header = Utils.createElement('header', { className: 'gemini-chat-header' }, [title, exitBtn]);
        elements.messageDisplay = Utils.createElement('div', { className: 'gemini-chat-messages' });
        elements.loader = Utils.createElement('div', { className: 'gemini-chat-loader hidden' }, [
            Utils.createElement('span'), Utils.createElement('span'), Utils.createElement('span'),
        ]);
        elements.input = Utils.createElement('input', {
            type: 'text',
            placeholder: 'Type your message...',
            className: 'gemini-chat-input'
        });
        const sendBtn = Utils.createElement('button', { className: 'btn btn--confirm', textContent: 'Send' });
        const form = Utils.createElement('form', { className: 'gemini-chat-form' }, [elements.input, sendBtn]);

        elements.container.append(header, elements.messageDisplay, elements.loader, form);

        // Add event listeners
        exitBtn.addEventListener('click', () => managerCallbacks.onExit());
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await managerCallbacks.onSendMessage(elements.input.value);
            elements.input.value = '';
        });
        elements.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                form.requestSubmit();
            }
        });

        elements.input.focus();
        return elements.container;
    }

    function hideAndReset() {
        if (elements.container) {
            elements.container.remove();
        }
        elements = {};
        managerCallbacks = {};
    }

    function appendMessage(message, sender, processMarkdown) {
        if (!elements.messageDisplay) return;

        const messageDiv = Utils.createElement('div', {
            className: `gemini-chat-message ${sender}`
        });

        if (processMarkdown) {
            const sanitizedHtml = DOMPurify.sanitize(marked.parse(message));
            messageDiv.innerHTML = sanitizedHtml;

            const copyBtn = Utils.createElement('button', { class: 'btn', style: 'position: absolute; top: 5px; right: 5px; font-size: 0.75rem; padding: 2px 5px;', textContent: 'Copy' });
            copyBtn.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(message);
                    copyBtn.textContent = 'Copied!';
                    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
                } catch (err) {
                    console.error("Failed to copy text:", err);
                    copyBtn.textContent = 'Error!';
                    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
                }
            });
            messageDiv.style.position = 'relative';
            messageDiv.appendChild(copyBtn);

            messageDiv.querySelectorAll('pre > code').forEach(codeBlock => {
                const commandText = codeBlock.textContent.trim();
                if (!commandText.includes('\n')) {
                    const runButton = Utils.createElement('button', {
                        class: 'btn btn--confirm',
                        textContent: `Run Command`,
                        style: 'display: block; margin-top: 10px;'
                    });
                    runButton.addEventListener('click', () => managerCallbacks.onRunCommand(commandText));
                    codeBlock.parentElement.insertAdjacentElement('afterend', runButton);
                }
            });

        } else {
            messageDiv.textContent = message;
        }

        elements.messageDisplay.appendChild(messageDiv);
        elements.messageDisplay.scrollTop = elements.messageDisplay.scrollHeight;
    }

    function toggleLoader(show) {
        if (elements.loader) {
            elements.loader.classList.toggle('hidden', !show);
        }
    }

    return {
        buildAndShow,
        hideAndReset,
        appendMessage,
        toggleLoader
    };
})();