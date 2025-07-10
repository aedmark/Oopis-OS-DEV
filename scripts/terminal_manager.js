const TerminalManager = (() => {
    "use strict";

    let sessions = [];
    let activeSessionId = null;
    let nextSessionId = 0;

    const dom = {
        tabsContainer: null,
        sessionsContainer: null,
    };

    function initialize() {
        dom.tabsContainer = document.getElementById('tabs-container');
        dom.sessionsContainer = document.getElementById('terminal-sessions-container');

        if (!dom.tabsContainer || !dom.sessionsContainer) {
            console.error("TerminalManager: Critical DOM elements for tabbing are missing.");
            return;
        }

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

        // Create DOM structure for the new terminal session
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
        const appLayer = Utils.createElement('div', {className: 'hidden'});

        const terminalEl = Utils.createElement('div', {
            className: 'terminal',
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

        // Add to DOM
        dom.sessionsContainer.appendChild(terminalEl);

        // Create Tab
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
        dom.tabsContainer.appendChild(tabEl);

        sessions.push(session);
        switchSession(sessionId);

        // Add event listeners for this specific session
        addSessionEventListeners(session);

        return session;
    }

    function closeSession(sessionId) {
        if (sessions.length <= 1) return; // Don't close the last session

        const sessionIndex = sessions.findIndex(s => s.id === sessionId);
        if (sessionIndex === -1) return;

        const session = sessions[sessionIndex];

        // Clean up DOM
        session.domElements.terminal.remove();
        const tabEl = dom.tabsContainer.querySelector(`[data-session-id='${sessionId}']`);
        if (tabEl) tabEl.remove();

        // Remove from state
        sessions.splice(sessionIndex, 1);

        // Switch to another session if the active one was closed
        if (activeSessionId === sessionId) {
            const newActiveIndex = Math.max(0, sessionIndex - 1);
            switchSession(sessions[newActiveIndex].id);
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
            // Let ModalManager handle its own input
            if (ModalManager.isAwaiting()) {
                return;
            }

            switch (e.key) {
                case "Enter":
                    e.preventDefault();
                    // TabCompletionManager.resetCycle(); // Will need session-specific adaptation
                    const command = input.textContent;
                    input.textContent = ''; // Clear input immediately
                    await CommandExecutor.processSingleCommand(command, {isInteractive: true, sessionContext: session});
                    break;
                case "ArrowUp":
                    e.preventDefault();
                    const prevCmd = session.history.getPrevious();
                    if (prevCmd !== null) {
                        session.isNavigatingHistory = true;
                        input.textContent = prevCmd;
                        // Set caret to end
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
                // Tab completion to be re-implemented
            }
        });
    }

    return {
        initialize,
        createSession,
        closeSession,
        switchSession,
        getActiveSession,
        updatePrompt
    };
})();