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
const playerNames = {1:"mourad",2:"arkan",3:"konan"};

let state = {
  balls: [],
  scores: {},
  winner: null,
  playerCount: 0,
  selectedBalls: new Set(),
  foulOnlyCounts: {}
};

function buildPlayers(count) {
  state.playerCount = count;
  state.scores = {};
  state.foulOnlyCounts = {};
  playersContainer.innerHTML = "";

  const customNamesForThree = ["mourad", "arkan", "konan"];

  for (let i = 1; i <= count; i++) {
    state.scores[i] = 0;
    const displayName =
      count === 3 && customNamesForThree[i - 1]
        ? customNamesForThree[i - 1]
        : `Player ${i}`;
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
  renderScores();
  logEvent(`Players set: ${count}`);
}

function attachPlayerHandlers() {
  const foulOnlyButtons = document.querySelectorAll(".foul-only-btn");
  const dropZones = document.querySelectorAll(".drop-zone");

  foulOnlyButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state.winner) return;
      const player = Number(btn.dataset.player);
      state.foulOnlyCounts[player] = (state.foulOnlyCounts[player] || 0) + 1;
      recalculateScores();
      logEvent(`Player ${player} foul (no ball) -4`);
    });
  });

  dropZones.forEach((zone) => {
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      if (state.winner) return;
      zone.classList.add("drag-over");
    });
    zone.addEventListener("dragleave", () => {
      zone.classList.remove("drag-over");
    });
    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.classList.remove("drag-over");
      if (state.winner) return;
      let ballNumber =
        state.selectedBalls.size === 1
          ? Array.from(state.selectedBalls)[0]
          : null;
      if (!ballNumber) {
        const numberStr = event.dataTransfer.getData("text/plain");
        ballNumber = Number(numberStr);
      }
      if (!ballNumber) return;
      const player = Number(zone.dataset.player);
      const type = zone.dataset.type;
      const isFoul = type === "foul";
      applyShot(ballNumber, player, isFoul);
      clearSelectedBalls();
    });

    zone.addEventListener("click", () => {
      if (state.winner) return;
      if (state.selectedBalls.size === 0) return;
      const player = Number(zone.dataset.player);
      const type = zone.dataset.type;
      const isFoul = type === "foul";
      const numbers = Array.from(state.selectedBalls);
      numbers.forEach((num) => applyShot(num, player, isFoul));
      clearSelectedBalls();
    });
  });
}

function createBallElement(ball) {
  const div = document.createElement("div");
  div.className = "ball available in-rack";
  div.textContent = ball.number;
  div.dataset.number = ball.number;
  div.style.backgroundColor = ball.color;
  div.draggable = true;
  div.addEventListener("dragstart", onBallDragStart);
  div.addEventListener("click", onBallClick);
  return div;
}

