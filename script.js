// index    : index of tileset image
// type     : null, 'trap', 'treasure' or 'passage'
//            null    : just shows a tile
//            trap    : flag indicating if stepped on or identified, must present a trap sprite
//            treasure: flag indicating if identified, must must present:
//                      -nothing
//                      -a treasure sprite
//                      -a monster
//            passage : flag indicating if identified, must present a passage sprite and if stepped on,
//                      player is transported to indicated floor and tilex, tiley on pamater 'passageTo'
//                      ex.: passageTo = {floor: 0, x: 10, y: 10)
// roomId    : id of the room this tile is part of.
// passageTo : object that keep the floor index and x,y position of destination tile				   
class Tile {
	constructor(index, type=null, roomId=null, passageTo = null, enemyIndex = null) {
		this.index = index;
		this.type = type;
		this.roomId = roomId;
		this.passageTo = passageTo;
		this.enemyIndex = enemyIndex;
		
		this.searchedForTrap = false;
		this.searchedForPassage = false;
		this.enemySpawned = false;
	}
}

// Basically used to control if players already searched for treasure into a room
class Room {
	constructor(id) {
		this.id = id;
		this.searchedForTreasure = false;
	}
}

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

// Nova estrutura unificada
let tileData = Array.from({ length: MAP_HEIGHT }, () =>
  Array.from({ length: MAP_WIDTH }, () => ({
    index: 0,
    type: null,
    roomId: 0,
    passageTo: null
  }))
);

let isMouseDown = false;

let isCtrlCPressed = false;
let isCtrlVPressed = false;
let copiedArea = null;
let selectionStart = null;
let selectionEnd = null

let undoStack = [];
const MAX_UNDO = 50; // evita consumir muita memória

let selectedPassageTile = null;

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

// Carregar tilemap
function loadMap() {
  tilemapFileInput.click();
}

tilemapFileInput.addEventListener('change', (event) => {
 const file = event.target.files[0];
  if (!file) return;
  
  document.getElementById("loadedFileName").textContent = `Arquivo: ${file.name}`;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);

      if (!data.tiles || !Array.isArray(data.tiles)) {
        alert("Arquivo inválido: campo 'tiles' não encontrado.");
        return;
      }

      if (data.tiles.length !== MAP_HEIGHT || data.tiles[0].length !== MAP_WIDTH) {
        alert("Tamanho do mapa incompatível com o editor.");
        return;
      }

      // Reconstrói os dados
      tileData = [];
      for (let y = 0; y < MAP_HEIGHT; y++) {
        const row = [];
        for (let x = 0; x < MAP_WIDTH; x++) {
          const tile = data.tiles[y][x];
          row.push({
            index: tile.index,
            type: tile.type ?? null,
            roomId: tile.roomId ?? 0,
			enemyIndex: tile.enemyIndex ?? null,
            passageTo: tile.passageTo ?? null
          });
        }
        tileData.push(row);
      }

      selectedTileIndex = data.tilesetIndex ?? 0;

      drawTileset();
      drawMap();
      drawRoomOverlay();
      drawSpecialTileOverlay();

      console.log("Mapa carregado com sucesso.");
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
			const index = tileData[y][x].index;
			const sx = (index % tilesPerRow) * TILE_SIZE;
			const sy = Math.floor(index / tilesPerRow) * TILE_SIZE;
			const dx = x * TILE_SIZE;
			const dy = y * TILE_SIZE;

			if (tilesetImage !== null) {
				mapCtx.drawImage(tilesetImage, sx, sy, TILE_SIZE, TILE_SIZE, dx, dy, TILE_SIZE, TILE_SIZE);
			}
		}
	}
	
	//drawEnemyOverlay();
}

