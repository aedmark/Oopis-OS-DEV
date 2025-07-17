// scripts/apps/gemini_chat/gemini_chat_manager.js

class GeminiChatManager extends App {
    constructor() {
        super();
        this.state = {};
        this.callbacks = this._createCallbacks();
    }

    async enter(appLayer, options = {}) {
        if (this.isActive) return;

        this.isActive = true;
        this.state = {
            isActive: true,
            conversationHistory: [],
            provider: options.provider || 'gemini',
            model: options.model || null,
        };

        const pwdResult = await CommandExecutor.processSingleCommand("pwd", { suppressOutput: true });
        const lsResult = await CommandExecutor.processSingleCommand("ls -la", { suppressOutput: true });
        const historyResult = await CommandExecutor.processSingleCommand("history", { suppressOutput: true });

        const systemContext = `You are a helpful assistant operating inside a browser-based simulated OS called OopisOS. The user has opened this chat interface. Below is the context of their current terminal session. Use it to inform your answers.

## OopisOS Session Context ##
Current Directory:
${pwdResult.output || '(unknown)'}

Directory Listing (ls -la):
${lsResult.output || '(empty)'}

Recent Command History:
${historyResult.output || '(none)'}
`;

        this.state.conversationHistory.push({ role: 'system', parts: [{ text: systemContext }] });

        this.container = GeminiChatUI.buildAndShow(this.callbacks);
        appLayer.appendChild(this.container);
        this.container.focus();
    }

    exit() {
        if (!this.isActive) return;
        GeminiChatUI.hideAndReset();
        AppLayerManager.hide(this);
        this.isActive = false;
        this.state = {};
    }

    handleKeyDown(event) {
        if(event.key === "Escape") {
            this.exit();
        }
    }

    _createCallbacks() {
        return {
            onSendMessage: async (userInput) => {
                if (!userInput || userInput.trim() === '') return;

                const userMessage = { role: 'user', parts: [{ text: userInput }] };
                this.state.conversationHistory.push(userMessage);

                GeminiChatUI.appendMessage(userInput, 'user', false); // No markdown for user messages
                GeminiChatUI.toggleLoader(true);

                let apiKey = null;

                if (this.state.provider === 'gemini') {
                    apiKey = StorageManager.loadItem(Config.STORAGE_KEYS.GEMINI_API_KEY);
                    if (!apiKey) {
                        GeminiChatUI.toggleLoader(false);
                        const errorMsg = "Error: Gemini API key not set. Please run the `gemini` command in the terminal once to set it.";
                        GeminiChatUI.appendMessage(errorMsg, 'ai', true);
                        this.state.conversationHistory.pop();
                        return;
                    }
                }

                const result = await Utils.callLlmApi(this.state.provider, this.state.model, this.state.conversationHistory, null);

                GeminiChatUI.toggleLoader(false);

                if (result.success) {
                    const aiResponse = result.answer;
                    this.state.conversationHistory.push({ role: 'model', parts: [{ text: aiResponse }] });
                    GeminiChatUI.appendMessage(aiResponse, 'ai', true); // Process markdown for AI messages
                } else {
                    const errorMessage = `AI Error: ${result.error}`;
                    GeminiChatUI.appendMessage(errorMessage, 'ai', true);
                    this.state.conversationHistory.pop();
                }
            },
            onExit: this.exit.bind(this),
            onRunCommand: async (commandText) => {
                this.exit(); // Exit the chat UI first
                await new Promise(resolve => setTimeout(resolve, 50)); // Small delay to ensure UI is hidden
                await CommandExecutor.processSingleCommand(commandText, { isInteractive: true });
            }
        };
    }
}

const GeminiChat = new GeminiChatManager();