function setupBalls() {
  rackEl.innerHTML = "";
  state.balls = [];
  const colors = [
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
  for (let i = 1; i <= 15; i++) {
    const ball = {
      number: i,
      color: colors[i - 1],
      locationType: "rack",
      player: null
    };
    state.balls.push(ball);
  }
  renderPositions();
}

function renderScores() {
  for (let i = 1; i <= state.playerCount; i++) {
    const el = document.getElementById(`scoreP${i}`);
    if (el) {
      el.textContent = state.scores[i] ?? 0;
    }
  }
}

function renderPositions() {
  rackEl.innerHTML = "";
  for (let i = 1; i <= state.playerCount; i++) {
    const clean = document.getElementById(`ballsP${i}Clean`);
    const foul = document.getElementById(`ballsP${i}Foul`);
    if (clean) clean.innerHTML = "";
    if (foul) foul.innerHTML = "";
  }

  state.balls.forEach((ball, idx) => {
    const el = createBallElement(ball);
    el.dataset.number = ball.number;
    if (state.selectedBalls.has(ball.number)) {
      el.classList.add("selected");
    }

    if (ball.locationType === "rack") {
      el.classList.add("in-rack");
      rackEl.appendChild(el);
    } else if (ball.locationType === "clean" || ball.locationType === "foul") {
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
    }
  });
}

function applyShot(ballNumber, player, isFoul) {
  const ball = state.balls.find((b) => b.number === ballNumber);
  if (!ball) return;

  ball.player = player;
  ball.locationType = isFoul ? "foul" : "clean";
  renderPositions();
  recalculateScores();
  checkWinner();
  if (isFoul) {
    logEvent(`Player ${player} foul with ball ${ballNumber} (-${ballNumber})`);
  } else {
    logEvent(`P${player} ${playerNames[player]} potted ball ${ballNumber} (+${ballNumber})`);
  }
}

function onBallClick(event) {
  if (state.winner) return;
  const number = Number(event.currentTarget.dataset.number);
  const selected = state.selectedBalls;
  if (selected.has(number)) {
    selected.delete(number);
  } else {
    selected.add(number);
  }
  refreshSelectionVisuals();
}

function clearSelectedBalls() {
  state.selectedBalls.clear();
  refreshSelectionVisuals();
}

function refreshSelectionVisuals() {
  document
    .querySelectorAll(".ball.selected")
    .forEach((b) => b.classList.remove("selected"));
  state.selectedBalls.forEach((num) => {
    const el = document.querySelector(`.ball[data-number="${num}"]`);
    if (el) el.classList.add("selected");
  });

  const zones = document.querySelectorAll(".drop-zone");
  if (state.selectedBalls.size > 0) {
    zones.forEach((z) => z.classList.add("select-target"));
  } else {
    zones.forEach((z) => z.classList.remove("select-target"));
  }
}

function onBallDragStart(event) {
  if (state.winner) {
    event.preventDefault();
    return;
  }
  const number = Number(event.target.dataset.number);
  const ball = state.balls.find((b) => b.number === number);
  if (!ball) return;
  event.dataTransfer.setData("text/plain", String(number));
  state.selectedBalls = new Set([number]);
  refreshSelectionVisuals();
}

function recalculateScores() {
  const scores = {};
  for (let i = 1; i <= state.playerCount; i++) {
    scores[i] = 0;
  }

  state.balls.forEach((ball) => {
    if (!ball.player) return;
    if (ball.locationType === "clean") {
      scores[ball.player] += ball.number;
    } else if (ball.locationType === "foul") {
      scores[ball.player] += -ball.number;
    }
  });

  for (let i = 1; i <= state.playerCount; i++) {
    const fouls = state.foulOnlyCounts[i] || 0;
    scores[i] -= fouls * 4;
  }

  state.scores = scores;
  renderScores();
}

function checkWinner() {
  const anyOnRack = state.balls.some((b) => b.locationType === "rack");
  if (!anyOnRack) {
    let bestPlayer = 0;
    let bestScore = -Infinity;
    let tie = false;
    for (let i = 1; i <= state.playerCount; i++) {
      const s = state.scores[i] ?? 0;
      if (s > bestScore) {
        bestScore = s;
        bestPlayer = i;
        tie = false;
      } else if (s === bestScore) {
        tie = true;
      }
    }

    if (tie) {
      logEvent(`Rack finished: tie at ${bestScore}`);
    } else {
      state.winner = bestPlayer;
      logEvent(`Rack finished: Player ${bestPlayer} wins (${bestScore})`);
    }
  }
}

function startNewRack() {
  setupBalls();
  recalculateScores();
  // balls already in triangle; no extra animation now
  if (state.playerCount > 0) {
    logEvent("New rack started");
  }
}

resetGameBtn.addEventListener("click", () => {
  const currentCount = state.playerCount;
  state = {
    balls: [],
    scores: {},
    winner: null,
    playerCount: currentCount,
    selectedBalls: new Set(),
    foulOnlyCounts: {}
  };
  startNewRack();
});

function logEvent(message) {
  if (!logListEl) return;
  const now = new Date();
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  const timeStr = `${hours}:${minutes} ${ampm}`;

  const entry = document.createElement("div");
  entry.className = "log-entry";

  const timeSpan = document.createElement("span");
  timeSpan.className = "log-entry-time";
  timeSpan.textContent = `[${timeStr}]`;

  const textSpan = document.createElement("span");
  textSpan.textContent = ` ${message}`;

  entry.appendChild(timeSpan);
  entry.appendChild(textSpan);

  logListEl.prepend(entry);
  while (logListEl.children.length > 80) {
    logListEl.removeChild(logListEl.lastChild);
  }
}

function init() {
  playerSelectButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const count = Number(btn.dataset.count);
      if (!count) return;
      playerSelectOverlay.classList.add("hidden");
      mainContent.classList.remove("hidden");
      buildPlayers(count);
      startNewRack();
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

  if (leaveNowBtn && leaveConfirmOverlay) {
    leaveNowBtn.addEventListener("click", () => {
      // Confirm leaving: reset everything and go back to player select
      state = {
        balls: [],
        scores: {},
        winner: null,
        playerCount: 0,
        selectedBalls: new Set(),
        foulOnlyCounts: {}
      };
      playersContainer.innerHTML = "";
      rackEl.innerHTML = "";
      leaveConfirmOverlay.classList.add("hidden");
      mainContent.classList.add("hidden");
      playerSelectOverlay.classList.remove("hidden");
      if (logListEl) {
        logListEl.innerHTML = "";
      }
    });
  }

  // Click anywhere (not button/box/ball) to clear selection
  mainContent.addEventListener("click", (event) => {
    if (state.selectedBalls.size === 0) return;
    const target = event.target;
    if (target.closest("button")) return;
    if (target.closest(".ball")) return;
    if (target.closest(".drop-zone")) return;
    clearSelectedBalls();
  });

  // Click on table area to put selected balls back on rack
  const tableInner = document.querySelector(".table-inner");
  if (tableInner) {
    tableInner.addEventListener("click", (event) => {
      if (state.selectedBalls.size === 0) return;
      if (event.target.closest(".ball")) return;
      event.stopPropagation();
      const numbers = Array.from(state.selectedBalls);
      numbers.forEach((num) => {
        const ball = state.balls.find((b) => b.number === num);
        if (ball) {
          ball.locationType = "rack";
          ball.player = null;
        }
      });
      clearSelectedBalls();
      renderPositions();
      recalculateScores();
      logEvent("Ball returned to rack");
    });

    tableInner.addEventListener("dragover", (event) => {
      if (state.winner) return;
      event.preventDefault();
    });

    tableInner.addEventListener("drop", (event) => {
      event.preventDefault();
      if (state.winner) return;

      let ballNumber =
        state.selectedBalls.size === 1
          ? Array.from(state.selectedBalls)[0]
          : null;
      if (!ballNumber) {
        const numberStr = event.dataTransfer.getData("text/plain");
        ballNumber = Number(numberStr);
      }
      if (!ballNumber) return;

      const ball = state.balls.find((b) => b.number === ballNumber);
      if (!ball) return;

      ball.locationType = "rack";
      ball.player = null;
      clearSelectedBalls();
      renderPositions();
      recalculateScores();
      logEvent("Ball returned to rack");
    });
  }
}

init();
