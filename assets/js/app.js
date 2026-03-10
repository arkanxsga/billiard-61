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
  apiKey: "AIzaSyD-mblK3hPjo5bLDxgBjVkN-ajXhNTsxls",
  authDomain: "billiard-61.firebaseapp.com",
  projectId: "billiard-61",
  storageBucket: "billiard-61.firebasestorage.app",
  messagingSenderId: "353223372621",
  appId: "1:353223372621:web:c40710808be8afb243d104",
};

const ROOM_PATH = "games/mainRoom";
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
const playerSelectButtons = document.querySelectorAll(".player-select-option");
const mainContent = document.getElementById("mainContent");
const backSelectBtn = document.getElementById("backSelect");
const leaveConfirmOverlay = document.getElementById("leaveConfirm");
const stayHereBtn = document.getElementById("stayHere");
const leaveNowBtn = document.getElementById("leaveNow");
const logListEl = document.getElementById("logList");
const undoLastBtn = document.getElementById("undoLast");
const statusBar = document.getElementById("statusBar");
const offlineOverlayId = "offlineRequiredOverlay";

let roomRef = null;
let saveQueue = Promise.resolve();

let state = {
  game: createDefaultGameState(),
  selectedBalls: new Set(),
  history: [],
};

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
  const customNamesForThree = ["mourad", "arkan", "konan"];
  const names = {};
  for (let i = 1; i <= count; i++) {
    names[i] =
      count === 3 && customNamesForThree[i - 1]
        ? customNamesForThree[i - 1]
        : `Player ${i}`;
  }
  return names;
}

