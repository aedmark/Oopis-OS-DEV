// /scripts/commexec.js

const CommandExecutor = (() => {
  "use strict";
  let backgroundProcessIdCounter = 0;
  let activeJobs = {};
  const commands = {};
  const loadingPromises = {};

  async function precacheCommonCommands() {
    await _ensureCommandLoaded('ls');
    await _ensureCommandLoaded('cd');
    await _ensureCommandLoaded('cat');
    await _ensureCommandLoaded('rm');
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
      const pathValidation = FileSystemManager.validatePath(pathArg, {expectedType: 'file'});
      if (pathValidation.error) {
        yield {success: false, error: pathValidation.error, sourceName: pathArg};
        continue;
      }

      if (!FileSystemManager.hasPermission(pathValidation.node, currentUser, "read")) {
        yield {success: false, error: `Permission denied: ${pathArg}`, sourceName: pathArg};
        continue;
      }

      yield {success: true, content: pathValidation.node.content || "", sourceName: pathArg};
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
          return { success: false, error: `${definition.commandName}: ${validation.errorDetail}` };
        }
      }

      const context = {
        args: remainingArgs,
        options,
        flags,
        currentUser,
        signal: options.signal,
      };

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

  async function _ensureCommandLoaded(commandName) {
    if (!commandName) return false;
    if (commands[commandName]) return true;
    if (loadingPromises[commandName]) return await loadingPromises[commandName];

    const promise = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = `./scripts/commands/${commandName}.js`;
      script.onload = () => {
        const definition = CommandRegistry.getDefinitions()[commandName];
        if (definition) {
          commands[commandName] = {
            handler: createCommandHandler(definition.definition),
            description: definition.description,
            helpText: definition.helpText,
          };
          resolve(true);
        } else {
          console.error(`Script for '${commandName}' loaded, but command not found in registry.`);
          resolve(false);
        }
        delete loadingPromises[commandName];
      };
      script.onerror = () => {
        resolve(false);
        delete loadingPromises[commandName];
      };
      document.head.appendChild(script);
    });

    loadingPromises[commandName] = promise;
    return await loadingPromises[commandName];
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
      return {
        success: true,
        message: `Signal sent to terminate job ${jobId}.`,
      };
    }
    return {
      success: false,
      error: `Job ${jobId} not found or cannot be killed.`,
    };
  }

  async function _executeCommandHandler(segment, execCtxOpts, stdinContent = null, signal) {
    const commandName = segment.command?.toLowerCase();

    const commandExists = await _ensureCommandLoaded(commandName);
    if (!commandExists) {
      return { success: false, error: `${commandName}: command not found` };
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
        return {
          success: false,
          error: `${segment.command}: ${e.message || "Unknown error"}`,
        };
      }
    } else if (segment.command) {
      return { success: false, error: `${segment.command}: command not found` };
    }

    return {
      success: true,
      output: "",
    };
  }

  async function _executePipeline(pipeline, options) {
    const { isInteractive, signal, scriptingContext, suppressOutput } = options;
    let currentStdin = null;
    let lastResult = {
      success: true,
      output: "",
    };
    if (pipeline.inputRedirectFile) {
      const pathValidation = FileSystemManager.validatePath(pipeline.inputRedirectFile, {expectedType: 'file'});
      if (pathValidation.error) {
        return { success: false, error: pathValidation.error };
      }
      if (!FileSystemManager.hasPermission(pathValidation.node, UserManager.getCurrentUser().name, "read")) {
        return { success: false, error: `cannot open '${pipeline.inputRedirectFile}' for reading: Permission denied` };
      }
      currentStdin = pathValidation.node.content || "";
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
      return {
        success: false,
        error: errorMsg,
      };
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
        lastResult = {
          success: false,
          error: err,
        };
      }

      if (scriptingContext?.waitingForInput) {
        return { success: true, output: "" };
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
      currentStdin = lastResult.output;
    }
    if (pipeline.redirection && lastResult.success) {
      const { type: redirType, file: redirFile } = pipeline.redirection;
      const outputToRedir = lastResult.output || "";

      // THIS IS THE CORRECTED CALL
      const redirVal = FileSystemManager.validatePath(
          redirFile,
          {
            allowMissing: true,
            disallowRoot: true,
            defaultToCurrentIfEmpty: false,
          }
      );

      if (
          redirVal.error &&
          !(redirVal.optionsUsed.allowMissing && !redirVal.node)
      ) {
        if (!pipeline.isBackground)
          await OutputManager.appendToOutput(redirVal.error, {
            typeClass: Config.CSS_CLASSES.ERROR_MSG,
          });
        return {
          success: false,
          error: redirVal.error,
        };
      }
      const absRedirPath = redirVal.resolvedPath;
      let targetNode = redirVal.node;
      const pDirRes =
          FileSystemManager.createParentDirectoriesIfNeeded(absRedirPath);
      if (pDirRes.error) {
        if (!pipeline.isBackground)
          await OutputManager.appendToOutput(`Redir err: ${pDirRes.error}`, {
            typeClass: Config.CSS_CLASSES.ERROR_MSG,
          });
        return {
          success: false,
          error: pDirRes.error,
        };
      }
      const finalParentDirPath =
          absRedirPath.substring(
              0,
              absRedirPath.lastIndexOf(Config.FILESYSTEM.PATH_SEPARATOR)
          ) || Config.FILESYSTEM.ROOT_PATH;
      const finalParentNodeForFile =
          FileSystemManager.getNodeByPath(finalParentDirPath);
      if (!finalParentNodeForFile) {
        if (!pipeline.isBackground)
          await OutputManager.appendToOutput(
              `Redir err: critical internal error, parent dir '${finalParentDirPath}' for file write not found.`,
              {
                typeClass: Config.CSS_CLASSES.ERROR_MSG,
              }
          );
        return {
          success: false,
          error: `parent dir '${finalParentDirPath}' for file write not found (internal)`,
        };
      }
      targetNode = FileSystemManager.getNodeByPath(absRedirPath);
      if (
          targetNode &&
          targetNode.type === Config.FILESYSTEM.DEFAULT_DIRECTORY_TYPE
      ) {
        if (!pipeline.isBackground)
          await OutputManager.appendToOutput(
              `Redir err: '${redirFile}' is dir.`,
              {
                typeClass: Config.CSS_CLASSES.ERROR_MSG,
              }
          );
        return {
          success: false,
          error: `'${redirFile}' is dir.`,
        };
      }
      if (
          targetNode &&
          !FileSystemManager.hasPermission(targetNode, user, "write")
      ) {
        if (!pipeline.isBackground)
          await OutputManager.appendToOutput(
              `Redir err: no write to '${redirFile}'${Config.MESSAGES.PERMISSION_DENIED_SUFFIX}`,
              {
                typeClass: Config.CSS_CLASSES.ERROR_MSG,
              }
          );
        return {
          success: false,
          error: `no write to '${redirFile}'`,
        };
      }
      if (
          !targetNode &&
          !FileSystemManager.hasPermission(finalParentNodeForFile, user, "write")
      ) {
        if (!pipeline.isBackground)
          await OutputManager.appendToOutput(
              `Redir err: no create in '${finalParentDirPath}'${Config.MESSAGES.PERMISSION_DENIED_SUFFIX}`,
              {
                typeClass: Config.CSS_CLASSES.ERROR_MSG,
              }
          );
        return {
          success: false,
          error: `no create in '${finalParentDirPath}'`,
        };
      }
      const fName = absRedirPath.substring(
          absRedirPath.lastIndexOf(Config.FILESYSTEM.PATH_SEPARATOR) + 1
      );
      let exContent = "";
      if (
          redirType === "append" &&
          finalParentNodeForFile.children[fName]?.type ===
          Config.FILESYSTEM.DEFAULT_FILE_TYPE
      ) {
        exContent = finalParentNodeForFile.children[fName].content || "";
        if (exContent && !exContent.endsWith("\n") && outputToRedir)
          exContent += "\n";
      }
      if (targetNode) {
        targetNode.content = exContent + outputToRedir;
      } else {
        const primaryGroup = UserManager.getPrimaryGroupForUser(user);
        if (!primaryGroup) {
          if (!pipeline.isBackground)
            await OutputManager.appendToOutput(
                `Redirection error: could not determine primary group for user '${user}'.`,
                {typeClass: Config.CSS_CLASSES.ERROR_MSG}
            );
          return {
            success: false,
            error: "internal redirection error: no primary group",
          };
        }
        finalParentNodeForFile.children[fName] =
            FileSystemManager._createNewFileNode(
                fName,
                exContent + outputToRedir,
                user,
                primaryGroup
            );
      }
      FileSystemManager._updateNodeAndParentMtime(absRedirPath, nowISO);
      if (!(await FileSystemManager.save())) {
        if (!pipeline.isBackground)
          await OutputManager.appendToOutput(
              `Failed to save redir to '${redirFile}'.`,
              {
                typeClass: Config.CSS_CLASSES.ERROR_MSG,
              }
          );
        return {
          success: false,
          error: `save redir fail`,
        };
      }
      lastResult.output = "";
    }

    if (
        !pipeline.redirection &&
        lastResult.success &&
        lastResult.output !== null &&
        lastResult.output !== undefined
    ) {
      if (pipeline.isBackground) {
        if (lastResult.output) {
          await OutputManager.appendToOutput(
              `${Config.MESSAGES.BACKGROUND_PROCESS_OUTPUT_SUPPRESSED} (Job ${pipeline.jobId})`,
              {
                typeClass: Config.CSS_CLASSES.CONSOLE_LOG_MSG,
                isBackground: true,
              }
          );
        }
      } else {
        if (lastResult.output && !suppressOutput) {
          await OutputManager.appendToOutput(lastResult.output, {
            typeClass: lastResult.messageType || null,
          });
        }
      }
    }
    return lastResult;
  }

  // This function is now enhanced to handle script arguments.
  async function _preprocessCommandString(rawCommandText, scriptingContext = null) {
    let commandToProcess = rawCommandText.trim();

    // --- NEW: Strip inline comments ---
    // Find the first '#' that is preceded by a space.
    const commentIndex = commandToProcess.search(/(?<= )#/);
    if (commentIndex > -1) {
      // If a comment is found, truncate the string to just before it.
      commandToProcess = commandToProcess.substring(0, commentIndex).trim();
    }
    // --- End of new logic ---

    if (!commandToProcess) {
      return "";
    }

    // --- The rest of the function remains the same ---
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
    const commandAfterAliases = aliasResult.newCommand;

    const args = commandAfterAliases.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    const expandedArgs = [];
    if (args.length > 0) {
      expandedArgs.push(args[0]);
    }
    let hasExpansionOccurred = false;

    for (let i = 1; i < args.length; i++) {
      const originalArg = args[i];
      const isQuoted = (originalArg.startsWith('"') && originalArg.endsWith('"')) || (originalArg.startsWith("'") && originalArg.endsWith("'"));
      const globPattern = isQuoted ? originalArg.slice(1, -1) : originalArg;
      const hasGlobChar = globPattern.includes('*') || globPattern.includes('?');

      if (hasGlobChar && !isQuoted) {
        const lastSlashIndex = globPattern.lastIndexOf('/');
        let pathPrefix = '.';
        let patternPart = globPattern;

        if (lastSlashIndex > -1) {
          pathPrefix = globPattern.substring(0, lastSlashIndex + 1);
          patternPart = globPattern.substring(lastSlashIndex + 1);
        }

        const searchDir = (pathPrefix === '/') ? '/' : FileSystemManager.getAbsolutePath(pathPrefix, FileSystemManager.getCurrentPath());
        const dirNode = FileSystemManager.getNodeByPath(searchDir);

        if (dirNode && dirNode.type === 'directory') {
          const regex = Utils.globToRegex(patternPart);
          if (regex) {
            const matches = Object.keys(dirNode.children)
                .filter(name => regex.test(name))
                .map(name => name.includes(' ') ? `"${name}"` : name);

            if (matches.length > 0) {
              expandedArgs.push(...matches);
              hasExpansionOccurred = true;
            } else {
              expandedArgs.push(originalArg);
            }
          } else {
            expandedArgs.push(originalArg);
          }
        } else {
          expandedArgs.push(originalArg);
        }
      } else {
        expandedArgs.push(originalArg);
      }
    }
    const finalCommandToParse = hasExpansionOccurred ? expandedArgs.join(' ') : commandAfterAliases;
    return finalCommandToParse;
  }


  async function _finalizeInteractiveModeUI(originalCommandText) {
    TerminalUI.clearInput();
    TerminalUI.updatePrompt();
    if (!EditorManager.isActive()) {
      if (DOM.inputLineContainerDiv) {
        DOM.inputLineContainerDiv.classList.remove(Config.CSS_CLASSES.HIDDEN);
      }
      TerminalUI.setInputState(true);
      TerminalUI.focusInput();
    }
    if (DOM.outputDiv) {
      DOM.outputDiv.scrollTop = DOM.outputDiv.scrollHeight;
    }
    if (!TerminalUI.getIsNavigatingHistory() && originalCommandText.trim()) {
      HistoryManager.resetIndex();
    }
    TerminalUI.setIsNavigatingHistory(false);
  }

  async function processSingleCommand(rawCommandText, options = {}) {
    const { isInteractive = true, scriptingContext = null, suppressOutput = false } = options;

    if (options.scriptingContext && isInteractive && !ModalManager.isAwaiting()) {
      await OutputManager.appendToOutput("Script execution in progress. Input suspended.", { typeClass: Config.CSS_CLASSES.WARNING_MSG });
      return { success: false, error: "Script execution in progress." };
    }
    if (ModalManager.isAwaiting()) {
      await ModalManager.handleTerminalInput(rawCommandText);
      if (isInteractive) await _finalizeInteractiveModeUI(rawCommandText);
      return { success: true, output: "" };
    }
    if (EditorManager.isActive()) return { success: true, output: "" };

    let commandToParse;
    try {
      // Pass scripting context to preprocessing for argument expansion
      commandToParse = await _preprocessCommandString(rawCommandText, scriptingContext);
    } catch (e) {
      await OutputManager.appendToOutput(e.message, { typeClass: Config.CSS_CLASSES.ERROR_MSG });
      if (isInteractive) await _finalizeInteractiveModeUI(rawCommandText);
      return { success: false, error: e.message };
    }

    const cmdToEcho = rawCommandText.trim();
    if (isInteractive && !scriptingContext) { // Only echo for direct user commands
      DOM.inputLineContainerDiv.classList.add(Config.CSS_CLASSES.HIDDEN);
      const prompt = DOM.promptContainer.textContent;
      await OutputManager.appendToOutput(`${prompt}${cmdToEcho}`);
    }
    if (cmdToEcho === "") {
      if (isInteractive) await _finalizeInteractiveModeUI(rawCommandText);
      return { success: true, output: "" };
    }
    if (isInteractive) HistoryManager.add(cmdToEcho);
    if (isInteractive && !TerminalUI.getIsNavigatingHistory()) HistoryManager.resetIndex();

    let commandSequence;
    try {
      commandSequence = new Parser(new Lexer(commandToParse).tokenize()).parse();
    } catch (e) {
      await OutputManager.appendToOutput(e.message || "Command parse error.", { typeClass: Config.CSS_CLASSES.ERROR_MSG });
      if (isInteractive) await _finalizeInteractiveModeUI(rawCommandText);
      return { success: false, error: e.message || "Command parse error." };
    }

    let lastPipelineSuccess = true;
    let overallResult = { success: true, output: "" };

    for (let i = 0; i < commandSequence.length; i++) {
      const { pipeline, operator } = commandSequence[i];

      if (i > 0) {
        const prevOperator = commandSequence[i-1].operator;
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

        result = { success: true };
      } else {
        result = await _executePipeline(pipeline, { isInteractive, signal: null, scriptingContext, suppressOutput });
      }


      if (!result) {
        const err = `Critical: Pipeline execution returned an undefined result.`;
        console.error(err, "Pipeline:", pipeline);
        result = { success: false, error: err };
      }
      lastPipelineSuccess = result.success;
      overallResult = result;
    }

    if (isInteractive && !scriptingContext) {
      await _finalizeInteractiveModeUI(rawCommandText);
    }

    return overallResult;
  }


  function getCommands() {
    return commands;
  }

  return {
    initialize: () => {},
    processSingleCommand,
    getCommands,
    getActiveJobs,
    killJob,
    _ensureCommandLoaded,
    precacheCommonCommands
  };
})();