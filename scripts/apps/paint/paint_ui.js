// scripts/apps/paint/paint_ui.js

const PaintUI = (() => {
    "use strict";

    let elements = {};
    let managerCallbacks = {};

    function buildAndShow(initialState, callbacks) {
        managerCallbacks = callbacks;

        elements.container = Utils.createElement('div', { id: 'paint-container', className: 'paint-container' });

        const createToolBtn = (name, key, iconClass) => Utils.createElement('button', {
            id: `paint-tool-${name}`,
            className: 'btn',
            innerHTML: `<i class="fas ${iconClass}"></i>`,
            title: `${name.charAt(0).toUpperCase() + name.slice(1)} (${key.toUpperCase()})`
        });

        const toolGroup = Utils.createElement('div', { className: 'paint-tool-group' }, [
            elements.pencilBtn = createToolBtn('pencil', 'p', 'fa-pencil-alt'),
            elements.eraserBtn = createToolBtn('eraser', 'e', 'fa-eraser'),
            elements.lineBtn = createToolBtn('line', 'l', 'fa-minus'),
            elements.rectBtn = createToolBtn('rect', 'r', 'fa-square')
        ]);

        const colorSwatches = initialState.PALETTE.map(color =>
            Utils.createElement('div', { className: 'paint-color-swatch', style: { backgroundColor: color }, 'data-color': color })
        );
        const colorGroup = Utils.createElement('div', { className: 'paint-tool-group' }, colorSwatches);

        elements.brushSizeInput = Utils.createElement('input', { type: 'number', className: 'paint-brush-size', value: initialState.brushSize, min: 1, max: 5 });
        const brushSizeUp = Utils.createElement('button', { className: 'btn', textContent: '+' });
        const brushSizeDown = Utils.createElement('button', { className: 'btn', textContent: '-' });
        const brushGroup = Utils.createElement('div', { className: 'paint-brush-controls' }, [brushSizeDown, elements.brushSizeInput, brushSizeUp]);

        elements.charInput = Utils.createElement('input', { type: 'text', className: 'paint-char-selector', value: initialState.currentCharacter, maxLength: 1 });
        elements.undoBtn = Utils.createElement('button', {
            className: 'btn',
            innerHTML: '<i class="fas fa-undo"></i>',
            title: 'Undo (Ctrl+Z)'
        });
        elements.redoBtn = Utils.createElement('button', {
            className: 'btn',
            innerHTML: '<i class="fas fa-redo"></i>',
            title: 'Redo (Ctrl+Y)'
        });
        elements.gridBtn = Utils.createElement('button', {
            className: 'btn',
            innerHTML: '<i class="fas fa-th"></i>',
            title: 'Toggle Grid (G)'
        });
        const historyGroup = Utils.createElement('div', { className: 'paint-tool-group' }, [elements.undoBtn, elements.redoBtn, elements.gridBtn]);

        elements.zoomInBtn = Utils.createElement('button', {
            className: 'btn',
            innerHTML: '<i class="fas fa-search-plus"></i>',
            title: 'Zoom In (Ctrl++)'
        });
        elements.zoomOutBtn = Utils.createElement('button', {
            className: 'btn',
            innerHTML: '<i class="fas fa-search-minus"></i>',
            title: 'Zoom Out (Ctrl+-)'
        });
        const zoomGroup = Utils.createElement('div', {className: 'paint-tool-group'}, [elements.zoomOutBtn, elements.zoomInBtn]);

        const toolbar = Utils.createElement('header', {className: 'paint-toolbar'}, [toolGroup, colorGroup, brushGroup, elements.charInput, historyGroup, zoomGroup]);

        elements.canvas = Utils.createElement('div', { className: 'paint-canvas', id: 'paint-canvas' });
        elements.previewCanvas = Utils.createElement('div', { className: 'paint-preview-canvas', id: 'paint-preview-canvas' });
        const canvasContainer = Utils.createElement('div', { className: 'paint-canvas-container' }, [elements.canvas, elements.previewCanvas]);
        const mainArea = Utils.createElement('main', { className: 'paint-main' }, [canvasContainer]);

        elements.statusTool = Utils.createElement('span');
        elements.statusChar = Utils.createElement('span');
        elements.statusBrush = Utils.createElement('span');
        elements.statusCoords = Utils.createElement('span');
        elements.statusZoom = Utils.createElement('span');
        elements.statusBar = Utils.createElement('footer', { className: 'paint-statusbar' }, [
            elements.statusTool, elements.statusChar, elements.statusBrush, elements.statusCoords, elements.statusZoom
        ]);

        elements.container.append(toolbar, mainArea, elements.statusBar);

        renderInitialCanvas(initialState.canvasData, initialState.canvasDimensions);
        updateToolbar(initialState);
        updateStatusBar(initialState);
        updateZoom(initialState.zoomLevel, initialState.gridVisible);
        _addEventListeners();

        AppLayerManager.show(elements.container);
        elements.container.focus();
    }

    function hideAndReset() {
        document.removeEventListener('mouseup', handleGlobalMouseUp);
        AppLayerManager.hide();
        elements = {};
        managerCallbacks = {};
    }

    function handleGlobalMouseUp(e) {
        if (!managerCallbacks.onCanvasMouseUp) return;

        let coords = null;
        if (elements.canvas && elements.canvas.contains(e.target)) {
            coords = _getCoordsFromEvent(e);
        }
        managerCallbacks.onCanvasMouseUp(coords);
    }

    function renderInitialCanvas(canvasData, dimensions) {
        elements.canvas.innerHTML = '';
        elements.previewCanvas.innerHTML = '';
        elements.canvas.style.gridTemplateColumns = `repeat(${dimensions.width}, 1ch)`;
        elements.canvas.style.gridTemplateRows = `repeat(${dimensions.height}, 1em)`;
        elements.previewCanvas.style.gridTemplateColumns = `repeat(${dimensions.width}, 1ch)`;
        elements.previewCanvas.style.gridTemplateRows = `repeat(${dimensions.height}, 1em)`;
        for (let y = 0; y < dimensions.height; y++) {
            for (let x = 0; x < dimensions.width; x++) {
                const dataCell = canvasData[y][x];
                const cell = Utils.createElement('span', { id: `cell-${x}-${y}`, className: 'paint-canvas-cell', textContent: dataCell.char, style: { color: dataCell.color } });
                elements.canvas.appendChild(cell);
                const previewCell = Utils.createElement('span', { id: `preview-cell-${x}-${y}`, className: 'paint-canvas-cell' });
                elements.previewCanvas.appendChild(previewCell);
            }
        }
    }

    function updateCanvas(cellsToUpdate) {
        cellsToUpdate.forEach(data => {
            const cell = document.getElementById(`cell-${data.x}-${data.y}`);
            if (cell) {
                cell.textContent = data.char;
                cell.style.color = data.color;
            }
        });
    }

    function updatePreviewCanvas(cellsToUpdate) {
        Array.from(elements.previewCanvas.children).forEach(child => {
            if (child.textContent !== ' ') {
                child.textContent = ' ';
                child.style.color = 'transparent';
            }
        });
        cellsToUpdate.forEach(data => {
            const cell = document.getElementById(`preview-cell-${data.x}-${data.y}`);
            if (cell) {
                cell.textContent = data.char;
                cell.style.color = data.color;
            }
        });
    }

    function updateToolbar(state) {
        ['pencil', 'eraser', 'line', 'rect'].forEach(tool => {
            elements[`${tool}Btn`].classList.toggle('active', state.currentTool === tool);
        });
        document.querySelectorAll('.paint-color-swatch').forEach(swatch => {
            swatch.classList.toggle('active', swatch.dataset.color === state.currentColor);
        });
        elements.brushSizeInput.value = state.brushSize;
        elements.charInput.value = state.currentCharacter;
        elements.undoBtn.disabled = state.undoStack.length <= 1;
        elements.redoBtn.disabled = state.redoStack.length === 0;
    }

    function updateStatusBar(state, coords = null) {
        elements.statusTool.textContent = `Tool: ${state.currentTool}`;
        elements.statusChar.textContent = `Char: '${state.currentCharacter}'`;
        elements.statusBrush.textContent = `Brush: ${state.brushSize}`;
        elements.statusCoords.textContent = coords ? `Coords: ${coords.x}, ${coords.y}` : '';
        elements.statusZoom.textContent = `Zoom: ${state.zoomLevel}%`;
    }

    function toggleGrid(visible) {
        elements.canvas.classList.toggle('grid-visible', visible);
    }

    function updateZoom(zoomLevel, isGridEnabled) {
        const baseFontSize = 20;
        const newSize = baseFontSize * (zoomLevel / 100);
        const gridShouldBeVisible = zoomLevel >= 70 && isGridEnabled;
        if (elements.canvas) {
            elements.canvas.style.fontSize = `${newSize}px`;
            toggleGrid(gridShouldBeVisible);
        }
        if (elements.previewCanvas) {
            elements.previewCanvas.style.fontSize = `${newSize}px`;
        }
    }

    function _getCoordsFromEvent(e) {
        if (!elements.canvas || !elements.canvas.firstChild) return null;
        const rect = elements.canvas.getBoundingClientRect();
        const charWidth = elements.canvas.firstChild.offsetWidth;
        const charHeight = elements.canvas.firstChild.offsetHeight;
        if(charWidth === 0 || charHeight === 0) return null;
        const x = Math.floor((e.clientX - rect.left) / charWidth);
        const y = Math.floor((e.clientY - rect.top) / charHeight);

        if (x < 0 || y < 0 || x >= (elements.canvas.style.gridTemplateColumns.split(' ').length) || y >= (elements.canvas.style.gridTemplateRows.split(' ').length)) {
            return null;
        }
        return {x, y};
    }

    function _addEventListeners() {
        elements.pencilBtn.addEventListener('click', () => managerCallbacks.onToolSelect('pencil'));
        elements.eraserBtn.addEventListener('click', () => managerCallbacks.onToolSelect('eraser'));
        elements.lineBtn.addEventListener('click', () => managerCallbacks.onToolSelect('line'));
        elements.rectBtn.addEventListener('click', () => managerCallbacks.onToolSelect('rect'));
        elements.container.querySelectorAll('.paint-color-swatch').forEach(swatch => {
            swatch.addEventListener('click', () => managerCallbacks.onColorSelect(swatch.dataset.color));
        });
        elements.brushSizeInput.addEventListener('change', (e) => managerCallbacks.onBrushSizeChange(parseInt(e.target.value, 10)));
        elements.container.querySelector('.paint-brush-controls .btn:nth-child(1)').addEventListener('click', () => managerCallbacks.onBrushSizeChange(parseInt(elements.brushSizeInput.value, 10) - 1));
        elements.container.querySelector('.paint-brush-controls .btn:nth-child(3)').addEventListener('click', () => managerCallbacks.onBrushSizeChange(parseInt(elements.brushSizeInput.value, 10) + 1));
        elements.charInput.addEventListener('input', (e) => managerCallbacks.onCharChange(e.target.value));
        elements.undoBtn.addEventListener('click', () => managerCallbacks.onUndo());
        elements.redoBtn.addEventListener('click', () => managerCallbacks.onRedo());
        elements.gridBtn.addEventListener('click', () => managerCallbacks.onToggleGrid());
        elements.zoomInBtn.addEventListener('click', () => managerCallbacks.onZoomIn());
        elements.zoomOutBtn.addEventListener('click', () => managerCallbacks.onZoomOut());

        elements.canvas.addEventListener('mousedown', (e) => {
            const coords = _getCoordsFromEvent(e);
            if(coords) managerCallbacks.onCanvasMouseDown(coords);
        });
        elements.canvas.addEventListener('mousemove', (e) => {
            const coords = _getCoordsFromEvent(e);
            if(coords) managerCallbacks.onCanvasMouseMove(coords);
        });
        document.addEventListener('mouseup', handleGlobalMouseUp);

        elements.canvas.addEventListener('mouseleave', () => {
            const stateStub = {
                currentTool: elements.statusTool.textContent.split(': ')[1],
                currentCharacter: elements.statusChar.textContent.split("'")[1],
                brushSize: parseInt(elements.statusBrush.textContent.replace(/\D/g, '')),
                zoomLevel: parseInt(elements.statusZoom.textContent.replace(/\D/g, ''))
            };
            updateStatusBar(stateStub);
        });

        elements.container.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                switch (e.key.toLowerCase()) {
                    case 's':
                        managerCallbacks.onSaveRequest();
                        break;
                    case 'o':
                        managerCallbacks.onExitRequest();
                        break;
                    case 'z':
                        e.shiftKey ? managerCallbacks.onRedo() : managerCallbacks.onUndo();
                        break;
                    case 'y':
                        managerCallbacks.onRedo();
                        break;
                    case '=':
                        managerCallbacks.onZoomIn();
                        break;
                    case '-':
                        managerCallbacks.onZoomOut();
                        break;
                }
            } else {
                switch (e.key.toLowerCase()) {
                    case 'p': managerCallbacks.onToolSelect('pencil'); break;
                    case 'e': managerCallbacks.onToolSelect('eraser'); break;
                    case 'l': managerCallbacks.onToolSelect('line'); break;
                    case 'r': managerCallbacks.onToolSelect('rect'); break;
                    case 'g': managerCallbacks.onToggleGrid(); break;
                    case 'escape': managerCallbacks.onExitRequest(); break;
                }
            }
        });
        elements.container.setAttribute('tabindex', '-1');
    }

    return {
        buildAndShow,
        hideAndReset,
        updateCanvas,
        updatePreviewCanvas,
        updateToolbar,
        updateStatusBar,
        toggleGrid,
        updateZoom,
        renderCanvas: renderInitialCanvas
    };
})();