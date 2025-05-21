const TILE_SIZE = 50;
const MAP_WIDTH = 270;
const MAP_HEIGHT = 150;

const mapCanvas = document.getElementById('mapCanvas');
const mapCtx = mapCanvas.getContext('2d');

const overlayCanvas = document.getElementById('overlayCanvas');
const overlayCtx = overlayCanvas.getContext('2d');

const tilesetCanvas = document.getElementById('tilesetCanvas');
const tilesetCtx = tilesetCanvas.getContext('2d');

const tilesetFileInput = document.getElementById('tilesetFileInput');
const tilemapFileInput = document.getElementById('tilemapFileInput');

let tilesetImage = null;
let selectedTileIndex = 0;
let tilesPerRow = 0;
let tileCount = 0;
let mapData = Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(0));

let isMouseDown = false;

let isCtrlCPressed = false;
let isCtrlVPressed = false;
let copiedArea = null;
let selectionStart = null;
let selectionEnd = null

let undoStack = [];
const MAX_UNDO = 50; // evita consumir muita memória

// Evento para clicar no tileset e selecionar tile
tilesetCanvas.addEventListener('click', (e) => {
	if(!isCtrlCPressed && !isCtrlVPressed) {
		const rect = tilesetCanvas.getBoundingClientRect();
		const x = Math.floor((e.clientX - rect.left) / TILE_SIZE);
		const y = Math.floor((e.clientY - rect.top) / TILE_SIZE);
		const index = y * 4 + x;

		if (index < tileCount) {
		selectedTileIndex = index;
		}

		drawTileset();

		// Define a cor da borda
		tilesetCtx.strokeStyle = "yellow";
		tilesetCtx.lineWidth = 2;
		tilesetCtx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
	}
});

mapCanvas.parentElement.addEventListener('scroll', drawMap);

// Carregar tileset
function loadTiles() {
  tilesetFileInput.click();
}

// Carregar tilemap
function loadMap() {
  tilemapFileInput.click();
}

tilesetFileInput.addEventListener('change', () => {
	const file = tilesetFileInput.files[0];
	const img = new Image();
	
	img.onload = () => {
		tilesetImage = img;
		tilesPerRow = Math.floor(img.width / TILE_SIZE);
		tileCount = tilesPerRow * Math.floor(img.height / TILE_SIZE);
	
		drawTileset();
		drawMap();
	};
	
	img.src = URL.createObjectURL(file);
});

tilemapFileInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const loadedData = JSON.parse(e.target.result);

      // Validação simples
      if (Array.isArray(loadedData) && loadedData.length === MAP_HEIGHT && loadedData[0].length === MAP_WIDTH) {
        mapData = loadedData;
        drawMap();
      } else {
        alert("Formato inválido de mapa.");
      }
    } catch (err) {
      alert("Erro ao carregar o mapa: " + err.message);
    }
  };

  reader.readAsText(file);
});

// Desenhar tileset na lateral
function drawTileset() {
	tilesetCanvas.height = Math.ceil(tileCount / 4) * TILE_SIZE;
	tilesetCtx.clearRect(0, 0, tilesetCanvas.width, tilesetCanvas.height);

	for (let i = 0; i < tileCount; i++) {
		const sx = (i % tilesPerRow) * TILE_SIZE;
		const sy = Math.floor(i / tilesPerRow) * TILE_SIZE;
		const dx = (i % 4) * TILE_SIZE;
		const dy = Math.floor(i / 4) * TILE_SIZE;
		tilesetCtx.drawImage(tilesetImage, sx, sy, TILE_SIZE, TILE_SIZE, dx, dy, TILE_SIZE, TILE_SIZE);
	}
}