// Exportar mapa
function exportMap() {
    const filename = prompt("Salvar como:", "");
    if (!filename) return; // cancelado
  
  // Constrói a estrutura final
  const tileObjects = [];

  for (let y = 0; y < MAP_HEIGHT; y++) {
    const row = [];
    for (let x = 0; x < MAP_WIDTH; x++) {
      const t = tileData[y][x];
      row.push({
        index: t.index,
        type: t.type,
        roomId: t.roomId === 0 ? null : t.roomId,
		enemyIndex: t.enemyIndex ?? null,
        passageTo: t.type === "passage" ? t.passageTo : null
      });
    }
    tileObjects.push(row);
  }

  const project = {
    tilesetIndex: selectedTileIndex,
    tiles: tileObjects
  };

  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// Evento para clicar na grade e colocar o tile selecionado
overlayCanvas.addEventListener('click', (e) => {
	const { x, y } = getMouseTile(e);
	
	if (roomMode) {
		// setar o ID da sala
		const roomId = parseInt(roomSelect.value, 10);
		
		if (tileData[y][x].index > 0) {
		
			if(tileData[y][x].roomId == roomId) {
				tileData[y][x].roomId = 0;
			}
			else {
				tileData[y][x].roomId = roomId;
			}
			
			drawRoomOverlay();
		}
	} else if (tileMode) {
		// setar o tipo do tile
		const tileType = specialTileSelect.value;
		
		if(tileData[y][x].type == tileType) {
			tileData[y][x].type = null;
		}
		else {
			tileData[y][x].type = tileType;
		}
		
		////
		if (tileMode && tileData[y][x].type === "passage") {
			// Preencher campos se já existirem
			const existing = tileData[y][x].passageTo || { f: 0, x: 0, y: 0 };

			document.getElementById("passageFloor").value = existing.f;
			document.getElementById("passageX").value = existing.x;
			document.getElementById("passageY").value = existing.y;

			// Guardar coordenadas do tile selecionado
			selectedPassageTile = { x, y };

			document.getElementById("passagePopup").style.display = "flex";
		}
		////
		
		drawSpecialTileOverlay();
	} 
	
	else if (enemyMode) {
	  const index = parseInt(enemySelect.value);
	  
	  if(tileData[y][x].enemyIndex == index) {
		tileData[y][x].enemyIndex = null;
	  }
	  else {
		tileData[y][x].enemyIndex = index;
	  }
	  
	  drawEnemyOverlay();
	}
	
	else {
		if(!isCtrlCPressed && !isCtrlVPressed) {
			const rect = overlayCanvas.getBoundingClientRect();
			const x = Math.floor((e.clientX - rect.left) / TILE_SIZE);
			const y = Math.floor((e.clientY - rect.top) / TILE_SIZE);

			if (x < MAP_WIDTH && y < MAP_HEIGHT) {
				tileData[y][x].index = selectedTileIndex;
				drawMap();
			}
		}
		
		if (isCtrlVPressed) {
			const { x: startX, y: startY } = getMouseTile(e);
			
			saveState();
			
			for (let y = 0; y < copiedArea.length; y++) {
				for (let x = 0; x < copiedArea[0].length; x++) {
					const mapX = startX + x;
					const mapY = startY + y;
					if (mapX < MAP_WIDTH && mapY < MAP_HEIGHT) {
						tileData[mapY][mapX].index = copiedArea[y][x].index;
					}
				}
			}

			drawMap();
		}
	}
});

overlayCanvas.addEventListener('mousedown', (e) => {
	if (roomMode) {
	}
	else if (tileMode) {
	}
	else {
		if(!isCtrlCPressed && !isCtrlVPressed) {
			isMouseDown = true;
			handlePaint(e);
		}
		
		if (isCtrlCPressed) {
			selectionStart = getMouseTile(e);
			selectionEnd = null;
			drawOverlay();
		}
	}
});

overlayCanvas.addEventListener('mousemove', (e) => {
	if (roomMode) {
		drawRoomOverlay();
	} else if (tileMode) {
		drawSpecialTileOverlay();
	} 
	else if (enemyMode) {
		drawEnemyOverlay();
	}
	else {
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
				row.push({ ...tileData[y][x] });
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
	if (enemyMode) return;
	 
	const rect = overlayCanvas.getBoundingClientRect();
	const scrollLeft = overlayCanvas.parentElement.scrollLeft;
	const scrollTop = overlayCanvas.parentElement.scrollTop;

	const mouseX = e.clientX - rect.left + scrollLeft;
	const mouseY = e.clientY - rect.top + scrollTop;

	const tileX = Math.floor(mouseX / TILE_SIZE);
	const tileY = Math.floor(mouseY / TILE_SIZE);

	if (tileX >= 0 && tileX < MAP_WIDTH &&
	    tileY >= 0 && tileY < MAP_HEIGHT &&
	    tileData[tileY][tileX].index !== selectedTileIndex) {
		saveState(); // Salva o estado antes de modificar
		tileData[tileY][tileX].index = selectedTileIndex;
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
  const copy = tileData.map(row => row.map(cell => ({ ...cell })));
  undoStack.push(copy);

  if (undoStack.length > MAX_UNDO) {
    undoStack.shift(); // remove o mais antigo
  }
}

function undo() {
  if (undoStack.length > 0) {
    tileData = undoStack.pop();
    drawMap();
    drawRoomOverlay();
    drawSpecialTileOverlay();
  } else {
    console.log("Nada para desfazer.");
  }
}

//// ROOM
let roomMode = false;
const toggleRoomBtn = document.getElementById('toggleRoomMode');
const roomSelect   = document.getElementById('roomSelect');

toggleRoomBtn.addEventListener('click', (e) => {
  roomMode = !roomMode;
  toggleRoomBtn.textContent = roomMode ? 'Editar Salas (ON)' : 'Editar Salas (OFF)';
  // Limpa qualquer highlight de tile normal
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  if (!roomMode) drawCurrentTile(e); // volta ao highlight normal
  else drawRoomOverlay(); // mostra todos os IDs já atribuídos
});


function drawRoomOverlay() {
  // Limpa tudo
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  const container = overlayCanvas.parentElement;
  const scrollLeft = container.scrollLeft;
  const scrollTop  = container.scrollTop;
  const viewW = container.clientWidth;
  const viewH = container.clientHeight;

  const startCol = Math.floor(scrollLeft / TILE_SIZE);
  const endCol   = Math.min(MAP_WIDTH,  Math.ceil((scrollLeft + viewW) / TILE_SIZE));
  const startRow = Math.floor(scrollTop  / TILE_SIZE);
  const endRow   = Math.min(MAP_HEIGHT, Math.ceil((scrollTop  + viewH) / TILE_SIZE));

  overlayCtx.font = '20px sans-serif';
  overlayCtx.textAlign = 'center';
  overlayCtx.textBaseline = 'middle';

  for (let y = startRow; y < endRow; y++) {
    for (let x = startCol; x < endCol; x++) {
      const roomId = tileData[y][x].roomId;
      if (roomId > 0) {
        const dx = x * TILE_SIZE;
        const dy = y * TILE_SIZE;
        // fundo semitransparente
        overlayCtx.fillStyle = 'rgba(0, 255, 0, 0.4)';
        overlayCtx.fillRect(dx, dy, TILE_SIZE, TILE_SIZE);
        // número da sala
        overlayCtx.fillStyle = 'white';
        overlayCtx.fillText(roomId, dx + TILE_SIZE/2, dy + TILE_SIZE/2);
      }
    }
  }
}
////

//// SPECIAL TILE
let tileMode = false;
const toggleTileBtn = document.getElementById('toggleTileMode');
const specialTileSelect   = document.getElementById('specialTileSelect');
	
toggleTileBtn.addEventListener('click', (e) => {
  tileMode = !tileMode;
  toggleTileBtn.textContent = tileMode ? 'Editar Tiles (ON)' : 'Editar Tiles (OFF)';
  
  // Limpa qualquer highlight de tile normal
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  if (!tileMode) drawCurrentTile(e); // volta ao highlight normal
  else drawSpecialTileOverlay(); // mostra todos os tile especiais já atribuídos
});


function drawSpecialTileOverlay() {
  // Limpa tudo
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  const container = overlayCanvas.parentElement;
  const scrollLeft = container.scrollLeft;
  const scrollTop  = container.scrollTop;
  const viewW = container.clientWidth;
  const viewH = container.clientHeight;

  const startCol = Math.floor(scrollLeft / TILE_SIZE);
  const endCol   = Math.min(MAP_WIDTH,  Math.ceil((scrollLeft + viewW) / TILE_SIZE));
  const startRow = Math.floor(scrollTop  / TILE_SIZE);
  const endRow   = Math.min(MAP_HEIGHT, Math.ceil((scrollTop  + viewH) / TILE_SIZE));
  
  overlayCtx.font = '12px sans-serif';
  overlayCtx.textAlign = 'center';
  overlayCtx.textBaseline = 'middle';

  for (let y = startRow; y < endRow; y++) {
    for (let x = startCol; x < endCol; x++) {
      const tileType = tileData[y][x].type;
      if (tileType !== null) {
        const dx = x * TILE_SIZE;
        const dy = y * TILE_SIZE;
        // fundo semitransparente
        overlayCtx.fillStyle = 'rgba(0, 0, 255, 0.4)';
        overlayCtx.fillRect(dx, dy, TILE_SIZE, TILE_SIZE);
        // número da sala
        overlayCtx.fillStyle = 'white';
		
		if(tileType === 'trap' || tileType === 'treasure') {
			overlayCtx.fillText(tileType, dx + TILE_SIZE/2, dy + TILE_SIZE/2);
		} else {
			overlayCtx.fillText(tileType, dx + TILE_SIZE/2, (dy + TILE_SIZE/2) - 15);
			
			if (tileData[y][x].passageTo !== null) {
				overlayCtx.fillText(tileData[y][x].passageTo.f, dx + TILE_SIZE/2, dy + TILE_SIZE/2);
				overlayCtx.fillText(tileData[y][x].passageTo.x + ',' +  tileData[y][x].passageTo.y, dx + TILE_SIZE/2, (dy + TILE_SIZE/2) + 15);
			}
		}
      }
    }
  }
}
////

//// passageTo
document.getElementById("savePassageBtn").addEventListener("click", () => {
  if (!selectedPassageTile) return;

  const f = parseInt(document.getElementById("passageFloor").value);
  const x = parseInt(document.getElementById("passageX").value);
  const y = parseInt(document.getElementById("passageY").value);

  tileData[selectedPassageTile.y][selectedPassageTile.x].passageTo = { f, x, y };

  document.getElementById("passagePopup").style.display = "none";
  selectedPassageTile = null;

  drawSpecialTileOverlay();
});

document.getElementById("cancelPassageBtn").addEventListener("click", () => {
  document.getElementById("passagePopup").style.display = "none";
  selectedPassageTile = null;
});
////

////
let enemyImage = null;
let enemyNames = []; // Lista de nomes visíveis no combo
let enemyMode = false;
let selectedEnemyIndex = 0;

const enemyFileInput = document.getElementById("enemyFileInput");
const toggleEnemyBtn = document.getElementById("toggleEnemyMode");
const enemySelect = document.getElementById("enemySelect");

// Define nomes de inimigos (você pode adaptar)
enemyNames = ["Goblin", "Orc", "Rat", "Bat", "Skeleton", "Slime", "Spider"];

enemyNames.forEach((name, index) => {
  const option = document.createElement("option");
  option.value = index;
  option.textContent = name;
  enemySelect.appendChild(option);
});

function loadEnemies() {
  enemyFileInput.click();
}

enemyFileInput.addEventListener('change', () => {
  const file = enemyFileInput.files[0];
  const img = new Image();

  img.onload = () => {
    enemyImage = img;
    console.log("Imagem de inimigos carregada.");
  };

  img.src = URL.createObjectURL(file);
});

toggleEnemyBtn.addEventListener("click", () => {
  enemyMode = !enemyMode;
  toggleEnemyBtn.textContent = enemyMode ? "Adicionar Inimigo (ON)" : "Adicionar Inimigo (OFF)";
});

function drawEnemyOverlay() {
  if (!enemyImage) return;

  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  const container = overlayCanvas.parentElement;
  const scrollLeft = container.scrollLeft;
  const scrollTop = container.scrollTop;
  const viewW = container.clientWidth;
  const viewH = container.clientHeight;

  const startCol = Math.floor(scrollLeft / TILE_SIZE);
  const endCol   = Math.min(MAP_WIDTH, Math.ceil((scrollLeft + viewW) / TILE_SIZE));
  const startRow = Math.floor(scrollTop / TILE_SIZE);
  const endRow   = Math.min(MAP_HEIGHT, Math.ceil((scrollTop + viewH) / TILE_SIZE));

  const SPRITE_SIZE = 512;
  const SCALE = 0.25;
  const DRAW_SIZE = SPRITE_SIZE * SCALE; // 128
  const enemiesPerRow = Math.floor(enemyImage.width / SPRITE_SIZE);

  for (let y = startRow; y < endRow; y++) {
    for (let x = startCol; x < endCol; x++) {
      const tile = tileData[y][x];
      if (tile.enemyIndex !== null && !isNaN(tile.enemyIndex)) {
        const enemyIdx = tile.enemyIndex;

        const sx = (enemyIdx % enemiesPerRow) * SPRITE_SIZE;
        const sy = Math.floor(enemyIdx / enemiesPerRow) * SPRITE_SIZE;

        const dx = x * TILE_SIZE + (TILE_SIZE - DRAW_SIZE) / 2;
        //const dy = y * TILE_SIZE + (TILE_SIZE - DRAW_SIZE) / 2;
		const dy = y * TILE_SIZE - 94;

        overlayCtx.drawImage(
          enemyImage,
          sx, sy,
          SPRITE_SIZE, SPRITE_SIZE,
          dx, dy,
          DRAW_SIZE, DRAW_SIZE
        );
      }
    }
  }
}
////