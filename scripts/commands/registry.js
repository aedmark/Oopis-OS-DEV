// scripts/commands/registry.js
const CommandRegistry = (() => {
    "use strict";

    const commandDefinitions = {};

    function register(definition) {
        if (!definition || !definition.commandName) {
            console.error("CommandRegistry: Attempted to register an invalid command definition.");
            return;
        }
        if (commandDefinitions[definition.commandName]) {
            console.warn(`CommandRegistry: Overwriting command '${definition.commandName}'.`);
        }
        commandDefinitions[definition.commandName] = definition;
    }

    function getDefinitions() {
        return { ...commandDefinitions };
    }

    return {
        register,
        getDefinitions,
    };
})();