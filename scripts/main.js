// aedmark/oopis-os-dev/Oopis-OS-DEV-e5518cea540819416617bfa81def39b31b5d26d1/scripts/main.js
let DOM = {}; // DOM is now a legacy concept, will be phased out.

function initializeEventListeners() {
  // This function is now mostly obsolete. Event listeners are handled by TerminalManager per session.
  // Global listeners like 'paste' might still live here if they need to delegate to the active session.
  document.addEventListener("paste", (e) => {
    const activeSession = TerminalManager.getActiveSession();
    if (activeSession && document.activeElement === activeSession.domElements.input) {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData("text/plain");
      const processedText = text.replace(/\r?\n|\r/g, " ");

      if (ModalInputManager.isAwaiting() && ModalInputManager.isObscured()) {
        ModalInputManager.handlePaste(processedText);
      } else {
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return;

        const range = selection.getRangeAt(0);
        if (!activeSession.domElements.input.contains(range.commonAncestorContainer)) return;

        range.deleteContents();
        const textNode = document.createTextNode(processedText);
        range.insertNode(textNode);

        range.setStartAfter(textNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  });
}

window.onload = async () => {
  // Caching global elements that are not session-specific
  DOM = {
    terminalBezel: document.getElementById("terminal-bezel"),
    appLayer: document.getElementById("app-layer"), // This might need rethinking
  };

  OutputManager.initializeConsoleOverrides();

  try {
    await IndexedDBManager.init();

    // --- FIX: Initialize UI Manager first ---
    TerminalManager.initialize();

    await FileSystemManager.load();
    await UserManager.initializeDefaultUsers();
    await Config.loadFromFile();
    GroupManager.initialize();
    AliasManager.initialize();
    SessionManager.initializeStack();

    // The rest of the logic needs to be adapted to the new session-based model
    const guestHome = `/home/${Config.USER.DEFAULT_NAME}`;
    const initialSession = TerminalManager.getActiveSession();
    if (initialSession && !FileSystemManager.getNodeByPath(initialSession.currentPath)) {
      if (FileSystemManager.getNodeByPath(guestHome)) {
        initialSession.currentPath = guestHome;
        FileSystemManager.setCurrentPath(guestHome);
      } else {
        initialSession.currentPath = Config.FILESYSTEM.ROOT_PATH;
        FileSystemManager.setCurrentPath(Config.FILESYSTEM.ROOT_PATH);
      }
    }

    // Initial prompt update for the first session
    TerminalManager.updatePrompt();
    console.log(
        `${Config.OS.NAME} v.${Config.OS.VERSION} loaded successfully!`
    );

  } catch (error) {
    console.error(
        "Failed to initialize OopisOs on window.onload:",
        error,
        error.stack
    );
    const outputDiv = document.getElementById('output'); // Fallback for critical error
    if (outputDiv) {
      outputDiv.innerHTML += `<div class="text-red-500">FATAL ERROR: ${error.message}. Check console for details.</div>`;
    }
  }
};