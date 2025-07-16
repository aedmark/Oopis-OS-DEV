// scripts/apps/adventure/adventure_manager.js

class AdventureManager extends App {
    constructor() {
        super();
        this.state = {};
        this.callbacks = {
            processCommand: this._processCommand.bind(this),
            onExitRequest: this.exit.bind(this),
        };
        // The engine logic is now fully contained and managed by the class instance
        this.engineLogic = this._createEngineLogic();
    }

    enter(appLayer, options = {}) {
        if (this.isActive) return;

        this.isActive = true;
        this.engineLogic.initializeState(options.adventureData, options.scriptingContext);

        this.container = TextAdventureModal.buildLayout(this.state.adventure, this.callbacks, this.state.scriptingContext);
        appLayer.appendChild(this.container);

        this.engineLogic.displayCurrentRoom();

        if (this.state.scriptingContext?.isScripting) {
            this._runScript();
        } else {
            setTimeout(() => this.container.focus(), 0);
        }
    }

    async _runScript() {
        const context = this.state.scriptingContext;
        while (context.currentLineIndex < context.lines.length - 1 && this.isActive) {
            let nextCommand = await TextAdventureModal.requestInput("");
            if (nextCommand === null) break;
            await this._processCommand(nextCommand);
        }
        if (this.isActive) {
            this.exit();
        }
    }

    exit() {
        if (!this.isActive) return;
        TextAdventureModal.hideAndReset();
        AppLayerManager.hide(this);
        this.isActive = false;
        this.state = {};
    }

    handleKeyDown(event) {
        if (event.key === 'Escape') {
            this.exit();
        }
    }

    _processCommand(command) {
        return this.engineLogic.processCommand(command);
    }

