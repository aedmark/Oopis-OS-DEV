// scripts/apps/adventure/adventure_ui.js

const TextAdventureModal = (() => {
  "use strict";

  let elements = {};
  let callbacks = {}; // To store callbacks from the manager

  function buildLayout(adventureData, cb, scriptingContext) {
    callbacks = cb; // Store the manager's callbacks
    _createElements(); // Build the DOM structure

    // Set up event listeners that call the manager's callbacks
    elements.input.addEventListener('keydown', _handleInput);

    if (scriptingContext?.isScripting) {
      elements.input.style.display = 'none';
    }

    setTimeout(() => elements.input.focus(), 0);

    return elements.container; // Return the built container
  }

  function hideAndReset() {
    if (elements.input) {
      elements.input.removeEventListener('keydown', _handleInput);
    }
    if (elements.container) {
      elements.container.remove();
    }
    elements = {};
    callbacks = {};
  }

  function _createElements() {
    const roomNameSpan = Utils.createElement('span', { id: 'adventure-room-name' });
    const scoreSpan = Utils.createElement('span', { id: 'adventure-score' });
    const headerLeft = Utils.createElement('div', {}, roomNameSpan);
    const headerRight = Utils.createElement('div', {}, scoreSpan);
    const header = Utils.createElement('header', { id: 'adventure-header' }, headerLeft, headerRight);
    const output = Utils.createElement('div', { id: 'adventure-output' });
    const inputPrompt = Utils.createElement('span', { id: 'adventure-prompt', textContent: '>' });
    const input = Utils.createElement('input', { id: 'adventure-input', type: 'text', spellcheck: 'false', autocapitalize: 'none' });
    const inputContainer = Utils.createElement('div', { id: 'adventure-input-container' }, inputPrompt, input);
    const container = Utils.createElement('div', { id: 'adventure-container' }, header, output, inputContainer);

    elements = { container, header, output, input, roomNameSpan, scoreSpan };
  }

  function _handleInput(e) {
    if (e.key !== 'Enter' || !callbacks.processCommand) return;
    e.preventDefault();
    const command = elements.input.value;
    elements.input.value = '';
    appendOutput(`> ${command}`, 'system');
    callbacks.processCommand(command);
  }

  function appendOutput(text, styleClass = '') {
    if (!elements.output) return;
    const p = Utils.createElement('p', { textContent: text });
    if (styleClass) {
      p.className = `adv-${styleClass}`;
    }
    elements.output.appendChild(p);
    elements.output.scrollTop = elements.output.scrollHeight;
  }

  function updateStatusLine(roomName, score, moves) {
    if (elements.roomNameSpan) {
      elements.roomNameSpan.textContent = roomName;
    }
    if (elements.scoreSpan) {
      elements.scoreSpan.textContent = `Score: ${score}  Moves: ${moves}`;
    }
  }

  return {
    buildLayout,
    hideAndReset,
    appendOutput,
    updateStatusLine,
  };
})();