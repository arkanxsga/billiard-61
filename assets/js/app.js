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
  remove,
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
const WINNING_SCORE = 61;
const GAME_DATABASE_STORAGE_DISABLED = false;
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
const kickPlayerBtn = document.getElementById("kickPlayerBtn");
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
const kickPlayerModal = document.getElementById("kickPlayerModal");
const kickPlayersListEl = document.getElementById("kickPlayersList");
const closeKickPlayerBtn = document.getElementById("closeKickPlayer");
const kickConfirmModal = document.getElementById("kickConfirmModal");
const kickConfirmMessageEl = document.getElementById("kickConfirmMessage");
const confirmKickYesBtn = document.getElementById("confirmKickYesBtn");
const cancelKickNoBtn = document.getElementById("cancelKickNoBtn");
const nameModal = document.getElementById("nameModal");
const nameModalInput = document.getElementById("nameModalInput");
const cancelNameModalBtn = document.getElementById("cancelNameModalBtn");
const saveNameModalBtn = document.getElementById("saveNameModalBtn");

let roomRef = null;
let dbInstance = null;
let currentRoomCode = "";
let roomUnsubscribe = null;
let saveQueue = Promise.resolve();
let localProfile = loadLocalProfile();
let pendingKickTarget = null;
let lobbyMessageTimeoutId = null;

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

function setLobbyMessage(message, isError = false, options = {}) {
  if (!lobbyMessageEl) return;
  if (lobbyMessageTimeoutId) {
    clearTimeout(lobbyMessageTimeoutId);
    lobbyMessageTimeoutId = null;
  }

  const safeMessage = String(message || "");
  const safeColor =
    typeof options.color === "string" && options.color.trim()
      ? options.color
      : isError
        ? "#ffb3b3"
        : "#ffd28f";
  const clearAfterMs = Number(options.clearAfterMs || 0);

  lobbyMessageEl.textContent = safeMessage;
  lobbyMessageEl.style.color = safeColor;

  if (safeMessage && clearAfterMs > 0) {
    lobbyMessageTimeoutId = setTimeout(() => {
      if (!lobbyMessageEl) return;
      if (lobbyMessageEl.textContent !== safeMessage) return;
      lobbyMessageEl.textContent = "";
      lobbyMessageEl.style.color = "#ffd28f";
      lobbyMessageTimeoutId = null;
    }, clearAfterMs);
  }
}

async function isNameTakenByAnotherProfile(name) {
  const targetName = sanitizeName(name).toLowerCase();
  if (!targetName) return false;

  await ensureDatabaseReady();
  const snapshot = await get(ref(dbInstance, PROFILES_PATH));
  if (!snapshot.exists()) return false;

  const profiles = snapshot.val() || {};
  for (const [profileId, profileValue] of Object.entries(profiles)) {
    if (String(profileId) === localProfile.id) continue;
    const existingName = sanitizeName(profileValue?.name || "").toLowerCase();
    if (existingName && existingName === targetName) {
      return true;
    }
  }

  return false;
}

function updateRoomUi() {
  if (connectPanel) {
    connectPanel.classList.remove("hidden");
  }
  if (createGameBtn) {
    createGameBtn.disabled = !ensureLocalProfileName();
  }
  if (joinGameBtn) {
    const canUseJoin = ensureLocalProfileName();
    joinGameBtn.disabled = !canUseJoin;
    joinGameBtn.title = canUseJoin ? "Join an existing game" : "Set username first";
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
    kickedUsers: {},
    roomClosedAt: 0,
    roomClosedBy: "",
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
    kickedUsers: { ...(game.kickedUsers || {}) },
    roomClosedAt: Number(game.roomClosedAt || 0),
    roomClosedBy: game.roomClosedBy || "",
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
  if (raw.kickedUsers && typeof raw.kickedUsers === "object") {
    for (const [userId, at] of Object.entries(raw.kickedUsers)) {
      if (!userId) continue;
      const kickedAt = Number(at);
      if (Number.isFinite(kickedAt) && kickedAt > 0) {
        normalized.kickedUsers[userId] = kickedAt;
      }
    }
  }
  normalized.roomClosedAt = Number(raw.roomClosedAt || 0);
  normalized.roomClosedBy = String(raw.roomClosedBy || "");
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

function getScoreRankingForGame(game) {
  const ranking = [];
  for (let i = 1; i <= game.playerCount; i++) {
    ranking.push({
      player: i,
      name: getDisplayPlayerName(i, game),
      score: Number(game.scores[i] || 0),
    });
  }
  ranking.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.player - b.player;
  });
  return ranking;
}

