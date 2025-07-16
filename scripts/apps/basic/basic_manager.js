// scripts/apps/basic/basic_manager.js

class BasicManager extends App {
    constructor() {
        super();
        this.interpreter = new Basic_interp();
        this.programBuffer = new Map();
        this.onInputPromiseResolver = null;
        this.loadOptions = {}; // To store the initial file path and content
    }

    enter(appLayer, options = {}) {
        this.isActive = true;
        this.loadOptions = options;

        this.container = BasicUI.buildLayout({
            onInput: this._handleIdeInput.bind(this),
            onExit: this.exit.bind(this)
        });

        // The manager now handles appending to the app layer
        appLayer.appendChild(this.container);

        this._init();
    }

    exit() {
        if (!this.isActive) return;

        BasicUI.reset(); // UI cleanup
        AppLayerManager.hide(this); // Manager tells AppLayerManager to hide

        // Reset state
        this.isActive = false;
        this.interpreter = new Basic_interp();
        this.programBuffer.clear();
        this.onInputPromiseResolver = null;
        this.loadOptions = {};
    }

    _init() {
        BasicUI.writeln('Oopis BASIC [Version 1.0]');
        BasicUI.writeln('(c) 2025 Oopis Systems. All rights reserved.');
        BasicUI.writeln('');

        if (this.loadOptions.content) {
            this._loadContentIntoBuffer(this.loadOptions.content);
            BasicUI.writeln(`Loaded "${this.loadOptions.path}".`);
        }

        BasicUI.writeln('READY.');
        setTimeout(() => BasicUI.focusInput(), 0);
    }

    _loadContentIntoBuffer(content) {
        this.programBuffer.clear();
        const lines = content.split('\n');
        for (const line of lines) {
            if (line.trim() === '') continue;
            const match = line.match(/^(\d+)\s*(.*)/);
            if (match) {
                const lineNumber = parseInt(match[1], 10);
                const lineContent = match[2].trim();
                if (lineContent) {
                    this.programBuffer.set(lineNumber, lineContent);
                }
            }
        }
    }

    async _handleIdeInput(command) {
        command = command.trim();
        BasicUI.writeln(`> ${command}`);

        if (this.onInputPromiseResolver) {
            this.onInputPromiseResolver(command);
            this.onInputPromiseResolver = null;
            return;
        }

        if (command === '') {
            BasicUI.writeln('READY.');
            return;
        }

        const lineMatch = command.match(/^(\d+)(.*)/);
        if (lineMatch) {
            const lineNumber = parseInt(lineMatch[1], 10);
            const lineContent = lineMatch[2].trim();
            if (lineContent === '') {
                this.programBuffer.delete(lineNumber);
            } else {
                this.programBuffer.set(lineNumber, lineContent);
            }
        } else {
            const firstSpaceIndex = command.indexOf(' ');
            let cmd, argsStr;
            if (firstSpaceIndex === -1) {
                cmd = command.toUpperCase();
                argsStr = '';
            } else {
                cmd = command.substring(0, firstSpaceIndex).toUpperCase();
                argsStr = command.substring(firstSpaceIndex + 1).trim();
            }
            await this._executeIdeCommand(cmd, argsStr);
        }
        if (this.isActive) {
            BasicUI.writeln('READY.');
        }
    }

    async _executeIdeCommand(cmd, argsStr) {
        switch (cmd) {
            case 'RUN': await this._runProgram(); break;
            case 'LIST': this._listProgram(); break;
            case 'NEW':
                this.programBuffer.clear();
                this.loadOptions = {};
                BasicUI.writeln('OK');
                break;
            case 'SAVE': await this._saveProgram(argsStr); break;
            case 'LOAD': await this._loadProgram(argsStr); break;
            case 'EXIT': this.exit(); break;
            default: BasicUI.writeln('SYNTAX ERROR'); break;
        }
    }

    _getProgramText() {
        const sortedLines = Array.from(this.programBuffer.keys()).sort((a, b) => a - b);
        return sortedLines.map(lineNum => `${lineNum} ${this.programBuffer.get(lineNum)}`).join('\n');
    }

    _listProgram() {
        const sortedLines = Array.from(this.programBuffer.keys()).sort((a, b) => a - b);
        sortedLines.forEach(lineNum => {
            BasicUI.writeln(`${lineNum} ${this.programBuffer.get(lineNum)}`);
        });
        BasicUI.writeln('OK');
    }

    async _runProgram() {
        const programText = this._getProgramText();
        if (programText.length === 0) {
            BasicUI.writeln('OK');
            return;
        }
        try {
            await this.interpreter.run(programText, {
                outputCallback: (text, withNewline = true) => {
                    withNewline ? BasicUI.writeln(text) : BasicUI.write(text);
                },
                inputCallback: async () => new Promise(resolve => {
                    this.onInputPromiseResolver = resolve;
                }),
                pokeCallback: (x, y, char, color) => {
                    // This could be implemented to draw directly on the BASIC UI's output div
                }
            });
        } catch (error) {
            BasicUI.writeln(`\nRUNTIME ERROR: ${error.message}`);
        }
        BasicUI.writeln('');
    }

    async _saveProgram(filePathArg) {
        let savePath = filePathArg ? filePathArg.replace(/["']/g, '') : this.loadOptions.path;
        if (!savePath) {
            BasicUI.writeln("?NO FILENAME SPECIFIED");
            return;
        }
        if (!savePath.endsWith('.bas')) savePath += '.bas';

        const content = this._getProgramText();
        const absPath = FileSystemManager.getAbsolutePath(savePath);
        const currentUser = UserManager.getCurrentUser().name;
        const primaryGroup = UserManager.getPrimaryGroupForUser(currentUser);
        const saveResult = await FileSystemManager.createOrUpdateFile(absPath, content, { currentUser, primaryGroup });

        if (saveResult.success && await FileSystemManager.save()) {
            this.loadOptions.path = savePath;
            BasicUI.writeln('OK');
        } else {
            BasicUI.writeln(`?ERROR SAVING FILE: ${saveResult.error || "Filesystem error"}`);
        }
    }

    async _loadProgram(filePathArg) {
        if (!filePathArg) {
            BasicUI.writeln("?FILENAME REQUIRED");
            return;
        }
        const path = filePathArg.replace(/["']/g, '');
        const pathValidation = FileSystemManager.validatePath(path, {expectedType: 'file', permissions: ['read']});
        if (pathValidation.error) {
            BasicUI.writeln(`?ERROR: ${pathValidation.error}`);
            return;
        }
        this._loadContentIntoBuffer(pathValidation.node.content);
        this.loadOptions = { path: path, content: pathValidation.node.content };
        BasicUI.writeln("OK");
    }
}

// Create the singleton that the 'basic' command will use
const Basic = new BasicManager();