(() => {
    "use strict";

    let conversationHistory = [];
    const COMMAND_WHITELIST = ['ls', 'cat', 'grep', 'find', 'tree', 'pwd', 'head', 'shuf', 'xargs', 'echo', 'tail', 'csplit', 'wc'];

    const PLANNER_SYSTEM_PROMPT = `You are a helpful and witty digital archivist embedded in the OopisOS terminal environment. Your goal is to assist the user by answering their questions about their file system, but you are also able to gather answers from outside sources when relevant. Your primary task is to analyze the user's prompt and the provided local file context, then devise a plan of OopisOS commands to execute to gather the necessary information.

RULES:
- Do not add any greetings.
- If no commands are needed (e.g., a general knowledge question), respond with the direct answer. DO NOT generate a plan.
- ONLY use the commands and flags explicitly listed in the "Tool Manifest" below. Do not deviate.
- Each command must be simple and stand-alone. You CANNOT use command substitution or other advanced shell syntax.
- When using a command with an argument that contains spaces (like a filename), you MUST enclose that argument in double quotes. For example: cat "My File.txt".

--- TOOL MANIFEST ---
ls [-l, -a, -R], cat, grep [-i, -v, -n, -R], find [path] -name [pattern] -type [f|d], tree, pwd, head [-n], tail [-n], wc
--- END MANIFEST ---

To process multiple files, you must first list them, and then process each file with a separate command in the plan.`;

    const SYNTHESIZER_SYSTEM_PROMPT = `You are a helpful and witty digital librarian. Your task is to synthesize a final, natural-language answer for the user. You will be given the user's original prompt and the output from a series of commands that you previously planned.

RULES:
- Use the provided command outputs to formulate a comprehensive answer.
- Do not reference the commands themselves in your answer. Simply use the information they provided.
- If the context from the tools is insufficient, state that you could not find the necessary information in the user's files.
- Be friendly, conversational, and helpful in your final response.`;


    const geminiCommandDefinition = {
        commandName: "gemini",
        flagDefinitions: [
            { name: "new", short: "-n", long: "--new" },
            { name: "verbose", short: "-v", long: "--verbose" },
            { name: "provider", short: "-p", long: "--provider", takesValue: true },
            { name: "model", short: "-m", long: "--model", takesValue: true },
            { name: "forceToolUse", short: "-f", long: "--force", description: "Force the Gemini tool-use logic (planner/synthesizer) for any provider." } // NEW FLAG
        ],
        argValidation: {
            min: 1,
            error: 'Insufficient arguments. Usage: gemini [-p provider] [-m model] "<prompt>"',
        },
        coreLogic: async (context) => {
            const {args, options, flags} = context;

            let provider = flags.provider || 'gemini';
            const originalProvider = provider;
            const model = flags.model || null;
            let apiKey = null;
            let isNewKeyProvided = false;

            const userPrompt = args.join(" ");

            const requiresGeminiApiKey = provider === 'gemini';

            if (requiresGeminiApiKey) {
                const apiKeyResult = await new Promise(resolve => {
                    let key = StorageManager.loadItem(Config.STORAGE_KEYS.GEMINI_API_KEY);
                    if (key) resolve({ success: true, key, fromStorage: true });
                    else ModalInputManager.requestInput(
                        "Please enter your Gemini API key:",
                        (providedKey) => {
                            if (!providedKey || providedKey.trim() === "") {
                                resolve({
                                    success: false,
                                    error: "API key entry cancelled or empty."
                                });
                                return;
                            }
                            StorageManager.saveItem(Config.STORAGE_KEYS.GEMINI_API_KEY, providedKey, "Gemini API Key");
                            OutputManager.appendToOutput("API Key saved. Launching Chidi...", {
                                typeClass: Config.CSS_CLASSES.SUCCESS_MSG
                            });
                            resolve({
                                success: true,
                                key: providedKey
                            });
                        },
                        () => {
                            resolve({
                                success: false,
                                error: "API key entry cancelled."
                            });
                        },
                        false,
                        options
                    );
                });

                if (!apiKeyResult.success) return { success: false, error: `gemini: ${apiKeyResult.error}` };
                apiKey = apiKeyResult.key;
                isNewKeyProvided = !apiKeyResult.fromStorage;
            }

            if (flags.new) {
                conversationHistory = [];
                if (options.isInteractive) await OutputManager.appendToOutput("Starting a new conversation.", {typeClass: Config.CSS_CLASSES.CONSOLE_LOG_MSG});
            }

            if (options.isInteractive) await OutputManager.appendToOutput("AI is thinking...", {typeClass: Config.CSS_CLASSES.CONSOLE_LOG_MSG});

            const isGeminiProvider = provider === 'gemini';
            const shouldUseToolUseLogic = isGeminiProvider || flags.forceToolUse;

            if (shouldUseToolUseLogic) {

                const lsResult = await CommandExecutor.processSingleCommand("ls -l", {suppressOutput: true});
                const localContext = `Current directory content:\n${lsResult.output || '(empty)'}`;
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
                        if (key) resolve({ success: true, key: key, fromStorage: true });
                        else resolve({ success: false, error: "Google Gemini API key not found for fallback." });
                    });
                    if (!fallbackApiKeyResult.success) return { success: false, error: `gemini: ${fallbackApiKeyResult.error}` };
                    apiKey = fallbackApiKeyResult.key;
                    isNewKeyProvided = !fallbackApiKeyResult.fromStorage;

                    plannerResult = await Utils.callLlmApi(provider, model, plannerConversation, apiKey, PLANNER_SYSTEM_PROMPT);
                }

                if (!plannerResult.success) {
                    if (plannerResult.error === "INVALID_API_KEY") {
                        StorageManager.removeItem(Config.STORAGE_KEYS.GEMINI_API_KEY);
                        if (options.isInteractive) {
                            await OutputManager.appendToOutput("Gemini API key was invalid and has been removed.", {typeClass: Config.CSS_CLASSES.WARNING_MSG});
                        }
                        return { success: false, error: "gemini: Your API key is invalid. Please run the command again." };
                    }
                    return { success: false, error: `gemini: Planner stage failed. ${plannerResult.error}` };
                }

                if (isNewKeyProvided && requiresGeminiApiKey) {
                    StorageManager.saveItem(Config.STORAGE_KEYS.GEMINI_API_KEY, apiKey);
                    if (options.isInteractive) {
                        await OutputManager.appendToOutput("Gemini API key saved successfully.", {typeClass: Config.CSS_CLASSES.SUCCESS_MSG});
                    }
                }


                const planText = plannerResult.answer?.trim();
                if (!planText) return { success: false, error: "gemini: AI failed to generate a valid plan or response." };

                const firstWordOfPlan = planText.split(/\s+/)[0];
                if (!COMMAND_WHITELIST.includes(firstWordOfPlan)) {
                    conversationHistory.push({ role: "user", parts: [{ text: userPrompt }] });
                    conversationHistory.push({ role: "model", parts: [{ text: planText }] });
                    return { success: true, output: planText };
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
                        return { success: false, error: `Attempted to run restricted command: ${commandName}` };
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
                    return { success: false, error: `gemini: Synthesizer stage failed. ${synthesizerResult.error}` };
                }

                const finalAnswer = synthesizerResult.answer;
                if (!finalAnswer) {
                    return { success: false, error: "gemini: AI failed to synthesize a final answer." };
                }

                conversationHistory.push({ role: "user", parts: [{ text: userPrompt }] });
                conversationHistory.push({ role: "model", parts: [{ text: finalAnswer }] });

                return { success: true, output: finalAnswer };

            } else {
                const directConversation = [...conversationHistory, { role: "user", parts: [{ text: userPrompt }] }];
                const directResult = await Utils.callLlmApi(provider, model, directConversation, apiKey, null);
                if (!directResult.success) {
                    if (directResult.error === 'LOCAL_PROVIDER_UNAVAILABLE') {
                        if (options.isInteractive) {
                            await OutputManager.appendToOutput(`gemini: Could not connect to '${originalProvider}'. Falling back to default 'gemini' provider.`, {typeClass: Config.CSS_CLASSES.WARNING_MSG});
                        }
                        const fallbackCommand = `gemini ${flags.new ? '-n ' : ''}${flags.verbose ? '-v ' : ''}"${userPrompt}"`;
                        return await CommandExecutor.processSingleCommand(fallbackCommand, options);
                    }
                    return { success: false, error: `gemini: Local LLM interaction failed. ${directResult.error}` };
                }

                const finalAnswer = directResult.answer;
                if (!finalAnswer) {
                    return { success: false, error: "gemini: Local LLM failed to generate a response." };
                }

                conversationHistory.push({ role: "user", parts: [{ text: userPrompt }] });
                conversationHistory.push({ role: "model", parts: [{ text: finalAnswer }] });

                return { success: true, output: finalAnswer };
            }
        },
    };

    const geminiDescription = "Engages in a context-aware conversation with a configured AI model.";

    const geminiHelpText = `Usage: gemini [-n|--new] [-v|--verbose] [-p provider] [-m model] [-f|--force] "<prompt>"

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
       gemini "Summarize my README.md and list any scripts in this directory"
              (Uses Google Gemini, leveraging its tool-use capabilities)

       gemini -p ollama "Tell me a story about a sentient terminal."
              (Sends raw prompt to your local Ollama model)

       gemini -p ollama -f "Summarize my README.md using my local LLM's tool-use."
              (Attempts to use the local Ollama model for planning and synthesizing
              commands to answer the question).

       gemini -p ollama -m codellama "Explain the script ./diag.sh"
              (Sends raw prompt to a specific local model via Ollama)
`;

    CommandRegistry.register("gemini", geminiCommandDefinition, geminiDescription, geminiHelpText);
})();