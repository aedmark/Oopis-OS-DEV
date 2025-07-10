const Utils = (() => {
    "use strict";

    function extractComments(content, fileExtension) {
        let comments = [];
        let regex;

        switch (fileExtension) {
            case 'js':
                regex = /(\/\*[\s\S]*?\*\/|\/\/.+)/g;
                break;
            case 'sh':
                regex = /(^|\s)#. +/g;
                break;
            default:
                return ""; // Return empty for unsupported types
        }

        const matches = content.match(regex);
        if (matches) {
            comments = matches.map(comment => {
                if (comment.startsWith('/*')) {
                    // Clean up multi-line comment markers
                    return comment.replace(/^\/\*+/, '').replace(/\*\/$/, '').trim();
                } else {
                    // Clean up single-line comment markers
                    return comment.replace(/^\/\//, '').replace(/^#/, '').trim();
                }
            });
        }
        return comments.join('\n');
    }

    function debounce(func, delay) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), delay);
        };
    }

    function getCharacterDimensions(fontStyle = '16px "VT323"') {
        const tempSpan = document.createElement("span");
        tempSpan.textContent = 'M';
        tempSpan.style.font = fontStyle;
        tempSpan.style.position = 'absolute';
        tempSpan.style.left = '-9999px';
        tempSpan.style.top = '-9999px';
        tempSpan.style.visibility = 'hidden';

        document.body.appendChild(tempSpan);
        const rect = tempSpan.getBoundingClientRect();
        document.body.removeChild(tempSpan);

        return { width: rect.width, height: rect.height };
    }


    async function calculateSHA256(text) {
        if (typeof text !== 'string') {
            return null;
        }
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(text);
            const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
        } catch (error) {
            console.error("Password hashing failed:", error);
            return null;
        }
    }

    function formatConsoleArgs(args) {
        return Array.from(args)
            .map((arg) =>
                typeof arg === "object" && arg !== null
                    ? JSON.stringify(arg)
                    : String(arg)
            )
            .join(" ");
    }

    function deepCopyNode(node) {
        return node ? JSON.parse(JSON.stringify(node)) : null;
    }


    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
    }

    function getFileExtension(filePath) {
        if (!filePath || typeof filePath !== "string") return "";
        const separator = (typeof Config !== 'undefined' && Config.FILESYSTEM) ? Config.FILESYSTEM.PATH_SEPARATOR : '/';
        const name = filePath.substring(
            filePath.lastIndexOf(separator) + 1
        );
        const lastDot = name.lastIndexOf(".");
        if (lastDot === -1 || lastDot === 0 || lastDot === name.length - 1) {
            return "";
        }
        return name.substring(lastDot + 1).toLowerCase();
    }

    function createElement(tag, attributes = {}, ...childrenArgs) {
        const element = document.createElement(tag);
        for (const key in attributes) {
            if (Object.prototype.hasOwnProperty.call(attributes, key)) {
                const value = attributes[key];
                if (key === "textContent") {
                    element.textContent = value;
                } else if (key === "innerHTML") {
                    element.innerHTML = value;
                } else if (key === "classList" && Array.isArray(value)) {
                    element.classList.add(...value.filter(c => typeof c === 'string'));
                } else if (key === "className" && typeof value === "string") {
                    element.className = value;
                } else if (key === "style" && typeof value === "object") {
                    Object.assign(element.style, value);
                } else if (key === "eventListeners" && typeof value === "object") {
                    for (const eventType in value) {
                        if (Object.prototype.hasOwnProperty.call(value, eventType)) {
                            element.addEventListener(eventType, value[eventType]);
                        }
                    }
                } else if (value !== null && value !== undefined) {
                    element.setAttribute(key, String(value));
                }
            }
        }
        childrenArgs.flat().forEach((child) => {
            if (child instanceof Node) {
                element.appendChild(child);
            } else if (typeof child === 'string') {
                element.appendChild(document.createTextNode(child));
            }
        });
        return element;
    }

    function validateArguments(argsArray, config = {}) {
        const argCount = argsArray.length;
        if (typeof config.exact === "number" && argCount !== config.exact) {
            return { isValid: false, errorDetail: `expected exactly ${config.exact} argument(s) but got ${argCount}` };
        }
        if (typeof config.min === "number" && argCount < config.min) {
            return { isValid: false, errorDetail: `expected at least ${config.min} argument(s), but got ${argCount}` };
        }
        if (typeof config.max === "number" && argCount > config.max) {
            return { isValid: false, errorDetail: `expected at most ${config.max} argument(s), but got ${argCount}` };
        }
        return { isValid: true };
    }

    function parseNumericArg(argString, options = {}) {
        const { allowFloat = false, allowNegative = false, min, max } = options;
        const num = allowFloat ? parseFloat(argString) : parseInt(argString, 10);
        if (isNaN(num)) return { value: null, error: "is not a valid number" };
        if (!allowNegative && num < 0) return { value: null, error: "must be a non-negative number" };
        if (min !== undefined && num < min) return { value: null, error: `must be at least ${min}` };
        if (max !== undefined && num > max) return { value: null, error: `must be at most ${max}` };
        return { value: num, error: null };
    }

    function validateUsernameFormat(username) {
        if (!username || typeof username !== "string" || username.trim() === "") return { isValid: false, error: "Username cannot be empty." };
        if (username.includes(" ")) return { isValid: false, error: "Username cannot contain spaces." };
        if (typeof Config !== 'undefined' && Config.USER.RESERVED_USERNAMES.includes(username.toLowerCase())) return { isValid: false, error: `Cannot use '${username}'. This username is reserved.` };
        if (typeof Config !== 'undefined' && username.length < Config.USER.MIN_USERNAME_LENGTH) return { isValid: false, error: `Username must be at least ${Config.USER.MIN_USERNAME_LENGTH} characters long.` };
        if (typeof Config !== 'undefined' && username.length > Config.USER.MAX_USERNAME_LENGTH) return { isValid: false, error: `Username cannot exceed ${Config.USER.MAX_USERNAME_LENGTH} characters.` };
        return { isValid: true, error: null };
    }

    function parseFlags(argsArray, flagDefinitions) {
        const flags = {};
        const remainingArgs = [];
        flagDefinitions.forEach((def) => {
            flags[def.name] = def.takesValue ? null : false;
        });

        for (let i = 0; i < argsArray.length; i++) {
            const arg = argsArray[i];
            if (!arg.startsWith('-') || arg === '-' || arg === '--') {
                remainingArgs.push(arg);
                continue;
            }

            const exactDef = flagDefinitions.find(d => [d.long, d.short, ...(d.aliases || [])].includes(arg));
            if (exactDef) {
                if (exactDef.takesValue) {
                    if (i + 1 < argsArray.length) {
                        flags[exactDef.name] = argsArray[++i];
                    }
                } else {
                    flags[exactDef.name] = true;
                }
                continue;
            }

            if (!arg.startsWith('--') && arg.length > 2) {
                const shortFlag = arg.substring(0, 2);
                const valueTakingDef = flagDefinitions.find(d => [d.short].includes(shortFlag) && d.takesValue);
                if (valueTakingDef) {
                    flags[valueTakingDef.name] = arg.substring(2);
                    continue;
                }

                const chars = arg.substring(1);
                let consumed = true;
                for (const char of chars) {
                    const charDef = flagDefinitions.find(d => [d.short].includes(`-${char}`) && !d.takesValue);
                    if (charDef) {
                        flags[charDef.name] = true;
                    } else {
                        consumed = false;
                        break;
                    }
                }
                if (consumed) continue;
            }

            remainingArgs.push(arg);
        }

        return { flags, remainingArgs };
    }

    async function callLlmApi(provider, model, conversation, apiKey, systemPrompt = null) {
        const providerConfig = (typeof Config !== 'undefined') ? Config.API.LLM_PROVIDERS[provider] : null;
        if (!providerConfig) {
            return { success: false, error: `LLM provider '${provider}' not configured.` };
        }

        let url = providerConfig.url;
        let headers = { 'Content-Type': 'application/json' };
        let body;

        const chatMessages = [];
        if (systemPrompt) {
            chatMessages.push({ role: 'system', content: systemPrompt });
        }
        conversation.forEach(turn => {
            if (turn.role === 'user' || turn.role === 'model' || turn.role === 'assistant') {
                chatMessages.push({
                    role: turn.role === 'model' ? 'assistant' : turn.role,
                    content: turn.parts.map(p => p.text).join('\n')
                });
            }
        });

        switch (provider) {
            case 'gemini':
                headers['x-goog-api-key'] = apiKey;
                body = JSON.stringify({ contents: conversation });
                break;
            case 'ollama':
                url = url.replace('/generate', '/chat');
                body = JSON.stringify({ model: model || providerConfig.defaultModel, messages: chatMessages, stream: false });
                break;
            case 'llm-studio':
                body = JSON.stringify({
                    model: model || providerConfig.defaultModel,
                    messages: chatMessages,
                    temperature: 0.7,
                    stream: false
                });
                break;
            default:
                return { success: false, error: `Unsupported LLM provider: ${provider}` };
        }

        try {
            const response = await fetch(url, { method: 'POST', headers, body });
            if (!response.ok) {
                const errorText = await response.text();
                return { success: false, error: `API request failed with status ${response.status}: ${errorText}` };
            }

            const responseData = await response.json();
            let finalAnswer;
            switch (provider) {
                case 'gemini': finalAnswer = responseData.candidates?.[0]?.content?.parts?.[0]?.text; break;
                case 'ollama':
                    finalAnswer = responseData.message?.content || responseData.response;
                    break;
                case 'llm-studio': finalAnswer = responseData.choices?.[0]?.message?.content; break;
            }

            return finalAnswer ? { success: true, answer: finalAnswer } : { success: false, error: "AI failed to generate a valid response." };
        } catch (e) {
            if (provider !== 'gemini' && e instanceof TypeError) {
                return { success: false, error: `LOCAL_PROVIDER_UNAVAILABLE` };
            }
            return { success: false, error: `Network or fetch error: ${e.message}` };
        }
    }

    function globToRegex(glob) {
        if (glob === '*') return /.*/;

        let regexStr = "^";
        for (let i = 0; i < glob.length; i++) {
            const char = glob[i];
            switch (char) {
                case "*":
                    regexStr += ".*";
                    break;
                case "?":
                    regexStr += ".";
                    break;
                case "[":
                    let charClass = "[";
                    let k = i + 1;
                    if (k < glob.length && (glob[k] === "!" || glob[k] === "^")) {
                        charClass += "^";
                        k++;
                    }
                    while (k < glob.length && glob[k] !== "]") {
                        if (['\\', '-', ']'].includes(glob[k])) {
                            charClass += '\\';
                        }
                        charClass += glob[k];
                        k++;
                    }
                    if (k < glob.length && glob[k] === "]") {
                        charClass += "]";
                        i = k;
                    } else {
                        regexStr += "\\[";
                    }
                    break;
                default:
                    if (/[.\\+?()|[\]{}^$]/.test(char)) {
                        regexStr += '\\' + char;
                    } else {
                        regexStr += char;
                    }
                    break;
            }
        }
        regexStr += "$";
        try {
            return new RegExp(regexStr, 'u');
        } catch (e) {
            console.warn(`Utils.globToRegex: Failed to convert glob "${glob}" to regex: ${e.message}`);
            return null;
        }
    }

    return {
        getCharacterDimensions,
        calculateSHA256,
        formatConsoleArgs,
        deepCopyNode,
        formatBytes,
        getFileExtension,
        createElement,
        validateArguments,
        parseNumericArg,
        validateUsernameFormat,
        parseFlags,
        callLlmApi,
        globToRegex,
        debounce,
        extractComments
    };
})();

