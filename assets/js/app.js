import {
  initializeApp,
  getApps,
  getApp,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get,
  onValue,
  update,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyD_lmUwm-mI8qZvJlrN4ezKmIJg6YtPQDc",
  authDomain: "billiard-d3767.firebaseapp.com",
  projectId: "billiard-d3767",
  storageBucket: "billiard-d3767.firebasestorage.app",
  messagingSenderId: "195327033998",
  appId: "1:195327033998:web:84e2626745f6ea21183fdf",
  measurementId: "G-WCRHC6CQFS",
};

const ROOMS_PATH = "games";
const PROFILES_PATH = "profiles";
const PROFILE_STORAGE_KEY = "billiard61.profile";
const LAST_ROOM_STORAGE_KEY = "billiard61.lastRoom";
const MAX_LOG_ENTRIES = 80;
const MAX_UNDO_HISTORY = 150;
const CLIENT_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const BALL_COLORS = [
  "#f7d51d",
  "#2b5bd7",
  "#f44336",
  "#7e3dd5",
  "#ff9800",
  "#00796b",
  "#9c27b0",
  "#000000",
  "#f7d51d",
  "#2b5bd7",
  "#f44336",
  "#7e3dd5",
  "#ff9800",
  "#00796b",
  "#9c27b0",
];

const rackEl = document.getElementById("rack");
const resetGameBtn = document.getElementById("resetGame");
const playersContainer = document.getElementById("playersContainer");
const playerSelectOverlay = document.getElementById("playerSelectOverlay");
const connectPanel = document.getElementById("connectPanel");
const lobbyMessageEl = document.getElementById("lobbyMessage");
const createGameBtn = document.getElementById("createGameBtn");
const joinGameBtn = document.getElementById("joinGameBtn");
const changeNameBtn = document.getElementById("changeNameBtn");
const mainContent = document.getElementById("mainContent");
const backSelectBtn = document.getElementById("backSelect");
const leaveConfirmOverlay = document.getElementById("leaveConfirm");
const stayHereBtn = document.getElementById("stayHere");
const leaveNowBtn = document.getElementById("leaveNow");
const logListEl = document.getElementById("logList");
const undoLastBtn = document.getElementById("undoLast");
const redoLastBtn = document.getElementById("redoLast");
const statusBar = document.getElementById("statusBar");
const newGameConfirmOverlay = document.getElementById("newGameConfirm");
const cancelNewGameBtn = document.getElementById("cancelNewGame");
const confirmNewGameBtn = document.getElementById("confirmNewGame");
const createGameModal = document.getElementById("createGameModal");
const createGameNameInput = document.getElementById("createGameNameInput");
const createPlayerCountSelect = document.getElementById("createPlayerCountSelect");
const cancelCreateGameBtn = document.getElementById("cancelCreateGame");
const confirmCreateGameBtn = document.getElementById("confirmCreateGame");
const joinGameModal = document.getElementById("joinGameModal");
const joinGamesListEl = document.getElementById("joinGamesList");
const closeJoinGameBtn = document.getElementById("closeJoinGame");
const nameModal = document.getElementById("nameModal");
const nameModalInput = document.getElementById("nameModalInput");
const saveNameModalBtn = document.getElementById("saveNameModalBtn");

let roomRef = null;
let dbInstance = null;
let currentRoomCode = "";
let roomUnsubscribe = null;
let saveQueue = Promise.resolve();
let localProfile = loadLocalProfile();

let state = {
  game: createDefaultGameState(),
  selectedBalls: new Set(),
  history: [],
  redoHistory: [],
};