// Desenhar o mapa
function drawMap() {
	const container = mapCanvas.parentElement;
	const scrollLeft = container.scrollLeft;
	const scrollTop = container.scrollTop;
	const viewWidth = container.clientWidth;
	const viewHeight = container.clientHeight;

	// Limites da área visível, convertidos para coordenadas de tile
	const startCol = Math.floor(scrollLeft / TILE_SIZE);
	const endCol = Math.min(MAP_WIDTH, Math.ceil((scrollLeft + viewWidth) / TILE_SIZE));
	const startRow = Math.floor(scrollTop / TILE_SIZE);
	const endRow = Math.min(MAP_HEIGHT, Math.ceil((scrollTop + viewHeight) / TILE_SIZE));

	// Limpa apenas a área visível
	mapCtx.clearRect(scrollLeft, scrollTop, viewWidth, viewHeight);

	// Desenha apenas os tiles visíveis
	for (let y = startRow; y < endRow; y++) {
		for (let x = startCol; x < endCol; x++) {
			const index = mapData[y][x];
			const sx = (index % tilesPerRow) * TILE_SIZE;
			const sy = Math.floor(index / tilesPerRow) * TILE_SIZE;
			const dx = x * TILE_SIZE;
			const dy = y * TILE_SIZE;

			if (tilesetImage !== null) {
				mapCtx.drawImage(tilesetImage, sx, sy, TILE_SIZE, TILE_SIZE, dx, dy, TILE_SIZE, TILE_SIZE);
			}
		}
	}
}

// Exportar mapa
function exportMap() {
	const mapJson = JSON.stringify(mapData);
	const blob = new Blob([mapJson], { type: "application/json" });
	const a = document.createElement("a");
	a.href = URL.createObjectURL(blob);
	a.download = "map.json";
	a.click();
}

// Evento para clicar na grade e colocar o tile selecionado
overlayCanvas.addEventListener('click', (e) => {
	if(!isCtrlCPressed && !isCtrlVPressed) {
		const rect = overlayCanvas.getBoundingClientRect();
		const x = Math.floor((e.clientX - rect.left) / TILE_SIZE);
		const y = Math.floor((e.clientY - rect.top) / TILE_SIZE);

		if (x < MAP_WIDTH && y < MAP_HEIGHT) {
			mapData[y][x] = selectedTileIndex;
			drawMap();
		}
	}
	
	if (isCtrlVPressed) {
		 const { x: startX, y: startY } = getMouseTile(e);

		for (let y = 0; y < copiedArea.length; y++) {
			for (let x = 0; x < copiedArea[0].length; x++) {
				const mapX = startX + x;
				const mapY = startY + y;
				if (mapX < MAP_WIDTH && mapY < MAP_HEIGHT) {
					mapData[mapY][mapX] = copiedArea[y][x];
				}
			}
		}

		drawMap();
	}
});

overlayCanvas.addEventListener('mousedown', (e) => {
	if(!isCtrlCPressed && !isCtrlVPressed) {
		isMouseDown = true;
		handlePaint(e);
	}
	
	if (isCtrlCPressed) {
		selectionStart = getMouseTile(e);
		selectionEnd = null;
		drawOverlay();
	}
});

overlayCanvas.addEventListener('mousemove', (e) => {
	if (!isCtrlCPressed && !isCtrlVPressed && !isMouseDown) {
		drawCurrentTile(e);
	}
	
	else if (!isCtrlCPressed && !isCtrlVPressed && isMouseDown) {
		handlePaint(e);
		drawCurrentTile(e);
	}
	
	else if (isCtrlCPressed) {
		selectionEnd = getMouseTile(e);
		drawOverlay();
	}
});

overlayCanvas.addEventListener('mouseup', () => {
	if(!isCtrlCPressed && !isCtrlVPressed) {
		isMouseDown = false;
	}
	
	if (isCtrlCPressed) {
		const x0 = Math.min(selectionStart.x, selectionEnd.x);
		const y0 = Math.min(selectionStart.y, selectionEnd.y);
		const x1 = Math.max(selectionStart.x, selectionEnd.x);
		const y1 = Math.max(selectionStart.y, selectionEnd.y);
		
		saveState(); // Salva o estado antes de modificar
		
		// Copiar dados da área selecionada
		copiedArea = [];
		for (let y = y0; y <= y1; y++) {
			const row = [];
			
			for (let x = x0; x <= x1; x++) {
				row.push(mapData[y][x]);
			}
			
			copiedArea.push(row);
		}

		console.log("Área copiada:", copiedArea);
		
		selectionStart = null;
		selectionEnd = null;
		drawOverlay();
	}
});

overlayCanvas.addEventListener('mouseleave', () => {
	isMouseDown = false;
});