const TimestampParser = (() => {
    "use strict";

    function parseDateString(dateStr) {
        if (typeof dateStr !== "string") return null;

        const absoluteDate = new Date(dateStr);
        if (!isNaN(absoluteDate.getTime())) {
            if (isNaN(parseInt(dateStr.trim(), 10)) || !/^\d+$/.test(dateStr.trim())) {
                return absoluteDate;
            }
        }

        const relativeMatch = dateStr.match(/([-+]?\d+)\s*(minute|hour|day|week|month|year)s?(\s+ago)?/i);

        if (relativeMatch) {
            let amount = parseInt(relativeMatch[1], 10);
            const unit = relativeMatch[2].toLowerCase();
            const isAgo = !!relativeMatch[3];

            if (isAgo) {
                amount = -Math.abs(amount);
            }

            const now = new Date();

            switch (unit) {
                case "minute":
                    now.setMinutes(now.getMinutes() + amount);
                    break;
                case "hour":
                    now.setHours(now.getHours() + amount);
                    break;
                case "day":
                    now.setDate(now.getDate() + amount);
                    break;
                case "week":
                    now.setDate(now.getDate() + amount * 7);
                    break;
                case "month":
                    now.setMonth(now.getMonth() + amount);
                    break;
                case "year":
                    now.setFullYear(now.getFullYear() + amount);
                    break;
                default:
                    return null;
            }
            return now;
        }

        return null;
    }

    function parseStampToISO(stampStr) {
        let year, monthVal, day, hours, minutes, seconds = 0;
        const currentDate = new Date();
        let s = stampStr;
        if (s.includes(".")) {
            const parts = s.split(".");
            if (parts.length !== 2 || parts[1].length !== 2 || isNaN(parseInt(parts[1], 10))) return null;
            seconds = parseInt(parts[1], 10);
            if (seconds < 0 || seconds > 59) return null;
            s = parts[0];
        }
        if (s.length === 12) {
            year = parseInt(s.substring(0, 4), 10);
            monthVal = parseInt(s.substring(4, 6), 10);
            day = parseInt(s.substring(6, 8), 10);
            hours = parseInt(s.substring(8, 10), 10);
            minutes = parseInt(s.substring(10, 12), 10);
        } else if (s.length === 10) {
            const YY = parseInt(s.substring(0, 2), 10);
            if (isNaN(YY)) return null;
            year = YY < 69 ? 2000 + YY : 1900 + YY;
            monthVal = parseInt(s.substring(2, 4), 10);
            day = parseInt(s.substring(4, 6), 10);
            hours = parseInt(s.substring(6, 8), 10);
            minutes = parseInt(s.substring(8, 10), 10);
        } else return null;
        if (isNaN(year) || isNaN(monthVal) || isNaN(day) || isNaN(hours) || isNaN(minutes)) return null;
        if (monthVal < 1 || monthVal > 12 || day < 1 || day > 31 || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
        const dateObj = new Date(Date.UTC(year, monthVal - 1, day, hours, minutes, seconds));
        if (dateObj.getUTCFullYear() !== year || dateObj.getUTCMonth() !== monthVal - 1 || dateObj.getUTCDate() !== day || dateObj.getUTCHours() !== hours || dateObj.getUTCMinutes() !== minutes || dateObj.getUTCSeconds() !== seconds) return null;
        return dateObj.toISOString();
    }

    function resolveTimestampFromCommandFlags(flags, commandName) {
        if (flags.dateString && flags.stamp) {
            return { timestampISO: null, error: `${commandName}: cannot use both --date and --stamp flags simultaneously.` };
        }
        if (flags.dateString) {
            const parsedDate = parseDateString(flags.dateString);
            if (!parsedDate) {
                return { timestampISO: null, error: `${commandName}: invalid date string format '${flags.dateString}'` };
            }
            return { timestampISO: parsedDate.toISOString(), error: null };
        }
        if (flags.stamp) {
            const parsedISO = parseStampToISO(flags.stamp);
            if (!parsedISO) {
                return { timestampISO: null, error: `${commandName}: invalid stamp format '${flags.stamp}' (expected [[CC]YY]MMDDhhmm[.ss])` };
            }
            return { timestampISO: parsedISO, error: null };
        }
        return { timestampISO: new Date().toISOString(), error: null };
    }
    return {
        parseDateString,
        resolveTimestampFromCommandFlags,
    };
})();

const DiffUtils = (() => {
    "use strict";

    function compare(textA, textB) {
        const a = textA.split('\n');
        const b = textB.split('\n');
        const N = a.length;
        const M = b.length;
        const max = N + M;
        const v = new Array(2 * max + 1).fill(0);
        const trace = [];

        for (let d = 0; d <= max; d++) {
            trace.push([...v]);
            for (let k = -d; k <= d; k += 2) {
                let x;
                if (k === -d || (k !== d && v[k - 1 + max] < v[k + 1 + max])) {
                    x = v[k + 1 + max];
                } else {
                    x = v[k - 1 + max] + 1;
                }
                let y = x - k;
                while (x < N && y < M && a[x] === b[y]) {
                    x++;
                    y++;
                }
                v[k + max] = x;
                if (x >= N && y >= M) {
                    let diffOutput = [];
                    let px = N;
                    let py = M;

                    for (let td = d; td > 0; td--) {
                        const prev_v = trace[td - 1];
                        const p_k = px - py;
                        let prev_k;
                        if (p_k === -td || (p_k !== td && prev_v[p_k - 1 + max] < prev_v[p_k + 1 + max])) {
                            prev_k = p_k + 1;
                        }
                        else {
                            prev_k = p_k - 1;
                        }
                        let prev_x = prev_v[prev_k + max];
                        let prev_y = prev_x - prev_k;
                        while (px > prev_x && py > prev_y) {
                            diffOutput.unshift(`  ${a[px - 1]}`);
                            px--;
                            py--;
                        }
                        if (td > 0) {
                            if (prev_x < px) {
                                diffOutput.unshift(`< ${a[px - 1]}`);
                            } else {
                                diffOutput.unshift(`> ${b[py - 1]}`);
                            }
                        }
                        px = prev_x;
                        py = prev_y;
                    }
                    while (px > 0 && py > 0) {
                        diffOutput.unshift(`  ${a[px - 1]}`);
                        px--;
                        py--;
                    }
                    return diffOutput.join('');
                }
            }
        }
        return "";
    }

    return {
        compare
    };
})();

const PatchUtils = (() => {
    "use strict";

    function createPatch(oldText, newText) {
        if (oldText === newText) {
            return null;
        }
        let start = 0;
        while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) {
            start++;
        }
        let oldEnd = oldText.length;
        let newEnd = newText.length;
        while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) {
            oldEnd--;
            newEnd--;
        }
        const deletedText = oldText.substring(start, oldEnd);
        const insertedText = newText.substring(start, newEnd);
        return {
            index: start,
            delete: deletedText.length,
            insert: insertedText,
            deleted: deletedText
        };
    }

    function applyPatch(text, patch) {
        const head = text.substring(0, patch.index);
        const tail = text.substring(patch.index + patch.delete);
        return head + patch.insert + tail;
    }

    function applyInverse(text, patch) {
        const head = text.substring(0, patch.index);
        const tail = text.substring(patch.index + patch.insert.length);
        return head + patch.deleted + tail;
    }

    return {
        createPatch,
        applyPatch,
        applyInverse
    };
})();

