// scripts/commexec.js
const CommandExecutor = (() => {
  "use strict";
  let backgroundProcessIdCounter = 0;
  const activeJobs = {};
  const commands = {};
  const loadedScripts = new Set();

  function _loadScript(scriptPath) {
    if (loadedScripts.has(scriptPath)) {
      return Promise.resolve(true);
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `./scripts/${scriptPath}`;
      script.onload = () => {
        loadedScripts.add(scriptPath);
        resolve(true);
      };
      script.onerror = () => {
        reject(new Error(`Failed to fetch script: ${scriptPath}`));
      };
      document.head.appendChild(script);
    });
  }

  async function _ensureCommandLoaded(commandName) {
    if (!commandName || typeof commandName !== 'string') return false;
    if (commands[commandName]) return true;

    if (!Config.COMMANDS_MANIFEST.includes(commandName)) {
      return false;
    }

    const commandScriptPath = `commands/${commandName}.js`;
    try {
      await _loadScript(commandScriptPath);
      const definition = CommandRegistry.getDefinitions()[commandName];

      if (!definition) {
        throw new Error(`Script loaded but command '${commandName}' not found in registry.`);
      }

      if (definition.dependencies && Array.isArray(definition.dependencies)) {
        for (const dep of definition.dependencies) {
          try {
            await _loadScript(dep);
          } catch (depError) {
            throw new Error(`Failed to load dependency '${dep}' for command '${commandName}'.`);
          }
        }
      }
      commands[commandName] = {
        handler: createCommandHandler(definition)
      };
      return true;
    } catch (error) {
      await OutputManager.appendToOutput(`Error: Command '${commandName}' could not be loaded. ${error.message}`, { typeClass: Config.CSS_CLASSES.ERROR_MSG });
      return false;
    }
  }


  async function* _generateInputContent(context, firstFileArgIndex = 0) {
    const {args, options, currentUser} = context;

    if (options.stdinContent !== null && options.stdinContent !== undefined) {
      yield {success: true, content: options.stdinContent, sourceName: 'stdin'};
      return;
    }

    const fileArgs = args.slice(firstFileArgIndex);
    if (fileArgs.length === 0) {
      return;
    }

    for (const pathArg of fileArgs) {
      const pathValidationResult = FileSystemManager.validatePath(pathArg, {expectedType: 'file'});
      if (!pathValidationResult.success) {
        yield {success: false, error: pathValidationResult.error, sourceName: pathArg};
        continue;
      }
      const { node } = pathValidationResult.data;

      if (!FileSystemManager.hasPermission(node, currentUser, "read")) {
        yield {success: false, error: `Permission denied: ${pathArg}`, sourceName: pathArg};
        continue;
      }

      yield {success: true, content: node.content || "", sourceName: pathArg};
    }
  }


  function createCommandHandler(definition) {
    const handler = async (args, options) => {
      const { flags, remainingArgs } = Utils.parseFlags(
          args,
          definition.flagDefinitions || []
      );
      const currentUser = UserManager.getCurrentUser().name;

      if (definition.argValidation) {
        const validation = Utils.validateArguments(remainingArgs, definition.argValidation);
        if (!validation.isValid) {
          return ErrorHandler.createError(`${definition.commandName}: ${validation.errorDetail}`);
        }
      }

      const context = {
        args: remainingArgs,
        options,
        flags,
        currentUser,
        signal: options.signal,
      };

      if (definition.pathValidation) {
        const pathArgIndex = definition.pathValidation.argIndex || 0;
        if (remainingArgs.length > pathArgIndex) {
          const pathArg = remainingArgs[pathArgIndex];
          const pathValidationResult = FileSystemManager.validatePath(pathArg, definition.pathValidation.options || {});
          if (!pathValidationResult.success) {
            return ErrorHandler.createError(`${definition.commandName}: ${pathValidationResult.error}`);
          }
          context.node = pathValidationResult.data.node;
          context.resolvedPath = pathValidationResult.data.resolvedPath;
        } else if (definition.pathValidation.required !== false) {
          return ErrorHandler.createError(`${definition.commandName}: missing path argument.`);
        }
      }

      if (definition.isInputStream) {
        const inputParts = [];
        let hadError = false;
        let fileCount = 0;
        let firstSourceName = null;

        const firstFileArgIndex = definition.firstFileArgIndex || 0;

        for await (const item of _generateInputContent(context, firstFileArgIndex)) {
          fileCount++;
          if (firstSourceName === null) firstSourceName = item.sourceName;

          if (!item.success) {
            await OutputManager.appendToOutput(item.error, {typeClass: Config.CSS_CLASSES.ERROR_MSG});
            hadError = true;
          } else {
            inputParts.push({content: item.content, sourceName: item.sourceName});
          }
        }

        context.inputItems = inputParts;
        context.inputError = hadError;
        context.inputFileCount = fileCount;
        context.firstSourceName = firstSourceName;
      }


      return definition.coreLogic(context);
    };
    handler.definition = definition;
    return handler;
  }

  function getActiveJobs() {
    return activeJobs;
  }

  async function killJob(jobId) {
    const job = activeJobs[jobId];
    if (job && job.abortController) {
      job.abortController.abort("Killed by user command.");
      if (job.promise) {
        await job.promise.catch(() => {});
      }
      MessageBusManager.unregisterJob(jobId);
      delete activeJobs[jobId];
      return ErrorHandler.createSuccess(`Signal sent to terminate job ${jobId}.`);
    }
    return ErrorHandler.createError(`Job ${jobId} not found or cannot be killed.`);
  }

  async function _executeCommandHandler(segment, execCtxOpts, stdinContent = null, signal) {
    const commandName = segment.command?.toLowerCase();

    const commandExists = await _ensureCommandLoaded(commandName);
    if (!commandExists) {
      return ErrorHandler.createError(`${commandName}: command not found`);
    }

    const cmdData = commands[commandName];

    if (cmdData?.handler) {
      try {
        return await cmdData.handler(segment.args, {
          ...execCtxOpts,
          stdinContent,
          signal,
        });
      } catch (e) {
        console.error(`Error in command handler for '${segment.command}':`, e);
        return ErrorHandler.createError(`${segment.command}: ${e.message || "Unknown error"}`);
      }
    } else if (segment.command) {
      return ErrorHandler.createError(`${segment.command}: command not found`);
    }

    return ErrorHandler.createSuccess("");
  }

  async function _executePipeline(pipeline, options) {
    const { isInteractive, signal, scriptingContext, suppressOutput } = options;
    let currentStdin = null;
    let lastResult = ErrorHandler.createSuccess("");

    if (pipeline.inputRedirectFile) {
      const pathValidationResult = FileSystemManager.validatePath(pipeline.inputRedirectFile, { expectedType: 'file' });
      if (!pathValidationResult.success) {
        return pathValidationResult;
      }
      const { node } = pathValidationResult.data;
      if (!FileSystemManager.hasPermission(node, UserManager.getCurrentUser().name, "read")) {
        return ErrorHandler.createError(`cannot open '${pipeline.inputRedirectFile}' for reading: Permission denied`);
      }
      currentStdin = node.content || "";
    }
    if (
        typeof UserManager === "undefined" ||
        typeof UserManager.getCurrentUser !== "function"
    ) {
      const errorMsg =
          "FATAL: State corruption detected (UserManager is unavailable). Please refresh the page.";
      console.error(errorMsg);
      await OutputManager.appendToOutput(errorMsg, {
        typeClass: Config.CSS_CLASSES.ERROR_MSG,
      });
      return ErrorHandler.createError(errorMsg);
    }
    const user = UserManager.getCurrentUser().name;
    const nowISO = new Date().toISOString();
    for (let i = 0; i < pipeline.segments.length; i++) {
      const segment = pipeline.segments[i];
      const execOptions = { isInteractive, scriptingContext };
      if (pipeline.isBackground) {
        execOptions.jobId = pipeline.jobId;
      }
      lastResult = await _executeCommandHandler(
          segment,
          execOptions,
          currentStdin,
          signal
      );
      if (!lastResult) {
        const err = `Critical: Command handler for '${segment.command}' returned an undefined result.`;
        console.error(err, "Pipeline:", pipeline, "Segment:", segment);
        lastResult = ErrorHandler.createError(err);
      }

      if (scriptingContext?.waitingForInput) {
        return ErrorHandler.createSuccess("");
      }

      if (!lastResult.success) {
        const err = `${Config.MESSAGES.PIPELINE_ERROR_PREFIX}'${
            segment.command
        }': ${lastResult.error || "Unknown"}`;
        if (!pipeline.isBackground) {
          await OutputManager.appendToOutput(err, {
            typeClass: Config.CSS_CLASSES.ERROR_MSG,
          });
        } else {
          console.log(`Background job pipeline error: ${err}`);
        }
        return lastResult;
      }
      currentStdin = lastResult.data;
    }
    if (pipeline.redirection && lastResult.success) {
      const { type: redirType, file: redirFile } = pipeline.redirection;
      const outputToRedir = lastResult.data || "";

      const redirValResult = FileSystemManager.validatePath(
          redirFile,
          {
            allowMissing: true,
            disallowRoot: true,
            defaultToCurrentIfEmpty: false,
          }
      );

      if (
          !redirValResult.success &&
          !(redirValResult.data?.node === null)
      ) {
        if (!pipeline.isBackground)
          await OutputManager.appendToOutput(redirValResult.error, {
            typeClass: Config.CSS_CLASSES.ERROR_MSG,
          });
        return redirValResult;
      }
      const { resolvedPath: absRedirPath, node: targetNode } = redirValResult.data;
      const pDirRes =
          FileSystemManager.createParentDirectoriesIfNeeded(absRedirPath);
      if (!pDirRes.success) {
        if (!pipeline.isBackground)
          await OutputManager.appendToOutput(`Redir err: ${pDirRes.error}`, {
            typeClass: Config.CSS_CLASSES.ERROR_MSG,
          });
        return pDirRes;
      }
      const finalParentDirPath =
          absRedirPath.substring(
              0,
              absRedirPath.lastIndexOf(Config.FILESYSTEM.PATH_SEPARATOR)
          ) || Config.FILESYSTEM.ROOT_PATH;
      const finalParentNodeForFile =
          FileSystemManager.getNodeByPath(finalParentDirPath);
      if (!finalParentNodeForFile) {
        const errorMsg = `Redir err: critical internal error, parent dir '${finalParentDirPath}' for file write not found.`;
        if (!pipeline.isBackground)
          await OutputManager.appendToOutput(
              errorMsg,
              {
                typeClass: Config.CSS_CLASSES.ERROR_MSG,
              }
          );
        return ErrorHandler.createError(`parent dir '${finalParentDirPath}' for file write not found (internal)`);
      }

      const existingNode = FileSystemManager.getNodeByPath(absRedirPath);
      if (
          existingNode &&
          existingNode.type === Config.FILESYSTEM.DEFAULT_DIRECTORY_TYPE
      ) {
        const errorMsg = `Redir err: '${redirFile}' is dir.`;
        if (!pipeline.isBackground)
          await OutputManager.appendToOutput(
              errorMsg,
              {
                typeClass: Config.CSS_CLASSES.ERROR_MSG,
              }
          );
        return ErrorHandler.createError(`'${redirFile}' is dir.`);
      }
      if (
          existingNode &&
          !FileSystemManager.hasPermission(existingNode, user, "write")
      ) {
        const errorMsg = `Redir err: no write to '${redirFile}'${Config.MESSAGES.PERMISSION_DENIED_SUFFIX}`;
        if (!pipeline.isBackground)
          await OutputManager.appendToOutput(
              errorMsg,
              {
                typeClass: Config.CSS_CLASSES.ERROR_MSG,
              }
          );
        return ErrorHandler.createError(`no write to '${redirFile}'`);
      }
      if (
          !existingNode &&
          !FileSystemManager.hasPermission(finalParentNodeForFile, user, "write")
      ) {
        const errorMsg = `Redir err: no create in '${finalParentDirPath}'${Config.MESSAGES.PERMISSION_DENIED_SUFFIX}`;
        if (!pipeline.isBackground)
          await OutputManager.appendToOutput(
              errorMsg,
              {
                typeClass: Config.CSS_CLASSES.ERROR_MSG,
              }
          );
        return ErrorHandler.createError(`no create in '${finalParentDirPath}'`);
      }

      let contentToWrite = outputToRedir;
      if (redirType === "append" && existingNode) {
        const existingContent = existingNode.content || "";
        contentToWrite = existingContent + outputToRedir;
      }

      const saveResult = await FileSystemManager.createOrUpdateFile(
          absRedirPath,
          contentToWrite,
          { currentUser: user, primaryGroup: UserManager.getPrimaryGroupForUser(user) }
      );

      if (!saveResult.success) {
        if (!pipeline.isBackground) {
          await OutputManager.appendToOutput(`Redir err: ${saveResult.error}`, { typeClass: Config.CSS_CLASSES.ERROR_MSG });
        }
        return saveResult;
      }

      FileSystemManager._updateNodeAndParentMtime(absRedirPath, nowISO);
      const fsSaveResult = await FileSystemManager.save();
      if (!fsSaveResult.success) {
        if (!pipeline.isBackground)
          await OutputManager.appendToOutput(
              `Failed to save redir to '${redirFile}': ${fsSaveResult.error}`,
              {
                typeClass: Config.CSS_CLASSES.ERROR_MSG,
              }
          );
        return ErrorHandler.createError(`save redir fail: ${fsSaveResult.error}`);
      }
      lastResult.data = "";
    }

    if (
        !pipeline.redirection &&
        lastResult.success &&
        lastResult.data !== null &&
        lastResult.data !== undefined
    ) {
      if (pipeline.isBackground) {
        if (lastResult.data) {
          await OutputManager.appendToOutput(
              `${Config.MESSAGES.BACKGROUND_PROCESS_OUTPUT_SUPPRESSED} (Job ${pipeline.jobId})`,
              {
                typeClass: Config.CSS_CLASSES.CONSOLE_LOG_MSG,
                isBackground: true,
              }
          );
        }
      } else {
        if (lastResult.data && !suppressOutput) {
          if (typeof lastResult.data === 'string') {
            lastResult.data = lastResult.data.replace(/\\n/g, '\n');
          }
          await OutputManager.appendToOutput(lastResult.data, {
            typeClass: lastResult.messageType || null,
          });
        }
      }
    }
    return lastResult;
  }

  async function _preprocessCommandString(rawCommandText, scriptingContext = null) {
    let commandToProcess = rawCommandText.trim();

    const commentIndex = commandToProcess.search(/(?<= )#/);
    if (commentIndex > -1) {
      commandToProcess = commandToProcess.substring(0, commentIndex).trim();
    }

    if (!commandToProcess) {
      return "";
    }

    if (scriptingContext && scriptingContext.args) {
      const scriptArgs = scriptingContext.args;
      commandToProcess = commandToProcess.replace(/\$@/g, scriptArgs.join(' '));
      commandToProcess = commandToProcess.replace(/\$#/g, scriptArgs.length);
      scriptArgs.forEach((arg, i) => {
        const regex = new RegExp(`\\$${i + 1}`, 'g');
        commandToProcess = commandToProcess.replace(regex, arg);
      });
    }

    commandToProcess = commandToProcess.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)|\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (match, var1, var2) => {
      const varName = var1 || var2;
      return EnvironmentManager.get(varName);
    });

    const aliasResult = AliasManager.resolveAlias(commandToProcess);
    if (aliasResult.error) {
      throw new Error(aliasResult.error);
    }

    return aliasResult.newCommand;
  }

  async function _finalizeInteractiveModeUI(originalCommandText) {
    TerminalUI.clearInput();
    TerminalUI.updatePrompt();
    if (!AppLayerManager.isActive()) {
      TerminalUI.showInputLine();
      TerminalUI.setInputState(true);
      TerminalUI.focusInput();
    }
    TerminalUI.scrollOutputToEnd();

    if (!TerminalUI.getIsNavigatingHistory() && originalCommandText.trim()) {
      HistoryManager.resetIndex();
    }
    TerminalUI.setIsNavigatingHistory(false);
  }

  async function processSingleCommand(rawCommandText, options = {}) {
    const { isInteractive = true, scriptingContext = null, suppressOutput = false } = options;

    if (options.scriptingContext && isInteractive && !ModalManager.isAwaiting()) {
      await OutputManager.appendToOutput("Script execution in progress. Input suspended.", { typeClass: Config.CSS_CLASSES.WARNING_MSG });
      return ErrorHandler.createError("Script execution in progress.");
    }
    if (ModalManager.isAwaiting()) {
      await ModalManager.handleTerminalInput(rawCommandText);
      if (isInteractive) await _finalizeInteractiveModeUI(rawCommandText);
      return ErrorHandler.createSuccess("");
    }

    if (AppLayerManager.isActive()) return ErrorHandler.createSuccess("");

    let commandToParse;
    try {
      commandToParse = await _preprocessCommandString(rawCommandText, scriptingContext);
    } catch (e) {
      await OutputManager.appendToOutput(e.message, { typeClass: Config.CSS_CLASSES.ERROR_MSG });
      if (isInteractive) await _finalizeInteractiveModeUI(rawCommandText);
      return ErrorHandler.createError(e.message);
    }

    const cmdToEcho = rawCommandText.trim();
    if (isInteractive && !scriptingContext) {
      TerminalUI.hideInputLine();
      const prompt = TerminalUI.getPromptText();
      await OutputManager.appendToOutput(`${prompt}${cmdToEcho}`);
    }
    if (cmdToEcho === "") {
      if (isInteractive) await _finalizeInteractiveModeUI(rawCommandText);
      return ErrorHandler.createSuccess("");
    }
    if (isInteractive) HistoryManager.add(cmdToEcho);
    if (isInteractive && !TerminalUI.getIsNavigatingHistory()) HistoryManager.resetIndex();

    let commandSequence;
    try {
      commandSequence = new Parser(new Lexer(commandToParse).tokenize()).parse();
    } catch (e) {
      await OutputManager.appendToOutput(e.message || "Command parse error.", { typeClass: Config.CSS_CLASSES.ERROR_MSG });
      if (isInteractive) await _finalizeInteractiveModeUI(rawCommandText);
      return ErrorHandler.createError(e.message || "Command parse error.");
    }

    let lastPipelineSuccess = true;
    let finalResult = ErrorHandler.createSuccess("");

    for (let i = 0; i < commandSequence.length; i++) {
      const { pipeline, operator } = commandSequence[i];

      if (i > 0) {
        const prevOperator = commandSequence[i - 1].operator;
        if (prevOperator === '&&' && !lastPipelineSuccess) continue;
        if (prevOperator === '||' && lastPipelineSuccess) continue;
      }

      let result;
      if (operator === '&') {
        pipeline.isBackground = true;
        const jobId = ++backgroundProcessIdCounter;
        pipeline.jobId = jobId;
        MessageBusManager.registerJob(jobId);
        const abortController = new AbortController();

        const jobPromise = _executePipeline(pipeline, {
          isInteractive: false,
          signal: abortController.signal,
          scriptingContext,
          suppressOutput: true
        }).finally(() => {
          delete activeJobs[jobId];
          MessageBusManager.unregisterJob(jobId);
        });

        activeJobs[jobId] = { id: jobId, command: cmdToEcho, abortController, promise: jobPromise };
        await OutputManager.appendToOutput(`${Config.MESSAGES.BACKGROUND_PROCESS_STARTED_PREFIX}${jobId}${Config.MESSAGES.BACKGROUND_PROCESS_STARTED_SUFFIX}`, { typeClass: Config.CSS_CLASSES.CONSOLE_LOG_MSG });

        jobPromise.then(bgResult => {
          const statusMsg = `[Job ${pipeline.jobId} ${bgResult.success ? "finished" : "finished with error"}${bgResult.success ? "" : `: ${bgResult.error || "Unknown error"}`}]`;
          OutputManager.appendToOutput(statusMsg, {
            typeClass: bgResult.success ? Config.CSS_CLASSES.CONSOLE_LOG_MSG : Config.CSS_CLASSES.WARNING_MSG,
            isBackground: true
          });
        });

        result = ErrorHandler.createSuccess();
      } else {
        result = await _executePipeline(pipeline, { isInteractive, signal: null, scriptingContext, suppressOutput });
      }

      if (!result) {
        const err = `Critical: Pipeline execution returned an undefined result.`;
        console.error(err, "Pipeline:", pipeline);
        result = ErrorHandler.createError(err);
      }

      lastPipelineSuccess = result.success;
      finalResult = result;

      if (!lastPipelineSuccess && (!operator || operator === ';')) {
        break;
      }
    }

    if (isInteractive && !scriptingContext) {
      await _finalizeInteractiveModeUI(rawCommandText);
    }

    // Convert finalResult to the old format for backward compatibility where needed
    return {
      success: finalResult.success,
      output: finalResult.success ? finalResult.data : null,
      error: !finalResult.success ? finalResult.error : null
    };
  }
// scripts/commexec.js
  const CommandExecutor = (() => {
    "use strict";
    let backgroundProcessIdCounter = 0;
    const activeJobs = {};
    const commands = {};
    const loadedScripts = new Set();

    function _loadScript(scriptPath) {
      if (loadedScripts.has(scriptPath)) {
        return Promise.resolve(true);
      }

      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `./scripts/${scriptPath}`;
        script.onload = () => {
          loadedScripts.add(scriptPath);
          resolve(true);
        };
        script.onerror = () => {
          reject(new Error(`Failed to fetch script: ${scriptPath}`));
        };
        document.head.appendChild(script);
      });
    }

    async function _ensureCommandLoaded(commandName) {
      if (!commandName || typeof commandName !== 'string') return false;
      if (commands[commandName]) return true;

      if (!Config.COMMANDS_MANIFEST.includes(commandName)) {
        return false;
      }

      const commandScriptPath = `commands/${commandName}.js`;
      try {
        await _loadScript(commandScriptPath);
        const definition = CommandRegistry.getDefinitions()[commandName];

        if (!definition) {
          throw new Error(`Script loaded but command '${commandName}' not found in registry.`);
        }

        if (definition.dependencies && Array.isArray(definition.dependencies)) {
          for (const dep of definition.dependencies) {
            try {
              await _loadScript(dep);
            } catch (depError) {
              throw new Error(`Failed to load dependency '${dep}' for command '${commandName}'.`);
            }
          }
        }
        commands[commandName] = {
          handler: createCommandHandler(definition)
        };
        return true;
      } catch (error) {
        await OutputManager.appendToOutput(`Error: Command '${commandName}' could not be loaded. ${error.message}`, { typeClass: Config.CSS_CLASSES.ERROR_MSG });
        return false;
      }
    }


    async function* _generateInputContent(context, firstFileArgIndex = 0) {
      const {args, options, currentUser} = context;

      if (options.stdinContent !== null && options.stdinContent !== undefined) {
        yield {success: true, content: options.stdinContent, sourceName: 'stdin'};
        return;
      }

      const fileArgs = args.slice(firstFileArgIndex);
      if (fileArgs.length === 0) {
        return;
      }

      for (const pathArg of fileArgs) {
        const pathValidationResult = FileSystemManager.validatePath(pathArg, {expectedType: 'file'});
        if (!pathValidationResult.success) {
          yield {success: false, error: pathValidationResult.error, sourceName: pathArg};
          continue;
        }
        const { node } = pathValidationResult.data;

        if (!FileSystemManager.hasPermission(node, currentUser, "read")) {
          yield {success: false, error: `Permission denied: ${pathArg}`, sourceName: pathArg};
          continue;
        }

        yield {success: true, content: node.content || "", sourceName: pathArg};
      }
    }


    function createCommandHandler(definition) {
      const handler = async (args, options) => {
        const { flags, remainingArgs } = Utils.parseFlags(
            args,
            definition.flagDefinitions || []
        );
        const currentUser = UserManager.getCurrentUser().name;

        if (definition.argValidation) {
          const validation = Utils.validateArguments(remainingArgs, definition.argValidation);
          if (!validation.isValid) {
            return ErrorHandler.createError(`${definition.commandName}: ${validation.errorDetail}`);
          }
        }

        const context = {
          args: remainingArgs,
          options,
          flags,
          currentUser,
          signal: options.signal,
        };

        if (definition.pathValidation) {
          const pathArgIndex = definition.pathValidation.argIndex || 0;
          if (remainingArgs.length > pathArgIndex) {
            const pathArg = remainingArgs[pathArgIndex];
            const pathValidationResult = FileSystemManager.validatePath(pathArg, definition.pathValidation.options || {});
            if (!pathValidationResult.success) {
              return ErrorHandler.createError(`${definition.commandName}: ${pathValidationResult.error}`);
            }
            context.node = pathValidationResult.data.node;
            context.resolvedPath = pathValidationResult.data.resolvedPath;
          } else if (definition.pathValidation.required !== false) {
            return ErrorHandler.createError(`${definition.commandName}: missing path argument.`);
          }
        }

        if (definition.isInputStream) {
          const inputParts = [];
          let hadError = false;
          let fileCount = 0;
          let firstSourceName = null;

          const firstFileArgIndex = definition.firstFileArgIndex || 0;

          for await (const item of _generateInputContent(context, firstFileArgIndex)) {
            fileCount++;
            if (firstSourceName === null) firstSourceName = item.sourceName;

            if (!item.success) {
              await OutputManager.appendToOutput(item.error, {typeClass: Config.CSS_CLASSES.ERROR_MSG});
              hadError = true;
            } else {
              inputParts.push({content: item.content, sourceName: item.sourceName});
            }
          }

          context.inputItems = inputParts;
          context.inputError = hadError;
          context.inputFileCount = fileCount;
          context.firstSourceName = firstSourceName;
        }


        return definition.coreLogic(context);
      };
      handler.definition = definition;
      return handler;
    }

    function getActiveJobs() {
      return activeJobs;
    }

    async function killJob(jobId) {
      const job = activeJobs[jobId];
      if (job && job.abortController) {
        job.abortController.abort("Killed by user command.");
        if (job.promise) {
          await job.promise.catch(() => {});
        }
        MessageBusManager.unregisterJob(jobId);
        delete activeJobs[jobId];
        return ErrorHandler.createSuccess(`Signal sent to terminate job ${jobId}.`);
      }
      return ErrorHandler.createError(`Job ${jobId} not found or cannot be killed.`);
    }

    async function _executeCommandHandler(segment, execCtxOpts, stdinContent = null, signal) {
      const commandName = segment.command?.toLowerCase();

      const commandExists = await _ensureCommandLoaded(commandName);
      if (!commandExists) {
        return ErrorHandler.createError(`${commandName}: command not found`);
      }

      const cmdData = commands[commandName];

      if (cmdData?.handler) {
        try {
          return await cmdData.handler(segment.args, {
            ...execCtxOpts,
            stdinContent,
            signal,
          });
        } catch (e) {
          console.error(`Error in command handler for '${segment.command}':`, e);
          return ErrorHandler.createError(`${segment.command}: ${e.message || "Unknown error"}`);
        }
      } else if (segment.command) {
        return ErrorHandler.createError(`${segment.command}: command not found`);
      }

      return ErrorHandler.createSuccess("");
    }

    async function _executePipeline(pipeline, options) {
      const { isInteractive, signal, scriptingContext, suppressOutput } = options;
      let currentStdin = null;
      let lastResult = ErrorHandler.createSuccess("");

      if (pipeline.inputRedirectFile) {
        const pathValidationResult = FileSystemManager.validatePath(pipeline.inputRedirectFile, { expectedType: 'file' });
        if (!pathValidationResult.success) {
          return pathValidationResult;
        }
        const { node } = pathValidationResult.data;
        if (!FileSystemManager.hasPermission(node, UserManager.getCurrentUser().name, "read")) {
          return ErrorHandler.createError(`cannot open '${pipeline.inputRedirectFile}' for reading: Permission denied`);
        }
        currentStdin = node.content || "";
      }
      if (
          typeof UserManager === "undefined" ||
          typeof UserManager.getCurrentUser !== "function"
      ) {
        const errorMsg =
            "FATAL: State corruption detected (UserManager is unavailable). Please refresh the page.";
        console.error(errorMsg);
        await OutputManager.appendToOutput(errorMsg, {
          typeClass: Config.CSS_CLASSES.ERROR_MSG,
        });
        return ErrorHandler.createError(errorMsg);
      }
      const user = UserManager.getCurrentUser().name;
      const nowISO = new Date().toISOString();
      for (let i = 0; i < pipeline.segments.length; i++) {
        const segment = pipeline.segments[i];
        const execOptions = { isInteractive, scriptingContext };
        if (pipeline.isBackground) {
          execOptions.jobId = pipeline.jobId;
        }
        lastResult = await _executeCommandHandler(
            segment,
            execOptions,
            currentStdin,
            signal
        );
        if (!lastResult) {
          const err = `Critical: Command handler for '${segment.command}' returned an undefined result.`;
          console.error(err, "Pipeline:", pipeline, "Segment:", segment);
          lastResult = ErrorHandler.createError(err);
        }

        if (scriptingContext?.waitingForInput) {
          return ErrorHandler.createSuccess("");
        }

        if (!lastResult.success) {
          const err = `${Config.MESSAGES.PIPELINE_ERROR_PREFIX}'${
              segment.command
          }': ${lastResult.error || "Unknown"}`;
          if (!pipeline.isBackground) {
            await OutputManager.appendToOutput(err, {
              typeClass: Config.CSS_CLASSES.ERROR_MSG,
            });
          } else {
            console.log(`Background job pipeline error: ${err}`);
          }
          return lastResult;
        }
        currentStdin = lastResult.data;
      }
      if (pipeline.redirection && lastResult.success) {
        const { type: redirType, file: redirFile } = pipeline.redirection;
        const outputToRedir = lastResult.data || "";

        const redirValResult = FileSystemManager.validatePath(
            redirFile,
            {
              allowMissing: true,
              disallowRoot: true,
              defaultToCurrentIfEmpty: false,
            }
        );

        if (
            !redirValResult.success &&
            !(redirValResult.data?.node === null)
        ) {
          if (!pipeline.isBackground)
            await OutputManager.appendToOutput(redirValResult.error, {
              typeClass: Config.CSS_CLASSES.ERROR_MSG,
            });
          return redirValResult;
        }
        const { resolvedPath: absRedirPath, node: targetNode } = redirValResult.data;
        const pDirRes =
            FileSystemManager.createParentDirectoriesIfNeeded(absRedirPath);
        if (!pDirRes.success) {
          if (!pipeline.isBackground)
            await OutputManager.appendToOutput(`Redir err: ${pDirRes.error}`, {
              typeClass: Config.CSS_CLASSES.ERROR_MSG,
            });
          return pDirRes;
        }
        const finalParentDirPath =
            absRedirPath.substring(
                0,
                absRedirPath.lastIndexOf(Config.FILESYSTEM.PATH_SEPARATOR)
            ) || Config.FILESYSTEM.ROOT_PATH;
        const finalParentNodeForFile =
            FileSystemManager.getNodeByPath(finalParentDirPath);
        if (!finalParentNodeForFile) {
          const errorMsg = `Redir err: critical internal error, parent dir '${finalParentDirPath}' for file write not found.`;
          if (!pipeline.isBackground)
            await OutputManager.appendToOutput(
                errorMsg,
                {
                  typeClass: Config.CSS_CLASSES.ERROR_MSG,
                }
            );
          return ErrorHandler.createError(`parent dir '${finalParentDirPath}' for file write not found (internal)`);
        }

        const existingNode = FileSystemManager.getNodeByPath(absRedirPath);
        if (
            existingNode &&
            existingNode.type === Config.FILESYSTEM.DEFAULT_DIRECTORY_TYPE
        ) {
          const errorMsg = `Redir err: '${redirFile}' is dir.`;
          if (!pipeline.isBackground)
            await OutputManager.appendToOutput(
                errorMsg,
                {
                  typeClass: Config.CSS_CLASSES.ERROR_MSG,
                }
            );
          return ErrorHandler.createError(`'${redirFile}' is dir.`);
        }
        if (
            existingNode &&
            !FileSystemManager.hasPermission(existingNode, user, "write")
        ) {
          const errorMsg = `Redir err: no write to '${redirFile}'${Config.MESSAGES.PERMISSION_DENIED_SUFFIX}`;
          if (!pipeline.isBackground)
            await OutputManager.appendToOutput(
                errorMsg,
                {
                  typeClass: Config.CSS_CLASSES.ERROR_MSG,
                }
            );
          return ErrorHandler.createError(`no write to '${redirFile}'`);
        }
        if (
            !existingNode &&
            !FileSystemManager.hasPermission(finalParentNodeForFile, user, "write")
        ) {
          const errorMsg = `Redir err: no create in '${finalParentDirPath}'${Config.MESSAGES.PERMISSION_DENIED_SUFFIX}`;
          if (!pipeline.isBackground)
            await OutputManager.appendToOutput(
                errorMsg,
                {
                  typeClass: Config.CSS_CLASSES.ERROR_MSG,
                }
            );
          return ErrorHandler.createError(`no create in '${finalParentDirPath}'`);
        }

        let contentToWrite = outputToRedir;
        if (redirType === "append" && existingNode) {
          const existingContent = existingNode.content || "";
          contentToWrite = existingContent + outputToRedir;
        }

        const saveResult = await FileSystemManager.createOrUpdateFile(
            absRedirPath,
            contentToWrite,
            { currentUser: user, primaryGroup: UserManager.getPrimaryGroupForUser(user) }
        );

        if (!saveResult.success) {
          if (!pipeline.isBackground) {
            await OutputManager.appendToOutput(`Redir err: ${saveResult.error}`, { typeClass: Config.CSS_CLASSES.ERROR_MSG });
          }
          return saveResult;
        }

        FileSystemManager._updateNodeAndParentMtime(absRedirPath, nowISO);
        const fsSaveResult = await FileSystemManager.save();
        if (!fsSaveResult.success) {
          if (!pipeline.isBackground)
            await OutputManager.appendToOutput(
                `Failed to save redir to '${redirFile}': ${fsSaveResult.error}`,
                {
                  typeClass: Config.CSS_CLASSES.ERROR_MSG,
                }
            );
          return ErrorHandler.createError(`save redir fail: ${fsSaveResult.error}`);
        }
        lastResult.data = "";
      }

      if (
          !pipeline.redirection &&
          lastResult.success &&
          lastResult.data !== null &&
          lastResult.data !== undefined
      ) {
        if (pipeline.isBackground) {
          if (lastResult.data) {
            await OutputManager.appendToOutput(
                `${Config.MESSAGES.BACKGROUND_PROCESS_OUTPUT_SUPPRESSED} (Job ${pipeline.jobId})`,
                {
                  typeClass: Config.CSS_CLASSES.CONSOLE_LOG_MSG,
                  isBackground: true,
                }
            );
          }
        } else {
          if (lastResult.data && !suppressOutput) {
            if (typeof lastResult.data === 'string') {
              lastResult.data = lastResult.data.replace(/\\n/g, '\n');
            }
            await OutputManager.appendToOutput(lastResult.data, {
              typeClass: lastResult.messageType || null,
            });
          }
        }
      }
      return lastResult;
    }

    async function _preprocessCommandString(rawCommandText, scriptingContext = null) {
      let commandToProcess = rawCommandText.trim();

      const commentIndex = commandToProcess.search(/(?<= )#/);
      if (commentIndex > -1) {
        commandToProcess = commandToProcess.substring(0, commentIndex).trim();
      }

      if (!commandToProcess) {
        return "";
      }

      if (scriptingContext && scriptingContext.args) {
        const scriptArgs = scriptingContext.args;
        commandToProcess = commandToProcess.replace(/\$@/g, scriptArgs.join(' '));
        commandToProcess = commandToProcess.replace(/\$#/g, scriptArgs.length);
        scriptArgs.forEach((arg, i) => {
          const regex = new RegExp(`\\$${i + 1}`, 'g');
          commandToProcess = commandToProcess.replace(regex, arg);
        });
      }

      commandToProcess = commandToProcess.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)|\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (match, var1, var2) => {
        const varName = var1 || var2;
        return EnvironmentManager.get(varName);
      });

      const aliasResult = AliasManager.resolveAlias(commandToProcess);
      if (aliasResult.error) {
        throw new Error(aliasResult.error);
      }

      return aliasResult.newCommand;
    }

    async function _finalizeInteractiveModeUI(originalCommandText) {
      TerminalUI.clearInput();
      TerminalUI.updatePrompt();
      if (!AppLayerManager.isActive()) {
        TerminalUI.showInputLine();
        TerminalUI.setInputState(true);
        TerminalUI.focusInput();
      }
      TerminalUI.scrollOutputToEnd();

      if (!TerminalUI.getIsNavigatingHistory() && originalCommandText.trim()) {
        HistoryManager.resetIndex();
      }
      TerminalUI.setIsNavigatingHistory(false);
    }

    async function processSingleCommand(rawCommandText, options = {}) {
      const { isInteractive = true, scriptingContext = null, suppressOutput = false } = options;

      if (options.scriptingContext && isInteractive && !ModalManager.isAwaiting()) {
        await OutputManager.appendToOutput("Script execution in progress. Input suspended.", { typeClass: Config.CSS_CLASSES.WARNING_MSG });
        return ErrorHandler.createError("Script execution in progress.");
      }
      if (ModalManager.isAwaiting()) {
        await ModalManager.handleTerminalInput(rawCommandText);
        if (isInteractive) await _finalizeInteractiveModeUI(rawCommandText);
        return ErrorHandler.createSuccess("");
      }

      if (AppLayerManager.isActive()) return ErrorHandler.createSuccess("");

      let commandToParse;
      try {
        commandToParse = await _preprocessCommandString(rawCommandText, scriptingContext);
      } catch (e) {
        await OutputManager.appendToOutput(e.message, { typeClass: Config.CSS_CLASSES.ERROR_MSG });
        if (isInteractive) await _finalizeInteractiveModeUI(rawCommandText);
        return ErrorHandler.createError(e.message);
      }

      const cmdToEcho = rawCommandText.trim();
      if (isInteractive && !scriptingContext) {
        TerminalUI.hideInputLine();
        const prompt = TerminalUI.getPromptText();
        await OutputManager.appendToOutput(`${prompt}${cmdToEcho}`);
      }
      if (cmdToEcho === "") {
        if (isInteractive) await _finalizeInteractiveModeUI(rawCommandText);
        return ErrorHandler.createSuccess("");
      }
      if (isInteractive) HistoryManager.add(cmdToEcho);
      if (isInteractive && !TerminalUI.getIsNavigatingHistory()) HistoryManager.resetIndex();

      let commandSequence;
      try {
        commandSequence = new Parser(new Lexer(commandToParse).tokenize()).parse();
      } catch (e) {
        await OutputManager.appendToOutput(e.message || "Command parse error.", { typeClass: Config.CSS_CLASSES.ERROR_MSG });
        if (isInteractive) await _finalizeInteractiveModeUI(rawCommandText);
        return ErrorHandler.createError(e.message || "Command parse error.");
      }

      let lastPipelineSuccess = true;
      let finalResult = ErrorHandler.createSuccess("");

      for (let i = 0; i < commandSequence.length; i++) {
        const { pipeline, operator } = commandSequence[i];

        if (i > 0) {
          const prevOperator = commandSequence[i - 1].operator;
          if (prevOperator === '&&' && !lastPipelineSuccess) continue;
          if (prevOperator === '||' && lastPipelineSuccess) continue;
        }

        let result;
        if (operator === '&') {
          pipeline.isBackground = true;
          const jobId = ++backgroundProcessIdCounter;
          pipeline.jobId = jobId;
          MessageBusManager.registerJob(jobId);
          const abortController = new AbortController();

          const jobPromise = _executePipeline(pipeline, {
            isInteractive: false,
            signal: abortController.signal,
            scriptingContext,
            suppressOutput: true
          }).finally(() => {
            delete activeJobs[jobId];
            MessageBusManager.unregisterJob(jobId);
          });

          activeJobs[jobId] = { id: jobId, command: cmdToEcho, abortController, promise: jobPromise };
          await OutputManager.appendToOutput(`${Config.MESSAGES.BACKGROUND_PROCESS_STARTED_PREFIX}${jobId}${Config.MESSAGES.BACKGROUND_PROCESS_STARTED_SUFFIX}`, { typeClass: Config.CSS_CLASSES.CONSOLE_LOG_MSG });

          jobPromise.then(bgResult => {
            const statusMsg = `[Job ${pipeline.jobId} ${bgResult.success ? "finished" : "finished with error"}${bgResult.success ? "" : `: ${bgResult.error || "Unknown error"}`}]`;
            OutputManager.appendToOutput(statusMsg, {
              typeClass: bgResult.success ? Config.CSS_CLASSES.CONSOLE_LOG_MSG : Config.CSS_CLASSES.WARNING_MSG,
              isBackground: true
            });
          });

          result = ErrorHandler.createSuccess();
        } else {
          result = await _executePipeline(pipeline, { isInteractive, signal: null, scriptingContext, suppressOutput });
        }

        if (!result) {
          const err = `Critical: Pipeline execution returned an undefined result.`;
          console.error(err, "Pipeline:", pipeline);
          result = ErrorHandler.createError(err);
        }

        lastPipelineSuccess = result.success;
        finalResult = result;

        if (!lastPipelineSuccess && (!operator || operator === ';')) {
          break;
        }
      }

      if (isInteractive && !scriptingContext) {
        await _finalizeInteractiveModeUI(rawCommandText);
      }

      // Convert finalResult to the old format for backward compatibility where needed
      return {
        success: finalResult.success,
        output: finalResult.success ? finalResult.data : null,
        error: !finalResult.success ? finalResult.error : null
      };
    }

    function getCommands() {
      return commands;
    }

    return {
      processSingleCommand,
      getCommands,
      getActiveJobs,
      killJob,
      _ensureCommandLoaded
    };
  })();
  function getCommands() {
    return commands;
  }

  return {
    processSingleCommand,
    getCommands,
    getActiveJobs,
    killJob,
    _ensureCommandLoaded
  };
})();