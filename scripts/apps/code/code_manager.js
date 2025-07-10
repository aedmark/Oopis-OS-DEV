/**
 * code_manager.js
 *
 * The state management module for the Code editor.
 * It is headless (no DOM access) and manages file state, content,
 * and contains the syntax highlighting engine.
 */
'use strict';

const CodeManager = (function () {

    // The internal state of the editor. A fortress of solitude.
    const state = {
        isActive: false,
        currentFilePath: null,
        originalContent: '',
        currentContent: '',
        isDirty: false,
        fileMode: 'plaintext', // 'javascript', 'markdown', or 'plaintext'
    };

    // A cache for our compiled regular expressions. We do not waste cycles.
    const highlightingRules = {
        javascript: null,
        markdown: null
    };

    /**
     * Escapes essential HTML characters to prevent XSS and rendering errors.
     * This must be the first step, always.
     * @param {string} str The raw string.
     * @returns {string} The escaped string.
     */
    function escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /**
     * Compiles the regex for JavaScript highlighting.
     * The order of tokens in the master regex is critical.
     * We capture comments and strings first to avoid highlighting keywords within them.
     */
    function getJavascriptRules() {
        if (highlightingRules.javascript) return highlightingRules.javascript;

        const rules = [
            {name: 'comment', regex: /(\/\*[\s\S]*?\*\/|\/\/.*)/},
            {name: 'string', regex: /("(?:[^"\\]|\\.)*")|('(?:[^'\\]|\\.)*')/},
            {
                name: 'keyword',
                regex: /\b(const|let|var|function|return|if|else|for|while|switch|case|break|continue|new|this|typeof|instanceof|delete|try|catch|finally|import|export|from|default|async|await|class|extends|super)\b/
            },
            {
                name: 'builtin',
                regex: /\b(console|document|window|Math|JSON|Promise|Object|Array|String|Number|Boolean|Date|localStorage|sessionStorage|navigator|setTimeout|setInterval|clearTimeout|clearInterval)\b/
            },
            {name: 'function', regex: /\b([a-zA-Z_]\w*)(?=\s*\()/},
            {name: 'number', regex: /\b(\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b/},
            {name: 'operator', regex: /(=>|===|==|!==|!=|<=|>=|&&|\|\||\*\*|[+\-*/%&|^<>!?~=])/},
            {name: 'punctuation', regex: /([{}()\[\].,;:])/}
        ];

        const source = rules.map(rule => `(${rule.regex.source})`).join('|');
        highlightingRules.javascript = {
            regex: new RegExp(source, 'g'),
            names: rules.map(rule => rule.name)
        };
        return highlightingRules.javascript;
    }

    /**
     * Compiles the regex for Markdown highlighting.
     * Order is again critical: blocks first, then inline elements.
     */
    function getMarkdownRules() {
        if (highlightingRules.markdown) return highlightingRules.markdown;

        const rules = [
            // Match entire code blocks first to prevent inner highlighting
            {name: 'md-code-block', regex: /(^```[\s\S]*?^```)/m},
            // Headings (must match start of line)
            {name: 'md-heading', regex: /^(#+ .*)(\r\n|\r|\n|$)/m},
            // Bold and Italic (bold first)
            {name: 'md-bold', regex: /(\*\*)(.*?)\1/},
            {name: 'md-italic', regex: /(\*)(.*?)\1/},
            // Inline code
            {name: 'md-inline-code', regex: /(`)(.*?)\1/},
            // Links
            {name: 'md-link', regex: /\[(.*?)\]\((.*?)\)/},
            // List items (must match start of line)
            {name: 'md-list', regex: /^( *[-*] .*)(\r\n|\r|\n|$)/m},
            {name: 'md-list', regex: /^( *\d+\. .*)(\r\n|\r|\n|$)/m},
        ];

        const source = rules.map(rule => `(${rule.regex.source})`).join('|');
        highlightingRules.markdown = {
            regex: new RegExp(source, 'g'),
            names: rules.map(rule => rule.name)
        };
        return highlightingRules.markdown;
    }


    /**
     * The Syntax Highlighting Engine.
     * It takes raw code and transforms it into safe, styled HTML.
     * @param {string} code The raw code.
     * @param {string} language The language ('javascript' or 'markdown').
     * @returns {string} HTML string with tokens wrapped in <span> elements.
     */
    function highlight(code, language) {
        if (!code) return '';
        const escapedCode = escapeHtml(code);

        const ruleset = language === 'javascript' ? getJavascriptRules() :
            language === 'markdown' ? getMarkdownRules() :
                null;

        if (!ruleset) return escapedCode; // No highlighting for plaintext

        return escapedCode.replace(ruleset.regex, (...matches) => {
            // The first element is the full match, last two are offset and string.
            // In between are the capture groups for each rule.
            const allCaptures = matches.slice(1, -2);

            // Find which capture group matched. The structure of the master regex
            // is (rule1)|(rule2)|... so we must find the first non-undefined group.
            let ruleIndex = 0;
            let capturedMatch;

            for (let i = 0; i < allCaptures.length; i++) {
                if (allCaptures[i] !== undefined) {
                    // This is our match. Now we need to know which rule it belongs to.
                    // This requires careful counting of capturing groups inside each rule's regex.
                    // A simpler way: Find the index of the first defined capture.
                    capturedMatch = allCaptures[i];
                    let groupCounter = 0;
                    for (let j = 0; j < ruleset.names.length; j++) {
                        // The number of groups in a regex can be found by a trick
                        const numGroups = (new RegExp(matches[0] + '|')).exec('').length - 1;
                        if (i >= groupCounter && i < groupCounter + 1 + numGroups) {
                            ruleIndex = j;
                            break;
                        }
                        groupCounter += 1 + numGroups;
                    }


                    break;
                }
            }


            const className = ruleset.names[ruleIndex] || 'token-unknown';
            return `<span class="token-${className}">${capturedMatch}</span>`;
        });
    }


    // Callbacks passed to the UI, allowing it to communicate back to the manager.
    const callbacks = {
        onContentChange: (newContent) => {
            state.currentContent = newContent;
            const wasDirty = state.isDirty;
            state.isDirty = state.currentContent !== state.originalContent;

            // Only re-render if the dirty status changed, to update the UI indicator
            if (wasDirty !== state.isDirty && CodeUI && CodeUI.updateDirtyStatus) {
                CodeUI.updateDirtyStatus(state.isDirty, state.currentFilePath);
            }
        },
        onSave: async () => {
            if (!state.isActive) return;

            // If there's no path, this is a new file. We must ask for a path.
            if (!state.currentFilePath) {
                const newPath = await kernel.prompt('Save As:', '/home/user/');
                if (!newPath) return; // User cancelled.
                // Here, you would normally validate the path. Assuming kernel.prompt provides a valid one.
                state.currentFilePath = newPath;
            }

            try {
                await fs.writeFile(state.currentFilePath, state.currentContent);
                state.originalContent = state.currentContent;
                state.isDirty = false;
                if (CodeUI && CodeUI.updateDirtyStatus) {
                    CodeUI.updateDirtyStatus(state.isDirty, state.currentFilePath);
                }
                // Optional: show a success message in the UI status bar
            } catch (e) {
                // Optional: show an error message in the UI status bar
                console.error("Failed to save file:", e);
            }
        },
        onExit: () => {
            publicApi.exit();
        },
        getInitialState: () => {
            return {
                content: state.currentContent,
                isDirty: state.isDirty,
                filePath: state.currentFilePath,
                fileMode: state.fileMode
            };
        }
    };

    // The public API. This is all the outside world can see.
    const publicApi = {
        /**
         * Enters the Code editor, initializing state and showing the UI.
         * @param {string|null} filePath The path to the file.
         * @param {string} fileContent The initial content of the file.
         */
        enter: function (filePath, fileContent) {
            if (state.isActive) return; // Do not allow re-entry.

            state.isActive = true;
            state.currentFilePath = filePath;
            state.originalContent = fileContent;
            state.currentContent = fileContent;
            state.isDirty = false;

            if (filePath) {
                if (filePath.endsWith('.js')) {
                    state.fileMode = 'javascript';
                } else if (filePath.endsWith('.md')) {
                    state.fileMode = 'markdown';
                } else {
                    state.fileMode = 'plaintext';
                }
            } else {
                state.fileMode = 'plaintext';
            }

            // The Architect's design is clear: Manager tells UI what to do.
            if (typeof CodeUI !== 'undefined') {
                CodeUI.buildAndShow(callbacks);
            } else {
                console.error("CodeUI is not present. The hands are missing.");
                state.isActive = false; // Abort.
            }
        },

        /**
         * Exits the editor, handling unsaved changes.
         */
        exit: async function () {
            if (!state.isActive) return;

            if (state.isDirty) {
                const confirmation = await kernel.confirm(
                    `File '${state.currentFilePath || "untitled"}' has unsaved changes. Exit without saving?`
                );
                if (!confirmation) {
                    return; // The user chose not to exit.
                }
            }

            // Reset state to a pristine condition.
            state.isActive = false;
            state.currentFilePath = null;
            state.originalContent = '';
            state.currentContent = '';
            state.isDirty = false;
            state.fileMode = 'plaintext';

            if (typeof CodeUI !== 'undefined') {
                CodeUI.hideAndReset();
            }
        },

        // Expose the highlighting engine for the UI to use.
        highlight: highlight
    };

    return publicApi;
})();