function drawCurrentTile(e) {
	const rect = overlayCanvas.getBoundingClientRect();
	const scrollLeft = overlayCanvas.parentElement.scrollLeft;
	const scrollTop = overlayCanvas.parentElement.scrollTop;

	const mouseX = e.clientX - rect.left + scrollLeft;
	const mouseY = e.clientY - rect.top + scrollTop;

	const tileX = Math.floor(mouseX / TILE_SIZE);
	const tileY = Math.floor(mouseY / TILE_SIZE);

	overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
	overlayCtx.strokeStyle = 'red';
	overlayCtx.lineWidth = 2;
	overlayCtx.strokeRect(tileX * TILE_SIZE, tileY * TILE_SIZE, TILE_SIZE, TILE_SIZE);
}

function handlePaint(e) {
	const rect = overlayCanvas.getBoundingClientRect();
	const scrollLeft = overlayCanvas.parentElement.scrollLeft;
	const scrollTop = overlayCanvas.parentElement.scrollTop;

	const mouseX = e.clientX - rect.left + scrollLeft;
	const mouseY = e.clientY - rect.top + scrollTop;

	const tileX = Math.floor(mouseX / TILE_SIZE);
	const tileY = Math.floor(mouseY / TILE_SIZE);

	if (tileX >= 0 && tileX < MAP_WIDTH &&
	    tileY >= 0 && tileY < MAP_HEIGHT &&
	    mapData[tileY][tileX] !== selectedTileIndex) {
		saveState(); // Salva o estado antes de modificar
		mapData[tileY][tileX] = selectedTileIndex;
		drawMap();
	}
}

document.addEventListener('keydown', (e) => {
	if (!isCtrlCPressed && e.ctrlKey && e.key.toLowerCase() === 'c' ) {
		console.log("CTRL+C PRESSED");
		isCtrlCPressed = true;
	}
	
	if (!isCtrlVPressed && e.ctrlKey && e.key.toLowerCase() === 'v' ) {
		console.log("CTRL+V PRESSED");
		isCtrlVPressed = true;
	}
	
	if(e.ctrlKey && e.key.toLowerCase() === 'z') {
		undo();
	}
});

document.addEventListener('keyup', (e) => {
	
	if (isCtrlCPressed && (e.ctrlKey || e.key.toLowerCase() === 'c')) {
		console.log("CTRL+C RELEASED");
		isCtrlCPressed = false;
		
		selectionStart = null;
		selectionEnd = null;
		drawOverlay();
	}
	
	if (isCtrlVPressed && e.ctrlKey && e.key.toLowerCase() === 'v' ) {
		console.log("CTRL+V RELEASED");
		isCtrlVPressed = false;
	}
});

function getMouseTile(e) {
  const rect = overlayCanvas.getBoundingClientRect();
  const scrollLeft = overlayCanvas.parentElement.scrollLeft;
  const scrollTop = overlayCanvas.parentElement.scrollTop;

  const mouseX = e.clientX - rect.left + scrollLeft;
  const mouseY = e.clientY - rect.top + scrollTop;

  return {
    x: Math.floor(mouseX / TILE_SIZE),
    y: Math.floor(mouseY / TILE_SIZE)
  };
}

function drawOverlay(mouseTile) {
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  // Desenhar retângulo de seleção, se houver
  if (selectionStart && selectionEnd) {
    const x0 = Math.min(selectionStart.x, selectionEnd.x);
    const y0 = Math.min(selectionStart.y, selectionEnd.y);
    const x1 = Math.max(selectionStart.x, selectionEnd.x);
    const y1 = Math.max(selectionStart.y, selectionEnd.y);

    overlayCtx.strokeStyle = 'red';
    overlayCtx.lineWidth = 2;
    overlayCtx.strokeRect(
      x0 * TILE_SIZE,
      y0 * TILE_SIZE,
      (x1 - x0 + 1) * TILE_SIZE,
      (y1 - y0 + 1) * TILE_SIZE
    );
  }

  // Desenhar retângulo de destaque do mouse
  if (mouseTile) {
    overlayCtx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
    overlayCtx.strokeRect(
      mouseTile.x * TILE_SIZE,
      mouseTile.y * TILE_SIZE,
      TILE_SIZE,
      TILE_SIZE
    );
  }
}

function saveState() {
  // Salva uma cópia profunda do estado atual
  const copy = mapData.map(row => [...row]);
  undoStack.push(copy);

  if (undoStack.length > MAX_UNDO) {
    undoStack.shift(); // remove o mais antigo
  }
}

function undo() {
  if (undoStack.length > 0) {
    mapData = undoStack.pop();
    drawMap();
  } else {
    console.log("Nada para desfazer.");
  }
}