const PagerUI = (() => {
    "use strict";
    let elements = {};

    function buildLayout() {
        elements.content = Utils.createElement('div', { id: 'pager-content', className: 'p-2 whitespace-pre-wrap' });
        elements.statusBar = Utils.createElement('div', { id: 'pager-status', className: 'bg-gray-700 text-white p-1 text-center font-bold' });
        elements.container = Utils.createElement('div', { id: 'pager-container', className: 'flex flex-col h-full w-full bg-black text-white font-mono' }, [elements.content, elements.statusBar]);
        return elements.container;
    }

    function render(lines, topVisibleLine, mode, terminalRows) {
        if (!elements.content || !elements.statusBar) return;

        const visibleLines = lines.slice(topVisibleLine, topVisibleLine + terminalRows);
        elements.content.innerHTML = visibleLines.join('<br>');

        const percent = lines.length > 0 ? Math.min(100, Math.round(((topVisibleLine + terminalRows) / lines.length) * 100)) : 100;
        elements.statusBar.textContent = `-- ${mode.toUpperCase()} -- (${percent}%) (q to quit)`;
    }

    function getTerminalRows() {
        if (!elements.content) return 24;
        const screenHeight = elements.content.clientHeight;
        const computedStyle = window.getComputedStyle(elements.content);
        const fontStyle = computedStyle.font;
        const { height: lineHeight } = Utils.getCharacterDimensions(fontStyle);
        if (lineHeight === 0) {
            return 24;
        }

        return Math.max(1, Math.floor(screenHeight / lineHeight));
    }

    function reset() {
        elements = {};
    }

    return { buildLayout, render, getTerminalRows, reset };
})();

