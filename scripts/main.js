// aedmark/oopis-os-dev/Oopis-OS-DEV-33c780ad7f3af576fec163e3a060e1960f4bc842/scripts/main.js
// No global DOM object is needed anymore.

function initializeEventListeners() {
  document.addEventListener("paste", (e) => {
    const activeSession = TerminalManager.getActiveSession();
    if (!activeSession || !activeSession.domElements.input) return;

    if (document.activeElement === activeSession.domElements.input) {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData("text/plain");
      const processedText = text.replace(/\r?\n|\r/g, " ");

      if (typeof ModalManager !== 'undefined' && ModalManager.isAwaiting() && ModalManager.isObscured()) {
        // This path needs to be updated if ModalManager becomes session-aware
        // For now, assuming it delegates correctly.
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
  OutputManager.initializeConsoleOverrides();

  try {
    await IndexedDBManager.init();
    TerminalManager.initialize();

    await FileSystemManager.load();
    await UserManager.initializeDefaultUsers();
    await Config.loadFromFile();
    GroupManager.initialize();
    AliasManager.initialize();
    SessionManager.initializeStack();

    const guestHome = `/home/${Config.USER.DEFAULT_NAME}`;
    const initialSession = TerminalManager.getActiveSession();
    if (initialSession && !FileSystemManager.getNodeByPath(initialSession.currentPath)) {
      if (FileSystemManager.getNodeByPath(guestHome)) {
        initialSession.currentPath = guestHome;
      } else {
        initialSession.currentPath = Config.FILESYSTEM.ROOT_PATH;
      }
      FileSystemManager.setCurrentPath(initialSession.currentPath);
    }

    // Initial prompt update for the first session
    TerminalManager.updatePrompt();

    // Welcome message is now handled by TerminalManager on session creation.
    console.log(`${Config.OS.NAME} v.${Config.OS.VERSION} loaded successfully!`);

  } catch (error) {
    console.error("Failed to initialize OopisOs on window.onload:", error, error.stack);
    // Fallback for critical error before session UI is ready
    const terminalBezel = document.getElementById("terminal-bezel");
    if (terminalBezel) {
      terminalBezel.innerHTML = `<div style="color:red; padding: 20px;">FATAL ERROR: ${error.message}. Check console for details.</div>`;
    }
  }
};