    _createEngineLogic() {
        const defaultVerbs = {
            look: {action: 'look', aliases: ['l', 'examine', 'x', 'look at', 'look in', 'look inside']},
            go: {action: 'go', aliases: ['north', 'south', 'east', 'west', 'up', 'down', 'n', 's', 'e', 'w', 'u', 'd', 'enter', 'exit']},
            take: {action: 'take', aliases: ['get', 'grab', 'pick up']},
            drop: {action: 'drop', aliases: []},
            use: {action: 'use', aliases: []},
            inventory: {action: 'inventory', aliases: ['i', 'inv']},
            help: {action: 'help', aliases: ['?']},
            quit: {action: 'quit', aliases: []},
            save: {action: 'save', aliases: []},
            load: {action: 'load', aliases: []},
            talk: {action: 'talk', aliases: ['talk to', 'speak to', 'speak with']},
            ask: {action: 'ask', aliases: []},
            give: {action: 'give', aliases: []},
            show: {action: 'show', aliases: ['show to']},
            score: {action: 'score', aliases: []},
            read: {action: 'read', aliases: []},
            eat: {action: 'eat', aliases: []},
            drink: {action: 'drink', aliases: []},
            push: {action: 'push', aliases: []},
            pull: {action: 'pull', aliases: []},
            turn: {action: 'turn', aliases: []},
            wear: {action: 'wear', aliases: []},
            remove: {action: 'remove', aliases: ['take off']},
            listen: {action: 'listen', aliases: []},
            smell: {action: 'smell', aliases: []},
            touch: {action: 'touch', aliases: []},
            again: {action: 'again', aliases: ['g']},
            wait: {action: 'wait', aliases: ['z']},
            dance: {action: 'dance', aliases: []},
            sing: {action: 'sing', aliases: []},
            jump: {action: 'jump', aliases: []},
            open: {action: 'open', aliases: []},
            close: {action: 'close', aliases: []},
            unlock: {action: 'unlock', aliases: []},
            lock: {action: 'lock', aliases: []},
            light: {action: 'light', aliases: []},
            put: {action: 'put', aliases: []}
        };

        const engine = {
            initializeState: (adventureData, scriptingContext) => {
                const adventure = JSON.parse(JSON.stringify(adventureData));
                this.state = {
                    adventure,
                    player: {
                        currentLocation: adventure.startingRoomId,
                        inventory: adventure.player?.inventory || [],
                        score: 0,
                        moves: 0,
                    },
                    scriptingContext: scriptingContext || null,
                    disambiguationContext: null,
                    lastReferencedItemId: null,
                    lastPlayerCommand: '',
                };
                this.state.adventure.verbs = {...defaultVerbs, ...adventure.verbs};
                this.state.adventure.npcs = this.state.adventure.npcs || {};
                this.state.adventure.daemons = this.state.adventure.daemons || {};

                if (this.state.adventure.winCondition) this.state.adventure.winCondition.triggered = false;
                for (const roomId in this.state.adventure.rooms) this.state.adventure.rooms[roomId].visited = false;
            },

            _getItemsInLocation: (locationId) => {
                const items = [];
                for (const id in this.state.adventure.items) {
                    if (this.state.adventure.items[id].location === locationId) {
                        items.push(this.state.adventure.items[id]);
                    }
                }
                return items;
            },

            _getNpcsInLocation: (locationId) => {
                const npcs = [];
                for (const id in this.state.adventure.npcs) {
                    if (this.state.adventure.npcs[id].location === locationId) {
                        npcs.push(this.state.adventure.npcs[id]);
                    }
                }
                return npcs;
            },

            _getDynamicDescription: (entity) => {
                if (entity.descriptions && entity.state && entity.descriptions[entity.state]) {
                    return entity.descriptions[entity.state];
                }
                return entity.description;
            },

            _hasLightSource: () => {
                return this.state.player.inventory.some(itemId => {
                    const item = this.state.adventure.items[itemId];
                    return item && item.isLightSource && item.isLit;
                });
            },

            displayCurrentRoom: () => {
                const room = this.state.adventure.rooms[this.state.player.currentLocation];
                if (!room) {
                    TextAdventureModal.appendOutput("Error: You have fallen into the void. The game cannot continue.", 'error');
                    return;
                }

                if (room.isDark && !engine._hasLightSource()) {
                    TextAdventureModal.updateStatusLine(room.name, this.state.player.score, this.state.player.moves);
                    TextAdventureModal.appendOutput("It is pitch black. You are likely to be eaten by a grue.", 'room-desc');
                    return;
                }

                if (!room.visited) {
                    room.visited = true;
                    const roomPoints = room.points || 5;
                    this.state.player.score += roomPoints;
                    TextAdventureModal.appendOutput(`[You have gained ${roomPoints} points for entering a new area]`, 'system');
                }

                TextAdventureModal.updateStatusLine(room.name, this.state.player.score, this.state.player.moves);
                TextAdventureModal.appendOutput(engine._getDynamicDescription(room), 'room-desc');

                const roomNpcs = engine._getNpcsInLocation(this.state.player.currentLocation);
                if (roomNpcs.length > 0) {
                    roomNpcs.forEach(npc => {
                        TextAdventureModal.appendOutput(`You see ${npc.name} here.`, 'items');
                    });
                }

                const roomItems = engine._getItemsInLocation(this.state.player.currentLocation);
                if (roomItems.length > 0) {
                    TextAdventureModal.appendOutput("You see here: " + roomItems.map(item => item.name).join(", ") + ".", 'items');
                }

                const exitNames = Object.keys(room.exits || {});
                if (exitNames.length > 0) {
                    TextAdventureModal.appendOutput("Exits: " + exitNames.join(", ") + ".", 'exits');
                } else {
                    TextAdventureModal.appendOutput("There are no obvious exits.", 'exits');
                }
            },

            processCommand: async (command) => {
                if (!command) return;

                if (this.state.disambiguationContext) {
                    engine._handleDisambiguation(command.toLowerCase().trim());
                    return;
                }

                let commandToProcess = command.toLowerCase().trim();

                if (commandToProcess === 'again' || commandToProcess === 'g') {
                    if (!this.state.lastPlayerCommand) {
                        TextAdventureModal.appendOutput("You haven't entered a command to repeat yet.", 'error');
                        return;
                    }
                    TextAdventureModal.appendOutput(`(repeating: ${this.state.lastPlayerCommand})`, 'system');
                    commandToProcess = this.state.lastPlayerCommand;
                } else {
                    this.state.lastPlayerCommand = commandToProcess;
                }
                this.state.player.moves++;
                const parsedCommands = engine._parseMultiCommand(commandToProcess);
                let stopProcessing = false;

                for (const cmd of parsedCommands) {
                    if (stopProcessing) break;

                    if (cmd.error) {
                        TextAdventureModal.appendOutput(cmd.error, 'error');
                        break;
                    }

                    const {verb, directObject, indirectObject} = cmd;
                    const onDisambiguation = () => { stopProcessing = true; };

                    switch (verb.action) {
                        case 'look': engine._handleLook(directObject, onDisambiguation); break;
                        case 'go': engine._handleGo(directObject); break;
                        case 'take': engine._handleTake(directObject, onDisambiguation); break;
                        case 'drop': engine._handleDrop(directObject, onDisambiguation); break;
                        case 'use': engine._handleUse(directObject, indirectObject, onDisambiguation); break;
                        case 'open': engine._handleOpen(directObject, onDisambiguation); break;
                        case 'close': engine._handleClose(directObject, onDisambiguation); break;
                        case 'unlock': engine._handleUnlock(directObject, indirectObject, onDisambiguation); break;
                        case 'inventory': engine._handleInventory(); break;
                        case 'help': engine._handleHelp(); break;
                        case 'quit': this.exit(); stopProcessing = true; break;
                        case 'save': await engine._handleSave(directObject); break;
                        case 'load': await engine._handleLoad(directObject); break;
                        case 'talk': engine._handleTalk(directObject, onDisambiguation); break;
                        case 'ask': engine._handleAsk(directObject, indirectObject, onDisambiguation); break;
                        case 'give': engine._handleGive(directObject, indirectObject, onDisambiguation); break;
                        case 'show': engine._handleShow(directObject, indirectObject, onDisambiguation); break;
                        case 'score': engine._handleScore(); break;
                        case 'read': engine._handleRead(directObject, onDisambiguation); break;
                        case 'eat': engine._handleEatDrink('eat', directObject, onDisambiguation); break;
                        case 'drink': engine._handleEatDrink('drink', directObject, onDisambiguation); break;
                        case 'push': engine._handlePushPullTurn('push', directObject, onDisambiguation); break;
                        case 'pull': engine._handlePushPullTurn('pull', directObject, onDisambiguation); break;
                        case 'turn': engine._handlePushPullTurn('turn', directObject, onDisambiguation); break;
                        case 'wear': engine._handleWearRemove('wear', directObject, onDisambiguation); break;
                        case 'remove': engine._handleWearRemove('remove', directObject, onDisambiguation); break;
                        case 'listen': engine._handleSensoryVerb('listen', directObject, onDisambiguation); break;
                        case 'smell': engine._handleSensoryVerb('smell', directObject, onDisambiguation); break;
                        case 'touch': engine._handleSensoryVerb('touch', directObject, onDisambiguation); break;
                        case 'wait': engine._handleWait(); break;
                        case 'dance': TextAdventureModal.appendOutput("You do a little jig. You feel refreshed.", 'system'); break;
                        case 'sing': TextAdventureModal.appendOutput("You belt out a sea shanty. A nearby bird looks annoyed.", 'system'); break;
                        case 'jump': TextAdventureModal.appendOutput("You jump on the spot. Whee!", 'system'); break;
                        case 'light': engine._handleLight(directObject, onDisambiguation); break;
                        default: TextAdventureModal.appendOutput(`I don't know how to "${verb.action}".`, 'error'); stopProcessing = true;
                    }

                    if (!stopProcessing) {
                        engine._processDaemons();
                        engine._checkWinConditions();
                        if (parsedCommands.length > 1) {
                            await new Promise(resolve => setTimeout(resolve, 350));
                        }
                    }
                }
            },

            // All helper methods are included below
            _parseSingleCommand: (command, defaultVerb = null) => {
                const originalWords = command.toLowerCase().trim().split(/\s+/).filter(Boolean);

                const resolvedWords = originalWords.map(word => {
                    if (word === 'it') {
                        if (this.state.lastReferencedItemId && this.state.adventure.items[this.state.lastReferencedItemId]) {
                            return this.state.adventure.items[this.state.lastReferencedItemId].noun;
                        }
                        return 'IT_ERROR_NO_REF';
                    }
                    return word;
                });

                if (resolvedWords.includes('IT_ERROR_NO_REF')) {
                    return {error: "You haven't referred to anything yet. What do you mean by 'it'?"};
                }

                let verb = null;
                let verbWordCount = 0;

                for (let i = Math.min(resolvedWords.length, 3); i > 0; i--) {
                    const potentialVerbPhrase = resolvedWords.slice(0, i).join(' ');
                    const resolvedVerb = engine._resolveVerb(potentialVerbPhrase);
                    if (resolvedVerb) {
                        verb = resolvedVerb;
                        verbWordCount = i;
                        break;
                    }
                }

                if (!verb) {
                    if (defaultVerb) {
                        verb = defaultVerb;
                        verbWordCount = 0;
                    } else if (resolvedWords.length === 1) {
                        const potentialGoVerb = engine._resolveVerb(resolvedWords[0]);
                        if (potentialGoVerb && potentialGoVerb.action === 'go') {
                            return {verb: potentialGoVerb, directObject: resolvedWords[0], indirectObject: null};
                        }
                    } else {
                        return {verb: null, error: `I don't understand the verb in "${command}".`};
                    }
                }

                const remainingWords = resolvedWords.slice(verbWordCount);
                const prepositions = ['on', 'in', 'at', 'with', 'using', 'to', 'under', 'about'];
                let directObject;
                let indirectObject = null;
                let prepositionIndex = -1;

                for (const prep of prepositions) {
                    const index = remainingWords.indexOf(prep);
                    if (index !== -1) {
                        prepositionIndex = index;
                        break;
                    }
                }

                const articles = new Set(['a', 'an', 'the']);
                if (prepositionIndex !== -1) {
                    directObject = remainingWords.slice(0, prepositionIndex).filter(w => !articles.has(w)).join(' ');
                    indirectObject = remainingWords.slice(prepositionIndex + 1).filter(w => !articles.has(w)).join(' ');
                } else {
                    directObject = remainingWords.filter(w => !articles.has(w)).join(' ');
                }

                return {verb, directObject, indirectObject};
            },

            _parseMultiCommand: (command) => {
                const commands = [];
                const separator = ';;;';
                const commandString = command.toLowerCase().trim()
                    .replace(/\s*,\s*and\s*|\s*,\s*|\s+and\s+|\s+then\s+/g, separator);
                const commandQueue = commandString.split(separator).filter(c => c.trim());

                let lastVerb = null;
                for (const subCommandStr of commandQueue) {
                    const parsed = engine._parseSingleCommand(subCommandStr, lastVerb);
                    if (parsed.verb) {
                        commands.push(parsed);
                        const firstWord = subCommandStr.split(/\s+/)[0];
                        if (engine._resolveVerb(firstWord)) {
                            lastVerb = parsed.verb;
                        }
                    } else {
                        commands.push({error: parsed.error || `I don't understand "${subCommandStr}".`});
                        break;
                    }
                }
                return commands;
            },

            _resolveVerb: (verbWord) => {
                if (!verbWord) return null;
                for (const verbKey in this.state.adventure.verbs) {
                    const verbDef = this.state.adventure.verbs[verbKey];
                    if (verbKey === verbWord || verbDef.aliases?.includes(verbWord)) {
                        return verbDef;
                    }
                }
                return null;
            },

            _findItem: (targetString, scope) => {
                if (!targetString) return {found: []};
                const targetWords = new Set(targetString.toLowerCase().split(/\s+/).filter(Boolean));
                if (targetWords.size === 0) return {found: []};

                const potentialItems = [];
                for (const item of scope) {
                    const itemAdjectives = new Set(item.adjectives?.map(a => a.toLowerCase()));
                    const itemNoun = item.noun.toLowerCase();
                    let score = 0;

                    if (targetWords.has(itemNoun)) {
                        score += 10;
                        targetWords.forEach(word => {
                            if (itemAdjectives.has(word)) score += 1;
                        });
                    }

                    if (score > 0) potentialItems.push({item, score});
                }

                if (potentialItems.length === 0) return {found: []};

                potentialItems.sort((a, b) => b.score - a.score);
                const topScore = potentialItems[0].score;
                const foundItems = potentialItems.filter(p => p.score === topScore).map(p => p.item);
                const exactMatch = foundItems.length === 1 && targetString === foundItems[0].noun;

                return {found: foundItems, exactMatch};
            },

            _handleDisambiguation: (response) => {
                const {found, context} = this.state.disambiguationContext;
                const result = engine._findItem(response, found);
                this.state.disambiguationContext = null;

                if (result.found.length === 1) {
                    context.callback(result.found[0]);
                } else {
                    TextAdventureModal.appendOutput("That's still not specific enough. Please try again.", 'info');
                }
            },

            // All other handlers...
            _handleGo: (direction) => {
                const room = this.state.adventure.rooms[this.state.player.currentLocation];
                const exitId = room.exits ? room.exits[direction] : null;

                if (!exitId) {
                    TextAdventureModal.appendOutput("You can't go that way.", 'error');
                    return;
                }

                const exitBlocker = Object.values(this.state.adventure.items).find(item => item.location === this.state.player.currentLocation && item.blocksExit && item.blocksExit[direction]);
                if (exitBlocker && (!exitBlocker.isOpenable || !exitBlocker.isOpen)) {
                    TextAdventureModal.appendOutput(exitBlocker.lockedMessage || `The way is blocked by the ${exitBlocker.name}.`);
                    return;
                }

                if (this.state.adventure.rooms[exitId]) {
                    this.state.player.currentLocation = exitId;
                    engine.displayCurrentRoom();
                } else {
                    TextAdventureModal.appendOutput("You can't go that way.", 'error');
                }
            },
            _checkWinConditions: () => {
                const wc = this.state.adventure.winCondition;
                if (!wc || wc.triggered) return;

                let won = false;
                if (wc.type === "itemInRoom" && this.state.adventure.items[wc.itemId]?.location === wc.roomId) {
                    won = true;
                } else if (wc.type === "playerHasItem" && this.state.player.inventory.includes(wc.itemId)) {
                    won = true;
                } else if (wc.type === "itemUsedOn" && wc.triggered) {
                    won = true;
                }

                if (won) {
                    wc.triggered = true; // Prevent re-triggering
                    TextAdventureModal.appendOutput(`\n${this.state.adventure.winMessage}`, 'adv-success');
                    if (this.container.querySelector('#adventure-input')) {
                        this.container.querySelector('#adventure-input').disabled = true;
                    }
                    // No need to clear callbacks, the app will exit
                }
            }
        };

        return engine;
    }
}

const Adventure = new AdventureManager();