const PagerManager = (() => {
    "use strict";
    let isActive = false;
    let lines = [];
    let topVisibleLine = 0;
    let terminalRows = 24;
    let mode = 'more';
    let exitCallback = null;

    function _handleKeyDown(e) {
        if (!isActive) return;

        e.preventDefault();
        let scrolled = false;

        switch (e.key) {
            case 'q':
                exit();
                break;
            case ' ':
            case 'f':
                topVisibleLine = Math.min(topVisibleLine + terminalRows, Math.max(0, lines.length - terminalRows));
                scrolled = true;
                break;
            case 'ArrowDown':
                if (mode === 'less') {
                    topVisibleLine = Math.min(topVisibleLine + 1, Math.max(0, lines.length - terminalRows));
                    scrolled = true;
                }
                break;
            case 'b':
            case 'ArrowUp':
                if (mode === 'less') {
                    topVisibleLine = Math.max(0, topVisibleLine - terminalRows);
                    scrolled = true;
                }
                break;
        }

        if (scrolled) {
            PagerUI.render(lines, topVisibleLine, mode, terminalRows);
        }
    }

    function enter(content, options) {
        if (isActive) return;
        isActive = true;

        lines = content.split('\n');
        topVisibleLine = 0;
        mode = options.mode || 'more';

        const pagerElement = PagerUI.buildLayout();
        AppLayerManager.show(pagerElement);

        document.addEventListener('keydown', _handleKeyDown);

        setTimeout(() => {
            terminalRows = PagerUI.getTerminalRows();
            PagerUI.render(lines, topVisibleLine, mode, terminalRows);
        }, 0);

        return new Promise(resolve => {
            exitCallback = resolve;
        });
    }

    function exit() {
        if (!isActive) return;
        document.removeEventListener('keydown', _handleKeyDown);
        AppLayerManager.hide();
        PagerUI.reset();

        isActive = false;
        lines = [];
        topVisibleLine = 0;

        if (exitCallback) {
            exitCallback();
            exitCallback = null;
        }
    }

    return { enter, isActive: () => isActive };
})();