function createProfileId() {
  return `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 24);
}

function loadLocalProfile() {
  let parsed = null;
  try {
    parsed = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || "null");
  } catch {
    parsed = null;
  }

  const id =
    parsed && typeof parsed.id === "string" && parsed.id.trim()
      ? parsed.id.trim()
      : createProfileId();
  const name = sanitizeName(parsed?.name || "");
  return { id, name };
}

function saveLocalProfile() {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(localProfile));
}

function setLocalProfileName(name) {
  const safeName = sanitizeName(name);
  if (!safeName) return false;
  localProfile.name = safeName;
  saveLocalProfile();
  return true;
}

function ensureLocalProfileName() {
  return Boolean(localProfile.name);
}

async function syncLocalProfileToDatabase() {
  if (!dbInstance || !localProfile.id || !localProfile.name) return;

  try {
    await update(ref(dbInstance, `${PROFILES_PATH}/${localProfile.id}`), {
      name: localProfile.name,
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.error("Failed to sync local profile:", error);
  }
}

function normalizeRoomCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

function sanitizeGameName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 32);
}

function setLobbyMessage(message, isError = false) {
  if (!lobbyMessageEl) return;
  lobbyMessageEl.textContent = message || "";
  lobbyMessageEl.style.color = isError ? "#ffb3b3" : "#ffd28f";
}

function updateRoomUi() {
  if (connectPanel) {
    connectPanel.classList.remove("hidden");
  }
  if (createGameBtn) {
    createGameBtn.disabled = !ensureLocalProfileName();
  }
  if (joinGameBtn) {
    joinGameBtn.disabled = !ensureLocalProfileName();
  }
}

async function ensureDatabaseReady() {
  if (dbInstance) return dbInstance;
  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  dbInstance = getDatabase(app);
  await syncLocalProfileToDatabase();
  return dbInstance;
}

function randomRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    const idx = Math.floor(Math.random() * chars.length);
    code += chars[idx];
  }
  return code;
}

async function generateRoomCode() {
  await ensureDatabaseReady();
  for (let i = 0; i < 24; i++) {
    const candidate = randomRoomCode();
    const snapshot = await get(ref(dbInstance, `${ROOMS_PATH}/${candidate}`));
    if (!snapshot.exists()) {
      return candidate;
    }
  }
  throw new Error("Could not generate room code");
}

function createDefaultBalls() {
  const balls = [];
  for (let i = 1; i <= 15; i++) {
    balls.push({
      number: i,
      color: BALL_COLORS[i - 1],
      locationType: "rack",
      player: null,
    });
  }
  return balls;
}

function createZeroMap(count) {
  const result = {};
  for (let i = 1; i <= count; i++) {
    result[i] = 0;
  }
  return result;
}

function createPlayerNames(count) {
  const names = {};
  for (let i = 1; i <= count; i++) {
    names[i] = `Player ${i}`;
  }
  return names;
}

function createDefaultGameState() {
  return {
    roomName: "",
    playerCount: 0,
    playerNames: {},
    seatAssignments: {},
    ownerId: "",
    ownerName: "",
    currentTurn: 1,
    scores: {},
    foulOnlyCounts: {},
    balls: createDefaultBalls(),
    pottedBalls: [],
    winner: null,
    log: [],
    lastAction: null,
    updatedAt: Date.now(),
  };
}

function serializeGameState(game) {
  return {
    roomName: game.roomName || "",
    playerCount: game.playerCount,
    playerNames: { ...game.playerNames },
    seatAssignments: { ...(game.seatAssignments || {}) },
    ownerId: game.ownerId || "",
    ownerName: game.ownerName || "",
    currentTurn: game.currentTurn,
    scores: { ...game.scores },
    foulOnlyCounts: { ...game.foulOnlyCounts },
    balls: game.balls.map((ball) => ({ ...ball })),
    pottedBalls: game.pottedBalls.map((ball) => ({ ...ball })),
    winner: game.winner,
    log: game.log.map((entry) => ({ ...entry })),
    lastAction: game.lastAction ? { ...game.lastAction } : null,
    updatedAt: game.updatedAt,
  };
}

function cloneGame(game) {
  return JSON.parse(JSON.stringify(serializeGameState(game)));
}

function normalizeCount(value) {
  const count = Number(value);
  if (Number.isInteger(count) && count >= 0 && count <= 4) {
    return count;
  }
  return 0;
}

function normalizeLocationType(value) {
  return value === "clean" || value === "foul" ? value : "rack";
}

function normalizeLogEntries(log) {
  if (!Array.isArray(log)) return [];

  return log
    .map((entry, idx) => {
      if (!entry || typeof entry !== "object") return null;
      const message = String(entry.message || "").trim();
      if (!message) return null;
      return {
        id: entry.id || `log-${idx}-${Date.now()}`,
        at: entry.at || new Date().toISOString(),
        message,
      };
    })
    .filter(Boolean)
    .slice(0, MAX_LOG_ENTRIES);
}

function normalizeGameState(raw) {
  const normalized = createDefaultGameState();
  if (!raw || typeof raw !== "object") {
    return normalized;
  }

  const playerCount = normalizeCount(raw.playerCount);
  normalized.roomName = sanitizeGameName(raw.roomName || "");
  normalized.playerCount = playerCount;
  normalized.playerNames = createPlayerNames(playerCount);
  normalized.ownerId =
    typeof raw.ownerId === "string" ? raw.ownerId.trim() : "";
  normalized.ownerName = sanitizeName(raw.ownerName || "");

  if (raw.seatAssignments && typeof raw.seatAssignments === "object") {
    for (let i = 1; i <= playerCount; i++) {
      const incomingSeat =
        raw.seatAssignments[i] !== undefined
          ? raw.seatAssignments[i]
          : raw.seatAssignments[String(i)];
      if (typeof incomingSeat === "string" && incomingSeat.trim()) {
        normalized.seatAssignments[i] = incomingSeat.trim();
      }
    }
  }

  if (raw.playerNames && typeof raw.playerNames === "object") {
    for (let i = 1; i <= playerCount; i++) {
      const incoming =
        raw.playerNames[i] !== undefined
          ? raw.playerNames[i]
          : raw.playerNames[String(i)];
      if (typeof incoming === "string" && incoming.trim()) {
        normalized.playerNames[i] = sanitizeName(incoming);
      }
    }
  }

  for (let i = 1; i <= playerCount; i++) {
    if (!normalized.seatAssignments[i]) {
      normalized.playerNames[i] = `Player ${i}`;
    } else if (!normalized.playerNames[i]) {
      normalized.playerNames[i] = `Player ${i}`;
    }
  }

  const incomingBalls = Array.isArray(raw.balls)
    ? raw.balls
    : raw.balls && typeof raw.balls === "object"
      ? Object.values(raw.balls)
      : [];

  normalized.balls = createDefaultBalls().map((baseBall) => {
    const incoming = incomingBalls.find(
      (ball) => Number(ball?.number) === baseBall.number
    );
    if (!incoming || typeof incoming !== "object") {
      return baseBall;
    }

    const locationType = normalizeLocationType(incoming.locationType);
    let player = Number(incoming.player);
    if (
      !Number.isInteger(player) ||
      player < 1 ||
      player > playerCount ||
      locationType === "rack"
    ) {
      player = null;
    }

    return {
      ...baseBall,
      locationType,
      player,
    };
  });

  normalized.foulOnlyCounts = createZeroMap(playerCount);
  if (raw.foulOnlyCounts && typeof raw.foulOnlyCounts === "object") {
    for (let i = 1; i <= playerCount; i++) {
      const incoming =
        raw.foulOnlyCounts[i] !== undefined
          ? raw.foulOnlyCounts[i]
          : raw.foulOnlyCounts[String(i)];
      const fouls = Number(incoming);
      normalized.foulOnlyCounts[i] =
        Number.isFinite(fouls) && fouls > 0 ? Math.floor(fouls) : 0;
    }
  }

  const incomingTurn = Number(raw.currentTurn);
  normalized.currentTurn =
    playerCount > 0 &&
    Number.isInteger(incomingTurn) &&
    incomingTurn >= 1 &&
    incomingTurn <= playerCount
      ? incomingTurn
      : 1;

  normalized.log = normalizeLogEntries(raw.log);

  if (raw.lastAction && typeof raw.lastAction === "object") {
    normalized.lastAction = {
      type: String(raw.lastAction.type || "sync"),
      message: String(raw.lastAction.message || ""),
      by: String(raw.lastAction.by || ""),
      at: String(raw.lastAction.at || new Date().toISOString()),
    };
  }

  const updatedAt = Number(raw.updatedAt);
  normalized.updatedAt = Number.isFinite(updatedAt) ? updatedAt : Date.now();

  recalculateScoresForGame(normalized);
  updatePottedBallsForGame(normalized);
  normalized.winner = computeWinnerForGame(normalized);

  return normalized;
}

function recalculateScoresForGame(game) {
  const scores = createZeroMap(game.playerCount);

  game.balls.forEach((ball) => {
    if (!ball.player) return;
    if (ball.locationType === "clean") {
      scores[ball.player] += ball.number;
    } else if (ball.locationType === "foul") {
      scores[ball.player] -= ball.number;
    }
  });

  for (let i = 1; i <= game.playerCount; i++) {
    const foulCount = Number(game.foulOnlyCounts[i] || 0);
    scores[i] -= foulCount * 4;
  }

  game.scores = scores;
}

function updatePottedBallsForGame(game) {
  game.pottedBalls = game.balls
    .filter((ball) => ball.locationType !== "rack")
    .map((ball) => ({
      number: ball.number,
      player: ball.player,
      type: ball.locationType,
    }));
}

function computeWinnerForGame(game) {
  if (game.playerCount === 0) return null;
  const anyOnRack = game.balls.some((ball) => ball.locationType === "rack");
  if (anyOnRack) return null;

  let bestPlayer = 0;
  let bestScore = -Infinity;
  let tie = false;

  for (let i = 1; i <= game.playerCount; i++) {
    const score = Number(game.scores[i] || 0);
    if (score > bestScore) {
      bestScore = score;
      bestPlayer = i;
      tie = false;
    } else if (score === bestScore) {
      tie = true;
    }
  }

  return tie ? null : bestPlayer;
}

function isGameFinished(game) {
  return (
    game.playerCount > 0 &&
    Array.isArray(game.balls) &&
    !game.balls.some((ball) => ball.locationType === "rack")
  );
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getDisplayPlayerName(player, game = state.game) {
  const seatOwner = game.seatAssignments?.[player];
  if (!seatOwner) return `Player ${player}`;
  const storedName = sanitizeName(game.playerNames?.[player] || "");
  return storedName || `Player ${player}`;
}

function getCurrentUserSeat() {
  for (let i = 1; i <= state.game.playerCount; i++) {
    if (state.game.seatAssignments?.[i] === localProfile.id) {
      return i;
    }
  }
  return null;
}

function canCurrentUserStartNewGame() {
  if (state.game.playerCount === 0 || !currentRoomCode) return false;
  return Boolean(state.game.ownerId && state.game.ownerId === localProfile.id);
}

function updateNewGameButtonState() {
  if (!resetGameBtn) return;
  const isOwner = canCurrentUserStartNewGame();
  resetGameBtn.disabled = state.game.playerCount === 0 || !isOwner;
  resetGameBtn.title = isOwner
    ? "Start a new game"
    : "Only the game creator can start a new game";
}

function getPlayerLabel(player) {
  const name = getDisplayPlayerName(player);
  return `P${player} ${name}`;
}

function ensureCurrentTurnIsValid() {
  if (state.game.playerCount === 0) {
    state.game.currentTurn = 1;
    return;
  }

  if (
    !Number.isInteger(state.game.currentTurn) ||
    state.game.currentTurn < 1 ||
    state.game.currentTurn > state.game.playerCount
  ) {
    state.game.currentTurn = 1;
  }
}

function advanceTurnFromPlayer(player) {
  if (state.game.playerCount === 0) return;
  const source =
    Number.isInteger(player) && player >= 1 && player <= state.game.playerCount
      ? player
      : state.game.currentTurn;
  state.game.currentTurn = (source % state.game.playerCount) + 1;
}

function createLogEntry(message) {
  return {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    message,
  };
}

function addLogEntry(message) {
  if (!message) return;
  state.game.log.unshift(createLogEntry(message));
  if (state.game.log.length > MAX_LOG_ENTRIES) {
    state.game.log = state.game.log.slice(0, MAX_LOG_ENTRIES);
  }
}

function buildLastAction(type, message) {
  return {
    type,
    message: message || "",
    by: CLIENT_ID,
    at: new Date().toISOString(),
  };
}

function snapshotForUndo() {
  return cloneGame(state.game);
}

function saveUndoPoint() {
  state.history.push(snapshotForUndo());
  if (state.history.length > MAX_UNDO_HISTORY) {
    state.history.shift();
  }
  state.redoHistory = [];
  updateUndoRedoButtonState();
}

function clearUndoHistory() {
  state.history = [];
  state.redoHistory = [];
  updateUndoRedoButtonState();
}

function updateUndoRedoButtonState() {
  if (undoLastBtn) {
    undoLastBtn.disabled = state.history.length === 0;
  }
  if (redoLastBtn) {
    redoLastBtn.disabled = state.redoHistory.length === 0;
  }
}

function undoLastAction() {
  const snapshot = state.history.pop();
  if (!snapshot) {
    updateUndoRedoButtonState();
    return;
  }

  state.redoHistory.push(snapshotForUndo());
  if (state.redoHistory.length > MAX_UNDO_HISTORY) {
    state.redoHistory.shift();
  }

  state.game = normalizeGameState(snapshot);
  addLogEntry("Undo last action");
  clearSelectedBalls();
  renderAll();
  persistGameState("undo", "Undo last action");
  updateUndoRedoButtonState();
}

function redoLastAction() {
  const snapshot = state.redoHistory.pop();
  if (!snapshot) {
    updateUndoRedoButtonState();
    return;
  }

  state.history.push(snapshotForUndo());
  if (state.history.length > MAX_UNDO_HISTORY) {
    state.history.shift();
  }

  state.game = normalizeGameState(snapshot);
  addLogEntry("Redo last action");
  clearSelectedBalls();
  renderAll();
  persistGameState("redo", "Redo last action");
  updateUndoRedoButtonState();
}

function formatLogTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "[--:--]";

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours %= 12;
  if (hours === 0) hours = 12;

  return `[${hours}:${minutes} ${ampm}]`;
}

function renderLog() {
  if (!logListEl) return;
  logListEl.innerHTML = "";

  state.game.log.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "log-entry";

    const timeSpan = document.createElement("span");
    timeSpan.className = "log-entry-time";
    timeSpan.textContent = formatLogTime(entry.at);

    const textSpan = document.createElement("span");
    textSpan.textContent = ` ${entry.message}`;

    row.appendChild(timeSpan);
    row.appendChild(textSpan);
    logListEl.appendChild(row);
  });
}

function createBallElement(ball) {
  const div = document.createElement("div");
  div.className = "ball available in-rack";
  div.textContent = ball.number;
  div.dataset.number = String(ball.number);
  div.style.backgroundColor = ball.color;
  div.draggable = true;
  div.addEventListener("dragstart", onBallDragStart);
  div.addEventListener("click", onBallClick);
  return div;
}

function buildPlayersUI() {
  playersContainer.innerHTML = "";

  for (let i = 1; i <= state.game.playerCount; i++) {
    const displayName = getDisplayPlayerName(i);
    const seatOwner = state.game.seatAssignments?.[i] || "";
    const isMySeat = seatOwner === localProfile.id;
    const seatLabel = isMySeat ? "Seated" : seatOwner ? "Take Seat" : "Sit Here";
    const player = document.createElement("div");
    player.className = "player";
    player.dataset.player = String(i);

    player.innerHTML = `
      <div class="player-header">
        <span class="player-name">${escapeHtml(displayName)}</span>
        <div class="player-header-right">
          <button class="seat-btn${isMySeat ? " current" : ""}" data-player="${i}">
            ${seatLabel}
          </button>
          <span class="score" id="scoreP${i}">0</span>
        </div>
      </div>
      <div class="player-areas">
        <div class="drop-zone clean" data-player="${i}" data-type="clean">
          <div class="drop-title">Clean shots</div>
          <div class="player-balls" id="ballsP${i}Clean"></div>
        </div>
        <div class="drop-zone foul" data-player="${i}" data-type="foul">
          <div class="drop-title">Foul shots</div>
          <div class="player-balls" id="ballsP${i}Foul"></div>
        </div>
      </div>
      <button class="foul-only-btn" data-player="${i}">Foul (no ball) -4</button>
    `;

    playersContainer.appendChild(player);
  }

  attachPlayerHandlers();
}

function renderScores() {
  for (let i = 1; i <= state.game.playerCount; i++) {
    const el = document.getElementById(`scoreP${i}`);
    if (el) {
      el.textContent = String(state.game.scores[i] ?? 0);
    }
  }
}

function renderPositions() {
  rackEl.innerHTML = "";

  for (let i = 1; i <= state.game.playerCount; i++) {
    const clean = document.getElementById(`ballsP${i}Clean`);
    const foul = document.getElementById(`ballsP${i}Foul`);
    if (clean) clean.innerHTML = "";
    if (foul) foul.innerHTML = "";
  }

  state.game.balls.forEach((ball) => {
    const el = createBallElement(ball);
    if (state.selectedBalls.has(ball.number)) {
      el.classList.add("selected");
    }

    if (ball.locationType === "rack") {
      el.classList.add("in-rack");
      rackEl.appendChild(el);
      return;
    }

    const containerId = `ballsP${ball.player}${
      ball.locationType === "foul" ? "Foul" : "Clean"
    }`;
    const container = document.getElementById(containerId);
    if (container) {
      if (ball.locationType === "foul") {
        el.style.opacity = "0.6";
      }
      container.appendChild(el);
    }
  });
}

function renderStatus() {
  if (!statusBar) return;

  if (state.game.playerCount === 0) {
    statusBar.textContent = "";
    return;
  }

  if (state.game.winner) {
    const winnerName = getDisplayPlayerName(state.game.winner);
    const winnerScore = state.game.scores[state.game.winner] ?? 0;
    statusBar.textContent = `Winner: ${winnerName} (${winnerScore})`;
    return;
  }

  const turnName = getDisplayPlayerName(state.game.currentTurn);
  statusBar.textContent = `Current turn: ${turnName}`;
}

function renderLayoutVisibility() {
  const hasActiveGame = state.game.playerCount > 0 && Boolean(currentRoomCode);

  if (hasActiveGame) {
    playerSelectOverlay.classList.add("hidden");
    mainContent.classList.remove("hidden");
    return;
  }

  mainContent.classList.add("hidden");
  playerSelectOverlay.classList.remove("hidden");
  updateRoomUi();
}

function renderAll() {
  ensureCurrentTurnIsValid();
  updateRoomUi();
  renderLayoutVisibility();

  if (state.game.playerCount > 0) {
    buildPlayersUI();
    renderPositions();
    renderScores();
  } else {
    playersContainer.innerHTML = "";
    rackEl.innerHTML = "";
  }

  renderLog();
  renderStatus();
  updateUndoRedoButtonState();
  updateNewGameButtonState();
}

function refreshSelectionVisuals() {
  document
    .querySelectorAll(".ball.selected")
    .forEach((ball) => ball.classList.remove("selected"));

  state.selectedBalls.forEach((number) => {
    const el = document.querySelector(`.ball[data-number="${number}"]`);
    if (el) el.classList.add("selected");
  });

  const zones = document.querySelectorAll(".drop-zone");
  if (state.selectedBalls.size > 0) {
    zones.forEach((zone) => zone.classList.add("select-target"));
  } else {
    zones.forEach((zone) => zone.classList.remove("select-target"));
  }
}

function clearSelectedBalls() {
  state.selectedBalls.clear();
  refreshSelectionVisuals();
}

function onBallClick(event) {
  if (state.game.winner) return;
  const number = Number(event.currentTarget.dataset.number);
  if (!number) return;

  if (state.selectedBalls.has(number)) {
    state.selectedBalls.delete(number);
  } else {
    state.selectedBalls.add(number);
  }
  refreshSelectionVisuals();
}

function onBallDragStart(event) {
  if (state.game.winner) {
    event.preventDefault();
    return;
  }

  const number = Number(event.currentTarget.dataset.number);
  const ball = state.game.balls.find((item) => item.number === number);
  if (!ball) return;

  event.dataTransfer.setData("text/plain", String(number));
  state.selectedBalls = new Set([number]);
  refreshSelectionVisuals();
}

function getDropBallNumber(event) {
  if (state.selectedBalls.size === 1) {
    return Array.from(state.selectedBalls)[0];
  }

  const numberStr = event.dataTransfer?.getData("text/plain");
  const number = Number(numberStr);
  return number || null;
}

function rackCompletionMessage(previousHadRack) {
  const anyOnRackNow = state.game.balls.some((ball) => ball.locationType === "rack");
  if (anyOnRackNow) {
    state.game.winner = null;
    return null;
  }

  let bestPlayer = 0;
  let bestScore = -Infinity;
  let tie = false;

  for (let i = 1; i <= state.game.playerCount; i++) {
    const score = state.game.scores[i] ?? 0;
    if (score > bestScore) {
      bestScore = score;
      bestPlayer = i;
      tie = false;
    } else if (score === bestScore) {
      tie = true;
    }
  }

  if (tie) {
    state.game.winner = null;
    return previousHadRack ? `Game finished: tie at ${bestScore}` : null;
  }

  state.game.winner = bestPlayer;
  return previousHadRack
    ? `Game finished: ${getDisplayPlayerName(bestPlayer)} wins (${bestScore})`
    : null;
}

function persistGameState(actionType, actionMessage) {
  if (!roomRef) return;

  recalculateScoresForGame(state.game);
  updatePottedBallsForGame(state.game);
  ensureCurrentTurnIsValid();

  state.game.lastAction = buildLastAction(actionType, actionMessage);
  state.game.updatedAt = Date.now();

  const payload = serializeGameState(state.game);
  saveQueue = saveQueue
    .then(() => update(roomRef, payload))
    .catch((error) => {
      console.error("Failed to sync game state:", error);
    });
}

function applyShots(ballNumbers, player, isFoul) {
  if (state.game.playerCount === 0 || state.game.winner) return false;

  const targetType = isFoul ? "foul" : "clean";
  const numbersToApply = ballNumbers.filter((num) => {
    const ball = state.game.balls.find((item) => item.number === num);
    if (!ball) return false;
    return !(ball.player === player && ball.locationType === targetType);
  });

  if (numbersToApply.length === 0) return false;

  saveUndoPoint();

  const previousHadRack = state.game.balls.some((ball) => ball.locationType === "rack");

  numbersToApply.forEach((number) => {
    const ball = state.game.balls.find((item) => item.number === number);
    if (!ball) return;
    ball.player = player;
    ball.locationType = targetType;
  });

  recalculateScoresForGame(state.game);
  updatePottedBallsForGame(state.game);
  advanceTurnFromPlayer(player);

  if (numbersToApply.length === 1) {
    const number = numbersToApply[0];
    if (isFoul) {
      addLogEntry(`${getPlayerLabel(player)} foul with ball ${number} (-${number})`);
    } else {
      addLogEntry(`${getPlayerLabel(player)} potted ball ${number} (+${number})`);
    }
  } else {
    const joined = numbersToApply.join(", ");
    if (isFoul) {
      addLogEntry(`${getPlayerLabel(player)} foul with balls ${joined}`);
    } else {
      addLogEntry(`${getPlayerLabel(player)} potted balls ${joined}`);
    }
  }

  const completionMessage = rackCompletionMessage(previousHadRack);
  if (completionMessage) {
    addLogEntry(completionMessage);
  }

  clearSelectedBalls();
  renderAll();
  persistGameState(isFoul ? "foul_shot" : "clean_shot", "Ball assignment updated");
  return true;
}

function moveBallsToRack(ballNumbers) {
  if (state.game.playerCount === 0) return false;

  const ballsToMove = ballNumbers
    .map((number) => state.game.balls.find((ball) => ball.number === number))
    .filter((ball) => ball && ball.locationType !== "rack");

  if (ballsToMove.length === 0) return false;

  saveUndoPoint();
  ballsToMove.forEach((ball) => {
    ball.locationType = "rack";
    ball.player = null;
  });

  state.game.winner = null;
  recalculateScoresForGame(state.game);
  updatePottedBallsForGame(state.game);

  addLogEntry(
    ballsToMove.length > 1
      ? `${ballsToMove.length} balls returned to rack`
      : `Ball ${ballsToMove[0].number} returned to rack`
  );

  clearSelectedBalls();
  renderAll();
  persistGameState("return_to_rack", "Ball returned to rack");
  return true;
}

function applyFoulOnly(player) {
  if (state.game.playerCount === 0 || state.game.winner) return;

  saveUndoPoint();
  state.game.foulOnlyCounts[player] = (state.game.foulOnlyCounts[player] || 0) + 1;

  recalculateScoresForGame(state.game);
  updatePottedBallsForGame(state.game);
  advanceTurnFromPlayer(player);

  addLogEntry(`${getPlayerLabel(player)} foul (no ball) -4`);

  const completionMessage = rackCompletionMessage(false);
  if (completionMessage) {
    addLogEntry(completionMessage);
  }

  renderAll();
  persistGameState("foul_only", "Foul without ball");
}

function seatCurrentUser(player) {
  const playerIndex = Number(player);
  if (
    !Number.isInteger(playerIndex) ||
    playerIndex < 1 ||
    playerIndex > state.game.playerCount
  ) {
    return;
  }

  const previousSeat = getCurrentUserSeat();
  if (previousSeat === playerIndex) return;

  const replacedUser = state.game.seatAssignments[playerIndex] || "";
  for (let i = 1; i <= state.game.playerCount; i++) {
    if (state.game.seatAssignments[i] === localProfile.id) {
      delete state.game.seatAssignments[i];
      state.game.playerNames[i] = `Player ${i}`;
    }
  }

  state.game.seatAssignments[playerIndex] = localProfile.id;
  state.game.playerNames[playerIndex] = localProfile.name;

  for (let i = 1; i <= state.game.playerCount; i++) {
    if (!state.game.seatAssignments[i]) {
      state.game.playerNames[i] = `Player ${i}`;
    }
  }

  if (previousSeat) {
    addLogEntry(
      `${localProfile.name} moved from Player ${previousSeat} to Player ${playerIndex}`
    );
  } else if (replacedUser && replacedUser !== localProfile.id) {
    addLogEntry(`${localProfile.name} took Player ${playerIndex}`);
  } else {
    addLogEntry(`${localProfile.name} sat on Player ${playerIndex}`);
  }

  renderAll();
  persistGameState("seat_player", `${localProfile.name} seated on Player ${playerIndex}`);
}

function syncMySeatNameIfNeeded() {
  const mySeat = getCurrentUserSeat();
  if (!mySeat) return;
  if (state.game.playerNames[mySeat] === localProfile.name) return;

  state.game.playerNames[mySeat] = localProfile.name;
  renderAll();
  persistGameState("sync_name", "Seat name synced");
}

function performNewGameReset() {
  if (state.game.playerCount === 0) return;

  const roomName = state.game.roomName || "";
  const playerCount = state.game.playerCount;
  const playerNames = { ...state.game.playerNames };
  const seatAssignments = { ...(state.game.seatAssignments || {}) };
  const ownerId = state.game.ownerId || localProfile.id;
  const ownerName = state.game.ownerName || localProfile.name;

  state.game = createDefaultGameState();
  state.game.roomName = roomName;
  state.game.playerCount = playerCount;
  state.game.playerNames = playerNames;
  state.game.seatAssignments = seatAssignments;
  state.game.ownerId = ownerId;
  state.game.ownerName = ownerName;
  state.game.currentTurn = 1;
  state.game.scores = createZeroMap(playerCount);
  state.game.foulOnlyCounts = createZeroMap(playerCount);
  state.game.balls = createDefaultBalls();
  state.game.log = [];

  for (let i = 1; i <= playerCount; i++) {
    if (!state.game.seatAssignments[i]) {
      state.game.playerNames[i] = `Player ${i}`;
    }
  }

  updatePottedBallsForGame(state.game);

  clearUndoHistory();
  clearSelectedBalls();
  renderAll();
  persistGameState("new_game", "Game reset for a new round");
}

function openNewGameConfirm() {
  if (!newGameConfirmOverlay) return;
  newGameConfirmOverlay.classList.remove("hidden");
}

function closeNewGameConfirm() {
  if (!newGameConfirmOverlay) return;
  newGameConfirmOverlay.classList.add("hidden");
}

function openCreateGameModal() {
  if (!ensureLocalProfileName()) {
    openNameModal();
    return;
  }
  if (!createGameModal) return;
  if (createGameNameInput) {
    createGameNameInput.value = "";
  }
  if (createPlayerCountSelect) {
    createPlayerCountSelect.value = "2";
  }
  createGameModal.classList.remove("hidden");
}

function closeCreateGameModal() {
  if (!createGameModal) return;
  createGameModal.classList.add("hidden");
}

function closeJoinGameModal() {
  if (!joinGameModal) return;
  joinGameModal.classList.add("hidden");
}

function openNameModal() {
  if (!nameModal) return;
  if (nameModalInput) {
    nameModalInput.value = localProfile.name || "";
    setTimeout(() => nameModalInput.focus(), 0);
  }
  nameModal.classList.remove("hidden");
}

function closeNameModal() {
  if (!nameModal) return;
  nameModal.classList.add("hidden");
}

async function saveNameFromModal() {
  const name = sanitizeName(nameModalInput?.value || "");
  if (!name) {
    setLobbyMessage("Enter your name first.", true);
    return false;
  }

  setLocalProfileName(name);
  try {
    await ensureDatabaseReady();
    await syncLocalProfileToDatabase();
  } catch (error) {
    console.error("Failed to sync name to database:", error);
  }
  closeNameModal();

  if (currentRoomCode) {
    syncMySeatNameIfNeeded();
  }
  setLobbyMessage("Username saved.");
  return true;
}

function renderJoinGamesList(games) {
  if (!joinGamesListEl) return;
  joinGamesListEl.innerHTML = "";

  if (games.length === 0) {
    const empty = document.createElement("div");
    empty.className = "modal-subtitle";
    empty.textContent = "No active games found.";
    joinGamesListEl.appendChild(empty);
    return;
  }

  games.forEach((game) => {
    const button = document.createElement("button");
    button.className = "join-game-item";
    button.dataset.code = game.code;
    button.innerHTML = `
      <div class="join-game-item-name">${escapeHtml(game.name)}</div>
      <div class="join-game-item-meta">${game.playerCount} players • code ${game.code}</div>
    `;
    joinGamesListEl.appendChild(button);
  });
}

async function openJoinGameModal() {
  if (!ensureLocalProfileName()) {
    openNameModal();
    return;
  }
  if (!joinGameModal) return;
  await ensureDatabaseReady();

  const snapshot = await get(ref(dbInstance, ROOMS_PATH));
  const rawGames = snapshot.exists() ? snapshot.val() : {};
  const games = Object.entries(rawGames || {})
    .map(([code, value]) => {
      const game = normalizeGameState(value);
      const seatIds = Object.values(game.seatAssignments || {}).filter(Boolean);
      const activeSeats = seatIds.length;
      const activeOthers = seatIds.filter((id) => id !== localProfile.id).length;
      return {
        code,
        name: sanitizeGameName(game.roomName || ""),
        playerCount: Number(game.playerCount || 0),
        ownerId: String(game.ownerId || ""),
        activeSeats,
        activeOthers,
        updatedAt: Number(game.updatedAt || 0),
      };
    })
    .filter(
      (game) =>
        game.name &&
        game.playerCount > 0 &&
        (
          game.ownerId !== localProfile.id ||
          game.activeOthers > 0
        )
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 50);

  renderJoinGamesList(games);
  joinGameModal.classList.remove("hidden");
}

function startNewGame() {
  if (state.game.playerCount === 0) return;
  if (!canCurrentUserStartNewGame()) {
    addLogEntry("Only the game creator can start a new game.");
    renderAll();
    return;
  }
  openNewGameConfirm();
}

function buildCreatedGameState(gameName, playerCount) {
  const created = createDefaultGameState();
  created.roomName = gameName;
  created.playerCount = playerCount;
  created.playerNames = createPlayerNames(playerCount);
  created.seatAssignments = {};
  created.ownerId = localProfile.id;
  created.ownerName = localProfile.name;
  created.currentTurn = 1;
  created.scores = createZeroMap(playerCount);
  created.foulOnlyCounts = createZeroMap(playerCount);
  created.balls = createDefaultBalls();
  recalculateScoresForGame(created);
  updatePottedBallsForGame(created);
  created.log = [
    createLogEntry(`Game created by ${localProfile.name}`),
    createLogEntry(`Players set: ${playerCount}`),
  ];
  created.lastAction = buildLastAction("create_game", `Game ${gameName} created`);
  created.updatedAt = Date.now();
  return created;
}

function buildRoomUpdateForLeavingUser() {
  if (!roomRef || state.game.playerCount <= 0) return null;

  const roomGame = normalizeGameState(state.game);
  let changed = false;

  for (let i = 1; i <= roomGame.playerCount; i++) {
    if (roomGame.seatAssignments[i] === localProfile.id) {
      delete roomGame.seatAssignments[i];
      roomGame.playerNames[i] = `Player ${i}`;
      changed = true;
    }
  }

  if (roomGame.ownerId === localProfile.id) {
    let replacementSeat = null;
    for (let i = 1; i <= roomGame.playerCount; i++) {
      if (roomGame.seatAssignments[i]) {
        replacementSeat = i;
        break;
      }
    }

    if (replacementSeat) {
      roomGame.ownerId = roomGame.seatAssignments[replacementSeat];
      roomGame.ownerName =
        sanitizeName(roomGame.playerNames[replacementSeat]) ||
        `Player ${replacementSeat}`;
      roomGame.log.unshift(
        createLogEntry(`Leader changed to ${roomGame.ownerName}`)
      );
    } else {
      roomGame.ownerId = "";
      roomGame.ownerName = "";
      roomGame.log.unshift(createLogEntry("Leader left the room"));
    }
    changed = true;
  }

  if (!changed) return null;

  roomGame.log.unshift(createLogEntry(`${localProfile.name} left the room`));
  if (roomGame.log.length > MAX_LOG_ENTRIES) {
    roomGame.log = roomGame.log.slice(0, MAX_LOG_ENTRIES);
  }

  roomGame.lastAction = buildLastAction("leave_room", `${localProfile.name} left`);
  roomGame.updatedAt = Date.now();

  return serializeGameState(roomGame);
}

function syncLeaveToRoom() {
  if (!roomRef) return;

  const payload = buildRoomUpdateForLeavingUser();
  if (!payload) return;

  saveQueue = saveQueue
    .then(() => update(roomRef, payload))
    .catch((error) => {
      console.error("Failed to sync leave state:", error);
    });
}

function detachRoomListener() {
  if (typeof roomUnsubscribe === "function") {
    roomUnsubscribe();
    roomUnsubscribe = null;
  }
}

function leaveCurrentRoom() {
  syncLeaveToRoom();
  detachRoomListener();
  roomRef = null;
  currentRoomCode = "";
  localStorage.removeItem(LAST_ROOM_STORAGE_KEY);

  state.game = createDefaultGameState();
  clearUndoHistory();
  clearSelectedBalls();
  setLobbyMessage("");
  updateRoomUi();
  renderAll();
}

function resetToPlayerSelection() {
  leaveCurrentRoom();
  if (leaveConfirmOverlay) {
    leaveConfirmOverlay.classList.add("hidden");
  }
}

function attachPlayerHandlers() {
  const foulOnlyButtons = document.querySelectorAll(".foul-only-btn");
  const dropZones = document.querySelectorAll(".drop-zone");
  const seatButtons = document.querySelectorAll(".seat-btn");

  foulOnlyButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const player = Number(button.dataset.player);
      if (!player) return;
      applyFoulOnly(player);
    });
  });

  dropZones.forEach((zone) => {
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      if (state.game.winner) return;
      zone.classList.add("drag-over");
    });

    zone.addEventListener("dragleave", () => {
      zone.classList.remove("drag-over");
    });

    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.classList.remove("drag-over");
      if (state.game.winner) return;

      const ballNumber = getDropBallNumber(event);
      if (!ballNumber) return;

      const player = Number(zone.dataset.player);
      const type = zone.dataset.type;
      const isFoul = type === "foul";
      applyShots([ballNumber], player, isFoul);
    });

    zone.addEventListener("click", () => {
      if (state.game.winner) return;
      if (state.selectedBalls.size === 0) return;

      const player = Number(zone.dataset.player);
      const type = zone.dataset.type;
      const isFoul = type === "foul";
      const numbers = Array.from(state.selectedBalls);
      applyShots(numbers, player, isFoul);
    });
  });

  seatButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const player = Number(button.dataset.player);
      if (!player) return;
      seatCurrentUser(player);
    });
  });
}

function claimLeadershipIfNeeded() {
  if (!roomRef) return;
  if (state.game.playerCount <= 0) return;
  if (state.game.ownerId) return;

  const mySeat = getCurrentUserSeat();
  if (!mySeat) return;

  state.game.ownerId = localProfile.id;
  state.game.ownerName = localProfile.name;
  addLogEntry(`${localProfile.name} became leader`);
  renderAll();
  persistGameState("claim_owner", "Leader claimed");
}

function applyRemoteState(game, isInitialRead = false) {
  const previousActionBy = game.lastAction?.by || "";
  const isOtherClient = previousActionBy && previousActionBy !== CLIENT_ID;

  state.game = normalizeGameState(game);
  clearSelectedBalls();

  if (isOtherClient && !isInitialRead) {
    clearUndoHistory();
  }

  renderAll();
  syncMySeatNameIfNeeded();
  claimLeadershipIfNeeded();
}

async function connectToRoom(roomCode, { createIfMissing = false } = {}) {
  if (!ensureLocalProfileName()) {
    setLobbyMessage("Enter your name first.", true);
    return false;
  }

  await ensureDatabaseReady();
  const normalizedCode = normalizeRoomCode(roomCode);
  if (normalizedCode.length !== 6) {
    setLobbyMessage("Game code must be 6 letters/numbers.", true);
    return false;
  }

  detachRoomListener();
  roomRef = ref(dbInstance, `${ROOMS_PATH}/${normalizedCode}`);
  currentRoomCode = normalizedCode;
  localStorage.setItem(LAST_ROOM_STORAGE_KEY, currentRoomCode);

  const snapshot = await get(roomRef);
  if (!snapshot.exists()) {
    if (!createIfMissing) {
      setLobbyMessage("Game not found. Check the code.", true);
      roomRef = null;
      currentRoomCode = "";
      return false;
    }

    const defaultState = createDefaultGameState();
    defaultState.lastAction = buildLastAction("init_room", "Room created");
    defaultState.updatedAt = Date.now();
    await set(roomRef, serializeGameState(defaultState));
    applyRemoteState(defaultState, true);
  } else {
    let loadedState = normalizeGameState(snapshot.val());
    let shouldWriteBack = false;

    if (isGameFinished(loadedState)) {
      loadedState = createDefaultGameState();
      loadedState.lastAction = buildLastAction(
        "clear_finished_game",
        "Finished game cleared from storage"
      );
      loadedState.updatedAt = Date.now();
      shouldWriteBack = true;
    } else if (loadedState.playerCount > 0 && !loadedState.ownerId) {
      loadedState.ownerId = localProfile.id;
      loadedState.ownerName = localProfile.name;
      loadedState.lastAction = buildLastAction("set_owner", "Owner assigned");
      loadedState.updatedAt = Date.now();
      shouldWriteBack = true;
    }

    if (shouldWriteBack) {
      await set(roomRef, serializeGameState(loadedState));
    }
    applyRemoteState(loadedState, true);
  }

  const joinedName = sanitizeGameName(state.game.roomName || "");
  setLobbyMessage(
    joinedName ? `Joined "${joinedName}"` : `Connected to room ${currentRoomCode}`
  );
  updateRoomUi();

  roomUnsubscribe = onValue(roomRef, (roomSnapshot) => {
    if (!roomSnapshot.exists()) return;
    applyRemoteState(roomSnapshot.val(), false);
  });

  return true;
}

async function createRoomAndConnect(gameName, playerCount) {
  if (!ensureLocalProfileName()) {
    setLobbyMessage("Enter your name first.", true);
    return;
  }

  try {
    const roomCode = await generateRoomCode();
    const initialGame = buildCreatedGameState(gameName, playerCount);
    await set(ref(dbInstance, `${ROOMS_PATH}/${roomCode}`), serializeGameState(initialGame));
    await connectToRoom(roomCode, { createIfMissing: false });
    setLobbyMessage(`Game "${gameName}" created.`);
  } catch (error) {
    console.error("Failed to create room:", error);
    roomRef = null;
    currentRoomCode = "";
    updateRoomUi();
    setLobbyMessage("Could not create game. Try again.", true);
  }
}

async function joinRoomByCode(code) {
  try {
    await connectToRoom(code, { createIfMissing: false });
    closeJoinGameModal();
  } catch (error) {
    console.error("Failed to join room:", error);
    roomRef = null;
    currentRoomCode = "";
    updateRoomUi();
    setLobbyMessage("Could not join game. Try again.", true);
  }
}

function attachStaticEventHandlers() {
  if (createGameBtn) {
    createGameBtn.addEventListener("click", openCreateGameModal);
  }

  if (joinGameBtn) {
    joinGameBtn.addEventListener("click", openJoinGameModal);
  }

  if (changeNameBtn) {
    changeNameBtn.addEventListener("click", openNameModal);
  }

  if (cancelCreateGameBtn) {
    cancelCreateGameBtn.addEventListener("click", closeCreateGameModal);
  }

  if (confirmCreateGameBtn) {
    confirmCreateGameBtn.addEventListener("click", async () => {
      const gameName = sanitizeGameName(createGameNameInput?.value || "");
      const playerCount = normalizeCount(createPlayerCountSelect?.value || 0);

      if (!gameName) {
        setLobbyMessage("Enter a game name.", true);
        return;
      }
      if (playerCount <= 0) {
        setLobbyMessage("Choose a valid player count.", true);
        return;
      }

      closeCreateGameModal();
      await createRoomAndConnect(gameName, playerCount);
    });
  }

  if (saveNameModalBtn) {
    saveNameModalBtn.addEventListener("click", async () => {
      const saved = await saveNameFromModal();
      if (saved) {
        updateRoomUi();
      }
    });
  }

  if (nameModalInput) {
    nameModalInput.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const saved = await saveNameFromModal();
      if (saved) {
        updateRoomUi();
      }
    });
  }

  if (closeJoinGameBtn) {
    closeJoinGameBtn.addEventListener("click", closeJoinGameModal);
  }

  if (joinGamesListEl) {
    joinGamesListEl.addEventListener("click", (event) => {
      const button = event.target.closest(".join-game-item");
      if (!button) return;
      const roomCode = normalizeRoomCode(button.dataset.code || "");
      if (!roomCode) {
        return;
      }
      joinRoomByCode(roomCode);
    });
  }

  if (undoLastBtn) {
    undoLastBtn.addEventListener("click", undoLastAction);
    updateUndoRedoButtonState();
  }

  if (redoLastBtn) {
    redoLastBtn.addEventListener("click", redoLastAction);
    updateUndoRedoButtonState();
  }

  if (resetGameBtn) {
    resetGameBtn.addEventListener("click", startNewGame);
  }

  if (cancelNewGameBtn) {
    cancelNewGameBtn.addEventListener("click", closeNewGameConfirm);
  }

  if (confirmNewGameBtn) {
    confirmNewGameBtn.addEventListener("click", () => {
      closeNewGameConfirm();
      performNewGameReset();
    });
  }

  if (backSelectBtn) {
    backSelectBtn.addEventListener("click", () => {
      if (leaveConfirmOverlay) {
        leaveConfirmOverlay.classList.remove("hidden");
      }
    });
  }

  if (stayHereBtn && leaveConfirmOverlay) {
    stayHereBtn.addEventListener("click", () => {
      leaveConfirmOverlay.classList.add("hidden");
    });
  }

  if (leaveNowBtn) {
    leaveNowBtn.addEventListener("click", () => {
      resetToPlayerSelection();
    });
  }

  mainContent.addEventListener("click", (event) => {
    if (state.selectedBalls.size === 0) return;
    const target = event.target;
    if (target.closest("button")) return;
    if (target.closest(".ball")) return;
    if (target.closest(".drop-zone")) return;
    clearSelectedBalls();
  });

  const tableInner = document.querySelector(".table-inner");
  if (tableInner) {
    tableInner.addEventListener("click", (event) => {
      if (state.selectedBalls.size === 0) return;
      if (event.target.closest(".ball")) return;
      event.stopPropagation();
      moveBallsToRack(Array.from(state.selectedBalls));
    });

    tableInner.addEventListener("dragover", (event) => {
      if (state.game.winner) return;
      event.preventDefault();
    });

    tableInner.addEventListener("drop", (event) => {
      event.preventDefault();
      if (state.game.winner) return;

      const ballNumber = getDropBallNumber(event);
      if (!ballNumber) return;
      moveBallsToRack([ballNumber]);
    });
  }
}

async function init() {
  attachStaticEventHandlers();
  updateRoomUi();
  renderAll();

  if (!ensureLocalProfileName()) {
    openNameModal();
    setLobbyMessage("Enter your name to continue.");
  } else {
    setLobbyMessage("");
  }
}

init();
