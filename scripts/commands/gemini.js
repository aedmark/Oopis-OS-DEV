// scripts/commands/gemini.js
(() => {
    "use strict";

    let conversationHistory = [];
    const COMMAND_WHITELIST = ['ls', 'cat', 'grep', 'find', 'tree', 'pwd', 'head', 'shuf', 'xargs', 'echo', 'tail', 'csplit', 'wc', 'awk', 'sort', 'touch'];

    const PLANNER_SYSTEM_PROMPT = `You are a command-line Agent for OopisOS. You analyze the user's prompt and system context and generate a series of OopisOS commands to gather information.
- If the request is general knowledge, respond with the direct answer.
- If the request is ambiguous, ask for clarification.
- You ONLY use commands from the "Tool Manifest".
- Each command in the plan must be simple and stand-alone. Obey the rules of OopisOS.
- Enclose any arguments that contain spaces in double quotes (e.g., cat "a file with spaces.txt").

--- TOOL MANIFEST ---
ls [-l, -a, -R], cat, grep [-i, -v, -n, -R], find [path] -name [pattern] -type [f|d], tree, pwd, head [-n], tail [-n], wc, touch, xargs, shuf, tail, csplit, awk, sort, echo, man, help, set, history, mkdir
--- END MANIFEST ---`;

    const SYNTHESIZER_SYSTEM_PROMPT = `You are a helpful digital librarian. Your task is to synthesize a final, natural-language answer for the user based on their original prompt and the provided output from a series of commands.

**Rules:**
- Formulate a comprehensive answer using only the provided command outputs.
- If the tool context is insufficient to answer the question, state that you don't know enough to answer.`;


    const geminiCommandDefinition = {
        commandName: "gemini",
        dependencies: [
            'apps/gemini_chat/gemini_chat_ui.js',
            'apps/gemini_chat/gemini_chat_manager.js'
        ],
        description: "Engages in a context-aware conversation with a configured AI model.",
        helpText: `Usage: gemini [-c | --chat] [-n|--new] [-v|--verbose] [-p provider] [-m model] [-f|--force] "<prompt>"

Engage in a context-aware conversation with an AI model.

DESCRIPTION
       The gemini command sends a prompt to a configured AI model.

       When using the default 'gemini' provider (Google's API), it acts as a powerful
       assistant capable of using system tools to answer questions about your files.
       It orchestrates multiple steps behind the scenes (planning, tool execution, synthesis).

       When using a local provider (e.g., 'ollama', 'llm-studio'), the user's prompt
       is sent directly to the local model. Tool-use capabilities for local models
       depend on the model's own training and user's explicit instructions in the prompt.
       If a local provider is specified but unavailable, it will fall back to the
       default 'gemini' provider and notify you.

       The entire prompt, if it contains spaces, must be enclosed in double quotes.

MODES
       -c, --chat
              Launches the full-screen Gemini Chat application for an interactive
              conversational experience.

PROVIDERS & MODELS
       -p, --provider   Specify the provider (e.g., 'ollama', 'gemini').
                        Defaults to 'gemini'.
       -m, --model      Specify a model for the provider (e.g., 'llama3').
                        Defaults to the provider's default model.

OPTIONS
       -n, --new
              Starts a new, fresh conversation, clearing any previous
              conversational memory from the current session.
       -v, --verbose
          Only applicable to the 'gemini' provider. Enable verbose logging to see
          the AI's step-by-step plan and the output of the commands it executes.
       -f, --force
              Forces the use of the selected provider for the entire tool-use
              orchestration (planning, tool execution, and synthesis steps).
              This allows experimenting with local models to perform structured
              tool-use. Results may vary significantly based on the local model's
              training. An API key is only required if 'gemini' is the chosen
              provider for this orchestration.

EXAMPLES
       gemini -c
              Launches the interactive chat application.
       gemini "Summarize my README.md and list any scripts in this directory"
              (Uses Google Gemini, leveraging its tool-use capabilities)
`,
        flagDefinitions: [
            { name: "chat", short: "-c", long: "--chat" },
            { name: "new", short: "-n", long: "--new" },
            { name: "verbose", short: "-v", long: "--verbose" },
            { name: "provider", short: "-p", long: "--provider", takesValue: true },
            { name: "model", short: "-m", long: "--model", takesValue: true },
            { name: "forceToolUse", short: "-f", long: "--force", description: "Force the Gemini tool-use logic (planner/synthesizer) for any provider." }
        ],
        coreLogic: async (context) => {
            const {args, options, flags} = context;

            try {
                if (flags.chat) {
                    if (!options.isInteractive) {
                        return ErrorHandler.createError("gemini: Chat mode can only be run in interactive mode.");
                    }
                    if (typeof GeminiChat === 'undefined' || typeof GeminiChatUI === 'undefined' || typeof App === 'undefined') {
                        return ErrorHandler.createError("gemini: The GeminiChat application modules are not loaded.");
                    }
                    AppLayerManager.show(GeminiChat, { provider: flags.provider, model: flags.model });
                    return ErrorHandler.createSuccess("");
                }

                if (args.length === 0) {
                    return ErrorHandler.createError('Insufficient arguments. Usage: gemini [-p provider] [-m model] "<prompt>"');
                }

                let provider = flags.provider || 'gemini';
                const originalProvider = provider;
                const model = flags.model || null;
                let apiKey = null;

                const userPrompt = args.join(" ");

                const requiresGeminiApiKey = provider === 'gemini';

                if (requiresGeminiApiKey) {
                    const apiKeyResult = await new Promise(resolve => {
                        let key = StorageManager.loadItem(Config.STORAGE_KEYS.GEMINI_API_KEY);
                        if (key) resolve({ success: true, key, fromStorage: true });
                        else ModalManager.request({
                            context: "terminal",
                            type: "input",
                            messageLines: ["Please enter your Gemini API key:"],
                            obscured: true,
                            onConfirm: (providedKey) => {
                                if (!providedKey || providedKey.trim() === "") {
                                    resolve(ErrorHandler.createError("API key entry cancelled or empty."));
                                    return;
                                }
                                StorageManager.saveItem(Config.STORAGE_KEYS.GEMINI_API_KEY, providedKey, "Gemini API Key");
                                OutputManager.appendToOutput("API Key saved.", { typeClass: Config.CSS_CLASSES.SUCCESS_MSG });
                                resolve(ErrorHandler.createSuccess({ key: providedKey, fromStorage: false }));
                            },
                            onCancel: () => {
                                resolve(ErrorHandler.createError("API key entry cancelled."));
                            },
                            options
                        });
                    });

                    if (!apiKeyResult.success) return ErrorHandler.createError(`gemini: ${apiKeyResult.error}`);
                    apiKey = apiKeyResult.data.key;
                }

                if (flags.new) {
                    conversationHistory = [];
                    if (options.isInteractive) await OutputManager.appendToOutput("Starting a new conversation.", {typeClass: Config.CSS_CLASSES.CONSOLE_LOG_MSG});
                }

                if (options.isInteractive) await OutputManager.appendToOutput("AI is thinking...", {typeClass: Config.CSS_CLASSES.CONSOLE_LOG_MSG});

                const isGeminiProvider = provider === 'gemini';
                const shouldUseToolUseLogic = isGeminiProvider || flags.forceToolUse;

                if (shouldUseToolUseLogic) {

                    const pwdResult = await CommandExecutor.processSingleCommand("pwd", { suppressOutput: true });
                    const lsResult = await CommandExecutor.processSingleCommand("ls -la", { suppressOutput: true });
                    const historyResult = await CommandExecutor.processSingleCommand("history", { suppressOutput: true });
                    const setResult = await CommandExecutor.processSingleCommand("set", { suppressOutput: true });

                    const localContext = `
## OopisOS Session Context ##
Current Directory:
${pwdResult.output || '(unknown)'}

Directory Listing:
${lsResult.output || '(empty)'}

Recent Commands:
${historyResult.output || '(none)'}

Environment Variables:
${setResult.output || '(none)'}
`;
                    const plannerPrompt = `User Prompt: "${userPrompt}"\n\n${localContext}`;

                    const plannerConversation = [...conversationHistory, { role: "user", parts: [{ text: plannerPrompt }] }];

                    let plannerResult = await Utils.callLlmApi(provider, model, plannerConversation, apiKey, PLANNER_SYSTEM_PROMPT);

                    if (!plannerResult.success && plannerResult.error === 'LOCAL_PROVIDER_UNAVAILABLE') {
                        if (options.isInteractive) {
                            await OutputManager.appendToOutput(`gemini: Could not connect to '${originalProvider}' for planning. Falling back to Google Gemini for tool orchestration.`, {typeClass: Config.CSS_CLASSES.WARNING_MSG});
                        }
                        provider = 'gemini';
                        const fallbackApiKeyResult = await new Promise(resolve => {
                            let key = StorageManager.loadItem(Config.STORAGE_KEYS.GEMINI_API_KEY);
                            if (key) resolve(ErrorHandler.createSuccess({ key: key, fromStorage: true }));
                            else resolve(ErrorHandler.createError("Google Gemini API key not found for fallback."));
                        });
                        if (!fallbackApiKeyResult.success) return ErrorHandler.createError(`gemini: ${fallbackApiKeyResult.error}`);
                        apiKey = fallbackApiKeyResult.data.key;

                        plannerResult = await Utils.callLlmApi(provider, model, plannerConversation, apiKey, PLANNER_SYSTEM_PROMPT);
                    }

                    if (!plannerResult.success) {
                        if (plannerResult.error === "INVALID_API_KEY") {
                            StorageManager.removeItem(Config.STORAGE_KEYS.GEMINI_API_KEY);
                            if (options.isInteractive) {
                                await OutputManager.appendToOutput("Gemini API key was invalid and has been removed.", {typeClass: Config.CSS_CLASSES.WARNING_MSG});
                            }
                            return ErrorHandler.createError("gemini: Your API key is invalid. Please run the command again.");
                        }
                        return ErrorHandler.createError(`gemini: Planner stage failed. ${plannerResult.error}`);
                    }

                    const planText = plannerResult.answer?.trim();
                    if (!planText) return ErrorHandler.createError("gemini: AI failed to generate a valid plan or response.");

                    const firstWordOfPlan = planText.split(/\s+/)[0];
                    if (!COMMAND_WHITELIST.includes(firstWordOfPlan)) {
                        conversationHistory.push({ role: "user", parts: [{ text: userPrompt }] });
                        conversationHistory.push({ role: "model", parts: [{ text: planText }] });
                        return ErrorHandler.createSuccess(planText);
                    }

                    let executedCommandsOutput = "";
                    const commandsToExecute = planText.split('\n').map(line => line.replace(/^\d+\.\s*/, '').trim()).filter(Boolean);
                    if (flags.verbose && options.isInteractive) {
                        await OutputManager.appendToOutput(`AI's Plan:\n${commandsToExecute.map(c => `- ${c}`).join('\n')}`, {typeClass: Config.CSS_CLASSES.CONSOLE_LOG_MSG});
                    }

                    for (const commandStr of commandsToExecute) {
                        const commandName = commandStr.split(' ')[0];
                        if (!COMMAND_WHITELIST.includes(commandName)) {
                            await OutputManager.appendToOutput(`Execution HALTED: AI attempted to run a non-whitelisted command: '${commandName}'.`, {typeClass: Config.CSS_CLASSES.ERROR_MSG});
                            return ErrorHandler.createError(`Attempted to run restricted command: ${commandName}`);
                        }

                        if (flags.verbose && options.isInteractive) {
                            await OutputManager.appendToOutput(`> ${commandStr}`, {typeClass: Config.CSS_CLASSES.EDITOR_MSG});
                        }
                        const execResult = await CommandExecutor.processSingleCommand(commandStr, {suppressOutput: !flags.verbose});
                        const output = execResult.success ? execResult.output : `Error: ${execResult.error}`;
                        executedCommandsOutput += `--- Output of '${commandStr}' ---\n${output}\n\n`;
                    }

                    const synthesizerPrompt = `Original user question: "${userPrompt}"\n\nContext from file system:\n${executedCommandsOutput || "No commands were run."}`;
                    const synthesizerResult = await Utils.callLlmApi(provider, model, [{ role: "user", parts: [{ text: synthesizerPrompt }] }], apiKey, SYNTHESIZER_SYSTEM_PROMPT);

                    if (!synthesizerResult.success) {
                        return ErrorHandler.createError(`gemini: Synthesizer stage failed. ${synthesizerResult.error}`);
                    }

                    const finalAnswer = synthesizerResult.answer;
                    if (!finalAnswer) {
                        return ErrorHandler.createError("gemini: AI failed to synthesize a final answer.");
                    }

                    conversationHistory.push({ role: "user", parts: [{ text: userPrompt }] });
                    conversationHistory.push({ role: "model", parts: [{ text: finalAnswer }] });

                    return ErrorHandler.createSuccess(finalAnswer);

                } else {
                    const directConversation = [...conversationHistory, { role: "user", parts: [{ text: userPrompt }] }];
                    const directResult = await Utils.callLlmApi(provider, model, directConversation, apiKey, null);
                    if (!directResult.success) {
                        if (directResult.error === 'LOCAL_PROVIDER_UNAVAILABLE') {
                            if (options.isInteractive) {
                                await OutputManager.appendToOutput(`gemini: Could not connect to '${originalProvider}'. Falling back to default 'gemini' provider.`, {typeClass: Config.CSS_CLASSES.WARNING_MSG});
                            }
                            const fallbackCommand = `gemini ${flags.new ? '-n ' : ''}${flags.verbose ? '-v ' : ''}"${userPrompt}"`;
                            const fallbackResult = await CommandExecutor.processSingleCommand(fallbackCommand, options);
                            if(fallbackResult.success){
                                return ErrorHandler.createSuccess(fallbackResult.output);
                            }
                            return ErrorHandler.createError(fallbackResult.error);
                        }
                        return ErrorHandler.createError(`gemini: Local LLM interaction failed. ${directResult.error}`);
                    }

                    const finalAnswer = directResult.answer;
                    if (!finalAnswer) {
                        return ErrorHandler.createError("gemini: Local LLM failed to generate a response.");
                    }

                    conversationHistory.push({ role: "user", parts: [{ text: userPrompt }] });
                    conversationHistory.push({ role: "model", parts: [{ text: finalAnswer }] });

                    return ErrorHandler.createSuccess(finalAnswer);
                }
            } catch (e) {
                return ErrorHandler.createError(`gemini: An unexpected error occurred: ${e.message}`);
            }
        },
    };
    CommandRegistry.register(geminiCommandDefinition);
})();