function computeWinnerForGame(game) {
  if (game.playerCount === 0) return null;
  const ranking = getScoreRankingForGame(game);
  if (ranking.length === 0) return null;

  const top = ranking[0];
  const second = ranking[1];
  const isUniqueLeader = !second || top.score > second.score;
  const anyOnRack = game.balls.some((ball) => ball.locationType === "rack");

  if (top.score >= WINNING_SCORE) {
    return isUniqueLeader ? top.player : null;
  }
  if (anyOnRack) return null;
  return isUniqueLeader ? top.player : null;
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

function isCurrentUserGameCreator() {
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

function updateKickButtonState() {
  if (!kickPlayerBtn) return;
  const isCreator = isCurrentUserGameCreator();
  kickPlayerBtn.disabled = !isCreator || state.game.playerCount === 0;
  kickPlayerBtn.title = isCreator
    ? "Kick players from this game"
    : "Only the game creator can kick players";
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
  const mySeat = getCurrentUserSeat();
  const gameLocked = Boolean(state.game.winner);

  for (let i = 1; i <= state.game.playerCount; i++) {
    const displayName = getDisplayPlayerName(i);
    const seatOwner = state.game.seatAssignments?.[i] || "";
    const isMySeat = seatOwner === localProfile.id;
    const isTakenByOther = Boolean(seatOwner && !isMySeat);
    const isLockedByMySeat = Boolean(mySeat && mySeat !== i);
    const canSitHere = !gameLocked && !isTakenByOther && !isLockedByMySeat;
    const seatLabel = gameLocked
      ? "Game Over"
      : isMySeat
        ? "Seated"
        : isTakenByOther
          ? "Taken"
          : isLockedByMySeat
            ? "Locked"
            : "Sit Here";
    const player = document.createElement("div");
    player.className = "player";
    player.dataset.player = String(i);

    player.innerHTML = `
      <div class="player-header">
        <span class="player-name">${escapeHtml(displayName)}</span>
        <div class="player-header-right">
          <button class="seat-btn${isMySeat ? " current" : ""}" data-player="${i}" ${canSitHere ? "" : "disabled"}>
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
      <button class="foul-only-btn" data-player="${i}" ${gameLocked ? "disabled" : ""}>Foul (no ball) -4</button>
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
    const anyOnRack = state.game.balls.some((ball) => ball.locationType === "rack");
    if (anyOnRack) {
      statusBar.textContent = `Winner: ${winnerName} (${winnerScore}) - reached ${WINNING_SCORE}`;
    } else {
      const ranking = getScoreRankingForGame(state.game);
      const placements = [];
      if (ranking[1]) {
        placements.push(`2nd: ${ranking[1].name}`);
      }
      if (ranking[2]) {
        placements.push(`3rd: ${ranking[2].name}`);
      }
      if (ranking[3]) {
        placements.push(`4th: ${ranking[3].name}`);
      }
      statusBar.textContent =
        placements.length > 0
          ? `Winner: ${winnerName} (${winnerScore}) - ${placements.join(" • ")}`
          : `Winner: ${winnerName} (${winnerScore})`;
    }
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
  updateKickButtonState();
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

function rackCompletionMessages(previousHadRack, previousWinner) {
  const messages = [];
  const anyOnRackNow = state.game.balls.some((ball) => ball.locationType === "rack");
  const winnerNow = computeWinnerForGame(state.game);
  const ranking = getScoreRankingForGame(state.game);
  const previousWinnerId = Number(previousWinner || 0);

  state.game.winner = winnerNow;

  if (winnerNow && winnerNow !== previousWinnerId) {
    const winnerName = getDisplayPlayerName(winnerNow);
    const winnerScore = Number(state.game.scores[winnerNow] || 0);
    if (winnerScore >= WINNING_SCORE) {
      messages.push(`${winnerName} has won with ${winnerScore} points.`);
    } else if (!anyOnRackNow && previousHadRack) {
      messages.push(`Game finished: ${winnerName} wins (${winnerScore})`);
    }
  } else if (!winnerNow && !anyOnRackNow && previousHadRack) {
    const bestScore = ranking[0] ? ranking[0].score : 0;
    messages.push(`Game finished: tie at ${bestScore}`);
  }

  if (!anyOnRackNow && previousHadRack) {
    const placements = [];
    if (ranking[1]) {
      placements.push(`2nd: ${ranking[1].name} (${ranking[1].score})`);
    }
    if (ranking[2]) {
      placements.push(`3rd: ${ranking[2].name} (${ranking[2].score})`);
    }
    if (ranking[3]) {
      placements.push(`4th: ${ranking[3].name} (${ranking[3].score})`);
    }
    if (placements.length > 0) {
      messages.push(placements.join(" • "));
    }
  }

  return messages;
}

function persistGameState(actionType, actionMessage) {
  if (GAME_DATABASE_STORAGE_DISABLED || !roomRef) return;
  const roomRefForWrite = roomRef;

  recalculateScoresForGame(state.game);
  updatePottedBallsForGame(state.game);
  ensureCurrentTurnIsValid();

  state.game.lastAction = buildLastAction(actionType, actionMessage);
  state.game.updatedAt = Date.now();

  const payload = serializeGameState(state.game);
  saveQueue = saveQueue
    .then(() => update(roomRefForWrite, payload))
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
  const previousWinner = state.game.winner;

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

  const completionMessages = rackCompletionMessages(previousHadRack, previousWinner);
  completionMessages.forEach((message) => addLogEntry(message));

  clearSelectedBalls();
  renderAll();
  persistGameState(isFoul ? "foul_shot" : "clean_shot", "Ball assignment updated");
  return true;
}

function moveBallsToRack(ballNumbers) {
  if (state.game.playerCount === 0 || state.game.winner) return false;

  const ballsToMove = ballNumbers
    .map((number) => state.game.balls.find((ball) => ball.number === number))
    .filter((ball) => ball && ball.locationType !== "rack");

  if (ballsToMove.length === 0) return false;

  saveUndoPoint();
  ballsToMove.forEach((ball) => {
    ball.locationType = "rack";
    ball.player = null;
  });

  recalculateScoresForGame(state.game);
  updatePottedBallsForGame(state.game);
  state.game.winner = computeWinnerForGame(state.game);

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
  const previousHadRack = state.game.balls.some((ball) => ball.locationType === "rack");
  const previousWinner = state.game.winner;
  state.game.foulOnlyCounts[player] = (state.game.foulOnlyCounts[player] || 0) + 1;

  recalculateScoresForGame(state.game);
  updatePottedBallsForGame(state.game);
  advanceTurnFromPlayer(player);

  addLogEntry(`${getPlayerLabel(player)} foul (no ball) -4`);

  const completionMessages = rackCompletionMessages(previousHadRack, previousWinner);
  completionMessages.forEach((message) => addLogEntry(message));

  renderAll();
  persistGameState("foul_only", "Foul without ball");
}

function seatCurrentUser(player) {
  if (state.game.winner) {
    addLogEntry("Game is finished. Start a new game to continue.");
    renderAll();
    return;
  }

  const playerIndex = Number(player);
  if (
    !Number.isInteger(playerIndex) ||
    playerIndex < 1 ||
    playerIndex > state.game.playerCount
  ) {
    return;
  }

  const previousSeat = getCurrentUserSeat();
  if (previousSeat && previousSeat !== playerIndex) {
    addLogEntry(`You are already seated on Player ${previousSeat}`);
    renderAll();
    return;
  }

  const existingSeatOwner = state.game.seatAssignments[playerIndex] || "";
  if (existingSeatOwner && existingSeatOwner !== localProfile.id) {
    addLogEntry(`Player ${playerIndex} is already taken`);
    renderAll();
    return;
  }
  if (previousSeat === playerIndex) return;

  state.game.seatAssignments[playerIndex] = localProfile.id;
  state.game.playerNames[playerIndex] = localProfile.name;

  for (let i = 1; i <= state.game.playerCount; i++) {
    if (!state.game.seatAssignments[i]) {
      state.game.playerNames[i] = `Player ${i}`;
    }
  }

  addLogEntry(`${localProfile.name} sat on Player ${playerIndex}`);

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

function openKickPlayerModal() {
  if (!kickPlayerModal) return;
  if (!isCurrentUserGameCreator()) return;
  renderKickPlayersList();
  kickPlayerModal.classList.remove("hidden");
}

function closeKickPlayerModal() {
  if (!kickPlayerModal) return;
  kickPlayerModal.classList.add("hidden");
  closeKickConfirmModal();
}

function openKickConfirmModal(userId, player) {
  if (!kickConfirmModal) return;
  const playerIndex = Number(player);
  if (!userId || !playerIndex) return;

  const playerName = getDisplayPlayerName(playerIndex);
  pendingKickTarget = {
    userId: String(userId),
    player: playerIndex,
    name: playerName,
  };

  if (kickConfirmMessageEl) {
    kickConfirmMessageEl.textContent = `Are you sure you want to kick ${playerName}?`;
  }
  kickConfirmModal.classList.remove("hidden");
}

function closeKickConfirmModal() {
  pendingKickTarget = null;
  if (!kickConfirmModal) return;
  kickConfirmModal.classList.add("hidden");
}

function confirmKickFromModal() {
  if (!pendingKickTarget) {
    closeKickConfirmModal();
    return;
  }

  const target = { ...pendingKickTarget };
  closeKickConfirmModal();
  kickPlayerFromGame(target.userId, target.player);
}

function renderKickPlayersList() {
  if (!kickPlayersListEl) return;
  kickPlayersListEl.innerHTML = "";

  const players = [];
  for (let i = 1; i <= state.game.playerCount; i++) {
    const userId = state.game.seatAssignments?.[i];
    if (!userId || userId === localProfile.id) continue;
    players.push({
      player: i,
      userId,
      name: getDisplayPlayerName(i),
    });
  }

  if (players.length === 0) {
    const empty = document.createElement("div");
    empty.className = "modal-subtitle";
    empty.textContent = "No players available to kick.";
    kickPlayersListEl.appendChild(empty);
    return;
  }

  players.forEach((item) => {
    const button = document.createElement("button");
    button.className = "join-game-item";
    button.dataset.userId = item.userId;
    button.dataset.player = String(item.player);
    button.innerHTML = `
      <div class="join-game-item-name">${escapeHtml(item.name)}</div>
      <div class="join-game-item-meta">Player ${item.player} • Tap to kick</div>
    `;
    kickPlayersListEl.appendChild(button);
  });
}

function kickPlayerFromGame(userId, player) {
  if (!isCurrentUserGameCreator()) return;
  if (!userId || userId === localProfile.id) return;

  let seatNumber = Number(player);
  if (!seatNumber || state.game.seatAssignments?.[seatNumber] !== userId) {
    seatNumber = 0;
    for (let i = 1; i <= state.game.playerCount; i++) {
      if (state.game.seatAssignments?.[i] === userId) {
        seatNumber = i;
        break;
      }
    }
  }
  if (!seatNumber) return;

  const kickedName = getDisplayPlayerName(seatNumber);
  delete state.game.seatAssignments[seatNumber];
  state.game.playerNames[seatNumber] = `Player ${seatNumber}`;
  state.game.kickedUsers[userId] = Date.now();

  addLogEntry(`${kickedName} was kicked by ${localProfile.name}`);
  renderAll();
  persistGameState("kick_player", `${kickedName} was kicked`);
  renderKickPlayersList();
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

  try {
    const taken = await isNameTakenByAnotherProfile(name);
    if (taken) {
      setLobbyMessage("Name taken.", true);
      return false;
    }
  } catch (error) {
    console.error("Failed to validate username:", error);
    setLobbyMessage("Could not verify username. Try again.", true);
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
  setLobbyMessage("Username saved.", false, {
    color: "#ffffff",
    clearAfterMs: 3000,
  });
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
      return {
        code,
        name: sanitizeGameName(game.roomName || ""),
        playerCount: Number(game.playerCount || 0),
        ownerId: String(game.ownerId || ""),
        updatedAt: Number(game.updatedAt || 0),
      };
    })
    .filter(
      (game) =>
        game.name &&
        game.playerCount > 0 &&
        Boolean(game.ownerId)
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
  if (roomGame.ownerId === localProfile.id) {
    return { __deleteRoom: true };
  }

  let changed = false;
  for (let i = 1; i <= roomGame.playerCount; i++) {
    if (roomGame.seatAssignments[i] === localProfile.id) {
      delete roomGame.seatAssignments[i];
      roomGame.playerNames[i] = `Player ${i}`;
      changed = true;
      break;
    }
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
  if (GAME_DATABASE_STORAGE_DISABLED || !roomRef) return;
  const roomRefAtLeave = roomRef;

  const payload = buildRoomUpdateForLeavingUser();
  if (!payload) return;

  saveQueue = saveQueue
    .then(() => {
      if (payload.__deleteRoom) {
        return remove(roomRefAtLeave);
      }
      return update(roomRefAtLeave, payload);
    })
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

function leaveCurrentRoom(sync = true) {
  if (sync) {
    syncLeaveToRoom();
  }
  detachRoomListener();
  roomRef = null;
  currentRoomCode = "";
  localStorage.removeItem(LAST_ROOM_STORAGE_KEY);

  state.game = createDefaultGameState();
  clearUndoHistory();
  clearSelectedBalls();
  closeJoinGameModal();
  closeCreateGameModal();
  closeKickPlayerModal();
  closeNewGameConfirm();
  setLobbyMessage("");
  updateRoomUi();
  renderAll();
}

function forceLeaveFromGame(message) {
  leaveCurrentRoom(false);
  setLobbyMessage(message, true);
}

function resetToPlayerSelection() {
  leaveCurrentRoom(true);
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
  return;
}

function applyRemoteState(game, isInitialRead = false) {
  const previousActionBy = game.lastAction?.by || "";
  const isOtherClient = previousActionBy && previousActionBy !== CLIENT_ID;
  const incoming = normalizeGameState(game);
  const kickedAt = Number(incoming.kickedUsers?.[localProfile.id] || 0);
  const closedByOther =
    Number(incoming.roomClosedAt || 0) > 0 &&
    incoming.roomClosedBy &&
    incoming.roomClosedBy !== localProfile.id;

  if (kickedAt > 0) {
    forceLeaveFromGame("You were kicked out of the game.");
    return;
  }
  if (closedByOther) {
    forceLeaveFromGame("Game ended because the creator left.");
    return;
  }

  state.game = incoming;
  clearSelectedBalls();

  if (isOtherClient && !isInitialRead) {
    clearUndoHistory();
  }

  renderAll();
  syncMySeatNameIfNeeded();
}

async function connectToRoom(roomCode, { createIfMissing = false } = {}) {
  if (!ensureLocalProfileName()) {
    setLobbyMessage("Enter your name first.", true);
    return false;
  }
  if (GAME_DATABASE_STORAGE_DISABLED) {
    setLobbyMessage(
      "Online room sync is disabled. Create Game starts a local game.",
      true
    );
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

  if (!currentRoomCode || !roomRef) {
    return false;
  }

  const joinedName = sanitizeGameName(state.game.roomName || "");
  setLobbyMessage(
    joinedName ? `Joined "${joinedName}"` : `Connected to room ${currentRoomCode}`
  );
  updateRoomUi();

  roomUnsubscribe = onValue(roomRef, (roomSnapshot) => {
    if (!roomSnapshot.exists()) {
      forceLeaveFromGame("Game ended because the creator left.");
      return;
    }
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
    changeNameBtn.addEventListener("click", () => {
      if (!nameModal) return;
      if (!nameModal.classList.contains("hidden")) {
        closeNameModal();
        return;
      }
      openNameModal();
    });
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

  if (cancelNameModalBtn) {
    cancelNameModalBtn.addEventListener("click", () => {
      closeNameModal();
    });
  }

  if (nameModal) {
    nameModal.addEventListener("click", (event) => {
      if (event.target !== nameModal) return;
      closeNameModal();
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

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (kickConfirmModal && !kickConfirmModal.classList.contains("hidden")) {
      event.preventDefault();
      closeKickConfirmModal();
      return;
    }
    if (!nameModal || nameModal.classList.contains("hidden")) return;
    event.preventDefault();
    closeNameModal();
  });

  if (closeJoinGameBtn) {
    closeJoinGameBtn.addEventListener("click", closeJoinGameModal);
  }

  if (kickPlayerBtn) {
    kickPlayerBtn.addEventListener("click", openKickPlayerModal);
  }

  if (closeKickPlayerBtn) {
    closeKickPlayerBtn.addEventListener("click", closeKickPlayerModal);
  }

  if (kickPlayersListEl) {
    kickPlayersListEl.addEventListener("click", (event) => {
      const button = event.target.closest(".join-game-item");
      if (!button) return;
      const userId = String(button.dataset.userId || "");
      const player = Number(button.dataset.player || 0);
      if (!userId || !player) return;
      openKickConfirmModal(userId, player);
    });
  }

  if (confirmKickYesBtn) {
    confirmKickYesBtn.addEventListener("click", confirmKickFromModal);
  }

  if (cancelKickNoBtn) {
    cancelKickNoBtn.addEventListener("click", closeKickConfirmModal);
  }

  if (kickConfirmModal) {
    kickConfirmModal.addEventListener("click", (event) => {
      if (event.target !== kickConfirmModal) return;
      closeKickConfirmModal();
    });
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