function createDefaultGameState() {
  return {
    playerCount: 0,
    playerNames: {},
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
    playerCount: game.playerCount,
    playerNames: { ...game.playerNames },
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
  normalized.playerCount = playerCount;
  normalized.playerNames = createPlayerNames(playerCount);

  if (raw.playerNames && typeof raw.playerNames === "object") {
    for (let i = 1; i <= playerCount; i++) {
      const incoming =
        raw.playerNames[i] !== undefined
          ? raw.playerNames[i]
          : raw.playerNames[String(i)];
      if (typeof incoming === "string" && incoming.trim()) {
        normalized.playerNames[i] = incoming.trim();
      }
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

function getPlayerLabel(player) {
  const name = state.game.playerNames[player] || `Player ${player}`;
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
  updateUndoButtonState();
}

function clearUndoHistory() {
  state.history = [];
  updateUndoButtonState();
}

function updateUndoButtonState() {
  if (!undoLastBtn) return;
  undoLastBtn.disabled = state.history.length === 0;
}

function undoLastAction() {
  const snapshot = state.history.pop();
  if (!snapshot) {
    updateUndoButtonState();
    return;
  }

  state.game = normalizeGameState(snapshot);
  addLogEntry("Undo last action");
  clearSelectedBalls();
  renderAll();
  persistGameState("undo", "Undo last action");
  updateUndoButtonState();
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

function showOfflineRequiredOverlay() {
  let overlay = document.getElementById(offlineOverlayId);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = offlineOverlayId;
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:9999",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "background:#04160d",
      "color:#f5f5f5",
      "padding:20px",
      "text-align:center",
    ].join(";");
    overlay.innerHTML = `
      <div style="max-width:320px">
        <h2 style="margin:0 0 10px;font-size:22px;">Internet Required</h2>
        <p style="margin:0;opacity:.9;">This app works only online. Reconnect to continue.</p>
      </div>
    `;
    document.body.appendChild(overlay);
  }
  overlay.style.display = "flex";
}

function hideOfflineRequiredOverlay() {
  const overlay = document.getElementById(offlineOverlayId);
  if (overlay) overlay.style.display = "none";
}

function enforceOnlineOnlyMode() {
  const applyConnectivityState = () => {
    if (navigator.onLine) {
      hideOfflineRequiredOverlay();
      return true;
    }
    showOfflineRequiredOverlay();
    return false;
  };

  window.addEventListener("offline", applyConnectivityState);
  window.addEventListener("online", () => {
    hideOfflineRequiredOverlay();
    window.location.reload();
  });

  return applyConnectivityState();
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
    const displayName = state.game.playerNames[i] || `Player ${i}`;
    const player = document.createElement("div");
    player.className = "player";
    player.dataset.player = String(i);

    player.innerHTML = `
      <div class="player-header">
        <span class="player-name">${displayName}</span>
        <span class="score" id="scoreP${i}">0</span>
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
    const winnerName = state.game.playerNames[state.game.winner] || `Player ${state.game.winner}`;
    const winnerScore = state.game.scores[state.game.winner] ?? 0;
    statusBar.textContent = `Winner: ${winnerName} (${winnerScore})`;
    return;
  }

  const turnName = state.game.playerNames[state.game.currentTurn] || `Player ${state.game.currentTurn}`;
  statusBar.textContent = `Current turn: ${turnName}`;
}

function renderLayoutVisibility() {
  const hasActiveGame = state.game.playerCount > 0;

  if (hasActiveGame) {
    playerSelectOverlay.classList.add("hidden");
    mainContent.classList.remove("hidden");
    return;
  }

  mainContent.classList.add("hidden");
  playerSelectOverlay.classList.remove("hidden");
}

function renderAll() {
  ensureCurrentTurnIsValid();
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
  updateUndoButtonState();
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
    return previousHadRack ? `Rack finished: tie at ${bestScore}` : null;
  }

  state.game.winner = bestPlayer;
  return previousHadRack ? `Rack finished: Player ${bestPlayer} wins (${bestScore})` : null;
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
      addLogEntry(`Player ${player} foul with ball ${number} (-${number})`);
    } else {
      addLogEntry(`${getPlayerLabel(player)} potted ball ${number} (+${number})`);
    }
  } else {
    const joined = numbersToApply.join(", ");
    if (isFoul) {
      addLogEntry(`Player ${player} foul with balls ${joined}`);
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

  addLogEntry(`Player ${player} foul (no ball) -4`);

  const completionMessage = rackCompletionMessage(false);
  if (completionMessage) {
    addLogEntry(completionMessage);
  }

  renderAll();
  persistGameState("foul_only", "Foul without ball");
}

function startNewRack() {
  if (state.game.playerCount === 0) return;

  const playerCount = state.game.playerCount;
  const playerNames = { ...state.game.playerNames };
  const existingLog = [...state.game.log];

  state.game = createDefaultGameState();
  state.game.playerCount = playerCount;
  state.game.playerNames = playerNames;
  state.game.currentTurn = 1;
  state.game.scores = createZeroMap(playerCount);
  state.game.foulOnlyCounts = createZeroMap(playerCount);
  state.game.balls = createDefaultBalls();
  state.game.log = existingLog;

  updatePottedBallsForGame(state.game);

  addLogEntry("New rack started");
  clearUndoHistory();
  clearSelectedBalls();
  renderAll();
  persistGameState("new_rack", "New rack started");
}

function selectPlayerCount(count) {
  const playerCount = normalizeCount(count);
  if (playerCount <= 0) return;

  state.game = createDefaultGameState();
  state.game.playerCount = playerCount;
  state.game.playerNames = createPlayerNames(playerCount);
  state.game.currentTurn = 1;
  state.game.scores = createZeroMap(playerCount);
  state.game.foulOnlyCounts = createZeroMap(playerCount);
  state.game.balls = createDefaultBalls();

  recalculateScoresForGame(state.game);
  updatePottedBallsForGame(state.game);

  addLogEntry(`Players set: ${playerCount}`);
  addLogEntry("New rack started");

  clearUndoHistory();
  clearSelectedBalls();
  renderAll();
  persistGameState("select_players", `Players set: ${playerCount}`);
}

function resetToPlayerSelection() {
  state.game = createDefaultGameState();
  addLogEntry("Game reset");

  clearUndoHistory();
  clearSelectedBalls();

  if (leaveConfirmOverlay) {
    leaveConfirmOverlay.classList.add("hidden");
  }

  renderAll();
  persistGameState("reset_game", "Game reset");
}

function attachPlayerHandlers() {
  const foulOnlyButtons = document.querySelectorAll(".foul-only-btn");
  const dropZones = document.querySelectorAll(".drop-zone");

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
}

async function initializeRealtimeRoom() {
  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  const db = getDatabase(app);
  roomRef = ref(db, ROOM_PATH);

  const snapshot = await get(roomRef);
  if (snapshot.exists()) {
    applyRemoteState(snapshot.val(), true);
  } else {
    const defaultState = createDefaultGameState();
    defaultState.lastAction = buildLastAction("init", "Initial game state created");
    defaultState.updatedAt = Date.now();
    await set(roomRef, serializeGameState(defaultState));
    applyRemoteState(defaultState, true);
  }

  onValue(roomRef, (roomSnapshot) => {
    if (!roomSnapshot.exists()) return;
    applyRemoteState(roomSnapshot.val(), false);
  });
}

function attachStaticEventHandlers() {
  if (undoLastBtn) {
    undoLastBtn.addEventListener("click", undoLastAction);
    updateUndoButtonState();
  }

  if (resetGameBtn) {
    resetGameBtn.addEventListener("click", startNewRack);
  }

  playerSelectButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const count = Number(btn.dataset.count);
      selectPlayerCount(count);
    });
  });

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
  if (!enforceOnlineOnlyMode()) {
    return;
  }

  attachStaticEventHandlers();

  try {
    await initializeRealtimeRoom();
  } catch (error) {
    console.error("Failed to initialize multiplayer sync:", error);
    showOfflineRequiredOverlay();
  }
}

init();
