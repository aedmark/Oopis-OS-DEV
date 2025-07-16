// scripts/apps/chidi/chidi_manager.js

class ChidiManager extends App {
    constructor() {
        super();
        this.state = {};
        this.callbacks = this._createCallbacks();
    }

    enter(appLayer, options = {}) {
        if (this.isActive) return;

        this._initializeState(options.initialFiles, options.launchOptions);
        this.isActive = true;

        this.container = ChidiUI.buildAndShow(this.state, this.callbacks);
        appLayer.appendChild(this.container);

        const initialMessage = this.state.isNewSession
            ? `New session started. Analyzing ${this.state.loadedFiles.length} files.`
            : `Chidi.md initialized. Analyzing ${this.state.loadedFiles.length} files.`;
        ChidiUI.showMessage(initialMessage, true);
    }

    exit() {
        if (!this.isActive) return;
        ChidiUI.hideAndReset();
        AppLayerManager.hide(this);
        this.isActive = false;
        this.state = {};
    }

    _initializeState(initialFiles, launchOptions) {
        this.state = {
            isActive: true,
            loadedFiles: initialFiles.map(file => ({
                ...file,
                isCode: ['js', 'sh'].includes(Utils.getFileExtension(file.name))
            })),
            currentIndex: initialFiles.length > 0 ? 0 : -1,
            isNewSession: launchOptions.isNewSession,
            provider: launchOptions.provider || 'gemini',
            model: launchOptions.model || null,
            conversationHistory: [],
            sessionContext: initialFiles.map(file => `--- START OF DOCUMENT: ${file.name} ---\n\n${file.content}\n\n--- END OF DOCUMENT ---`).join('\n\n'),
            CHIDI_SYSTEM_PROMPT: `You are Chidi, an AI-powered document analyst.

**Rules:**
- Your answers MUST be based *only* on the provided document context and the ongoing conversation history.
- If the answer is not in the documents, state that clearly. Do not use outside knowledge.
- Be concise, helpful, and directly answer the user's question.

--- PROVIDED DOCUMENT CONTEXT ---
{{documentContext}}
--- END DOCUMENT CONTEXT ---`
        };

        if (launchOptions.isNewSession) {
            this.state.conversationHistory = [];
        }
    }

    async _callLlmApi(chatHistory, systemPrompt) {
        let apiKey = null;
        if (this.state.provider === 'gemini') {
            apiKey = StorageManager.loadItem(Config.STORAGE_KEYS.GEMINI_API_KEY);
            if (!apiKey) {
                ChidiUI.showMessage("Error: Gemini API key not found.", true);
                ChidiUI.appendAiOutput("API Error", "A Gemini API key is required. Please run `gemini` once in the terminal to set it up.");
                return null;
            }
        }

        const result = await Utils.callLlmApi(this.state.provider, this.state.model, chatHistory, apiKey, systemPrompt);

        if (!result.success) {
            const errorMsg = `Failed to get a response. Details: ${result.error}`;
            ChidiUI.showMessage(`Error: ${result.error}`, true);
            ChidiUI.appendAiOutput("API Error", errorMsg);
            return null;
        }
        ChidiUI.showMessage("Response received.", true);
        return result.answer;
    }

    _createCallbacks() {
        return {
            onAsk: async (userQuestion) => {
                if (!userQuestion || !userQuestion.trim()) return;

                ChidiUI.toggleLoader(true);
                ChidiUI.showMessage("Analyzing...");

                this.state.conversationHistory.push({ role: 'user', parts: [{ text: userQuestion }] });

                const systemPromptWithContext = this.state.CHIDI_SYSTEM_PROMPT.replace('{{documentContext}}', this.state.sessionContext);
                const llmResult = await this._callLlmApi(this.state.conversationHistory, systemPromptWithContext);

                if (llmResult) {
                    this.state.conversationHistory.push({ role: 'model', parts: [{ text: llmResult }] });
                } else {
                    this.state.conversationHistory.pop();
                }

                ChidiUI.toggleLoader(false);
                ChidiUI.appendAiOutput(`Answer for "${userQuestion}"`, llmResult || "I could not generate an answer based on the provided context.");
            },
            onFileSelect: (index) => {
                this.state.currentIndex = index;
                ChidiUI.update(this.state);
            },
            onSummarize: async () => {
                const currentFile = this.state.loadedFiles[this.state.currentIndex];
                if (!currentFile) return;
                ChidiUI.toggleLoader(true);
                ChidiUI.showMessage(`Contacting ${this.state.provider} API...`);
                const contentToSummarize = currentFile.isCode ? Utils.extractComments(currentFile.content, Utils.getFileExtension(currentFile.name)) : currentFile.content;
                const prompt = `Please provide a concise summary of the following document:\n\n---\n\n${contentToSummarize}`;
                const summary = await this._callLlmApi([{ role: 'user', parts: [{ text: prompt }] }]);
                ChidiUI.toggleLoader(false);
                ChidiUI.appendAiOutput("Summary", summary);
            },
            onStudy: async () => {
                const currentFile = this.state.loadedFiles[this.state.currentIndex];
                if (!currentFile) return;
                ChidiUI.toggleLoader(true);
                ChidiUI.showMessage(`Contacting ${this.state.provider} API...`);
                const contentForQuestions = currentFile.isCode ? Utils.extractComments(currentFile.content, Utils.getFileExtension(currentFile.name)) : currentFile.content;
                const prompt = `Based on the following document, what are some insightful questions a user might ask?\n\n---\n\n${contentForQuestions}`;
                const questions = await this._callLlmApi([{ role: 'user', parts: [{ text: prompt }] }]);
                ChidiUI.toggleLoader(false);
                ChidiUI.appendAiOutput("Suggested Questions", questions);
            },
            onSaveSession: async (filename) => {
                const htmlContent = ChidiUI.packageSessionAsHTML(this.state);
                const absPath = FileSystemManager.getAbsolutePath(filename);
                const saveResult = await FileSystemManager.createOrUpdateFile(absPath, htmlContent, {
                    currentUser: UserManager.getCurrentUser().name,
                    primaryGroup: UserManager.getPrimaryGroupForUser(UserManager.getCurrentUser().name)
                });
                if (saveResult.success && await FileSystemManager.save()) {
                    ChidiUI.showMessage(`Session saved to '${filename}'.`, true);
                } else {
                    ChidiUI.showMessage(`Error: ${saveResult.error || "Failed to save file system."}`, true);
                }
            },
            onExport: () => {
                const htmlContent = ChidiUI.packageSessionAsHTML(this.state);
                const currentFile = this.state.loadedFiles[this.state.currentIndex];
                const blob = new Blob([htmlContent], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const a = Utils.createElement('a', {
                    href: url,
                    download: `${currentFile.name.replace(/\.(md|txt|js|sh)$/, '')}_session.html`
                });
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                ChidiUI.showMessage(`Exported session for ${currentFile.name}.`, true);
            },
            onClose: this.exit.bind(this),
        };
    }
}

const Chidi = new ChidiManager();