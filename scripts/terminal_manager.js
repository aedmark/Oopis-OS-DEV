const TerminalManager = (() => {
    "use strict";

    let sessions = [];
    let activeSessionId = null;
    let nextSessionId = 0;

    const dom = {
        tabsContainer: null,
        sessionsContainer: null,
        newTabBtn: null
    };

    function initialize() {
        dom.tabsContainer = document.getElementById('tabs-container');
        dom.sessionsContainer = document.getElementById('terminal-sessions-container');
        dom.newTabBtn = document.getElementById('new-tab-btn');

        if (!dom.tabsContainer || !dom.sessionsContainer || !dom.newTabBtn) {
            console.error("TerminalManager: Critical DOM elements for tabbing are missing.");
            return;
        }

        dom.newTabBtn.addEventListener('click', () => createSession());

        createSession(); // Create the initial session
    }

    function createSession() {
        const sessionId = nextSessionId++;
        const user = UserManager.getCurrentUser();

        const session = {
            id: sessionId,
            currentPath: FileSystemManager.getCurrentPath(),
            history: new HistoryManager(),
            environment: new EnvironmentManager(user.name),
            domElements: {},
            isNavigatingHistory: false
        };

        const outputDiv = Utils.createElement('div', {className: 'terminal__output'});
        const promptContainer = Utils.createElement('div', {className: 'terminal__prompt'});
        const inputDiv = Utils.createElement('div', {
            className: 'terminal__input',
            contentEditable: 'true',
            spellcheck: 'false',
            autocapitalize: 'none'
        });
        const inputContainer = Utils.createElement('div', {className: 'terminal__input-wrapper'}, inputDiv);
        const inputLine = Utils.createElement('div', {className: 'terminal__input-line'}, promptContainer, inputContainer);
        const appLayer = Utils.createElement('div', {className: 'app-layer hidden'}); // Corrected class

        const terminalEl = Utils.createElement('div', {
            className: 'terminal hidden', // Start hidden
            'data-session-id': sessionId
        }, outputDiv, appLayer, inputLine);

        session.domElements = {
            terminal: terminalEl,
            output: outputDiv,
            prompt: promptContainer,
            input: inputDiv,
            inputLine: inputLine,
            appLayer: appLayer
        };

        dom.sessionsContainer.appendChild(terminalEl);

        const tabEl = Utils.createElement('div', {
            className: 'terminal-tab',
            textContent: `Session ${sessionId + 1}`,
            'data-session-id': sessionId
        });

        const closeBtn = Utils.createElement('span', {className: 'close-tab-btn', textContent: ' ×'});
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeSession(sessionId);
        });

        tabEl.appendChild(closeBtn);
        tabEl.addEventListener('click', () => switchSession(sessionId));

        dom.tabsContainer.insertBefore(tabEl, dom.newTabBtn);

        sessions.push(session);
        switchSession(sessionId);

        addSessionEventListeners(session);

        if (sessions.length === 1) { // If it's the first session
            const welcomeMessage = `${Config.MESSAGES.WELCOME_PREFIX} ${user.name}${Config.MESSAGES.WELCOME_SUFFIX}`;
            OutputManager.appendToOutput(welcomeMessage, {outputEl: session.domElements.output});
        }


        return session;
    }

    function closeSession(sessionId) {
        if (sessions.length <= 1) return;

        const sessionIndex = sessions.findIndex(s => s.id === sessionId);
        if (sessionIndex === -1) return;

        const session = sessions[sessionIndex];

        session.domElements.terminal.remove();
        const tabEl = dom.tabsContainer.querySelector(`[data-session-id='${sessionId}']`);
        if (tabEl) tabEl.remove();

        sessions.splice(sessionIndex, 1);

        if (activeSessionId === sessionId) {
            const newActiveIndex = Math.max(0, sessionIndex - 1);
            if (sessions.length > 0) {
                switchSession(sessions[newActiveIndex].id);
            }
        }
    }


    function switchSession(sessionId) {
        activeSessionId = sessionId;

        sessions.forEach(session => {
            const isActive = session.id === sessionId;
            session.domElements.terminal.classList.toggle('hidden', !isActive);
            const tabEl = dom.tabsContainer.querySelector(`[data-session-id='${session.id}']`);
            if (tabEl) {
                tabEl.classList.toggle('active', isActive);
            }
        });

        const activeSession = getActiveSession();
        if (activeSession) {
            FileSystemManager.setCurrentPath(activeSession.currentPath);
            updatePrompt();
            activeSession.domElements.input.focus();
        }
    }

    function getActiveSession() {
        return sessions.find(s => s.id === activeSessionId);
    }

    function getAllSessions() {
        return sessions;
    }

    function updatePrompt(session = getActiveSession()) {
        if (!session) return;
        const user = UserManager.getCurrentUser();
        const ps1 = session.environment.get('PS1') || '\\u@\\h:\\w\\$ ';
        const host = session.environment.get('HOST') || Config.OS.DEFAULT_HOST_NAME;
        const path = session.currentPath;
        const homeDir = `/home/${user.name}`;
        const displayPath = path.startsWith(homeDir) ? `~${path.substring(homeDir.length)}` : path;

        let parsedPrompt = ps1.replace(/\\u/g, user.name)
            .replace(/\\h/g, host)
            .replace(/\\w/g, displayPath)
            .replace(/\\W/g, path.substring(path.lastIndexOf('/') + 1) || '/')
            .replace(/\\$/g, user.name === 'root' ? '#' : '$')
            .replace(/\\s/g, "OopisOS")
            .replace(/\\\\/g, '\\');

        session.domElements.prompt.textContent = parsedPrompt;
    }

    function addSessionEventListeners(session) {
        const {terminal, input} = session.domElements;

        terminal.addEventListener("click", (e) => {
            if (e.target.closest("button, a")) return;
            if (!input.contains(e.target)) {
                input.focus();
            }
        });

        input.addEventListener('keydown', async (e) => {
            switch (e.key) {
                case "Enter":
                    e.preventDefault();
                    const command = input.textContent;
                    if (command.trim() !== '') {
                        session.history.add(command);
                        session.history.resetIndex();
                    }
                    input.textContent = '';
                    await CommandExecutor.processSingleCommand(command, {isInteractive: true, sessionContext: session});
                    break;
                case "ArrowUp":
                    e.preventDefault();
                    const prevCmd = session.history.getPrevious();
                    if (prevCmd !== null) {
                        session.isNavigatingHistory = true;
                        input.textContent = prevCmd;
                        const range = document.createRange();
                        const sel = window.getSelection();
                        range.selectNodeContents(input);
                        range.collapse(false);
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }
                    break;
                case "ArrowDown":
                    e.preventDefault();
                    const nextCmd = session.history.getNext();
                    if (nextCmd !== null) {
                        session.isNavigatingHistory = true;
                        input.textContent = nextCmd;
                    }
                    break;
            }
        });
    }

    return {
        initialize,
        createSession,
        closeSession,
        switchSession,
        getActiveSession,
        getAllSessions,
        updatePrompt
    };
})();