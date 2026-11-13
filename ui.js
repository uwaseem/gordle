// Gordle interface. Game rules live in game.js; this file only draws and
// takes input. Rendering is incremental: each Board keeps references to its
// tiles so a keystroke touches at most one tile per unsolved Board.

let game;
let mode; // "easy" or "hard": the Mode new games start in
let pendingMode = null; // the Mode the open confirm dialog would switch to

const WORD_LENGTH = 5;
const FLASH_MS = 1600;
const REVEAL_MARGIN_PX = 12;
const KEY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const MODE_KEY = "gordle-mode";
const MODE_NAMES = { easy: "Easy", hard: "Hard" };
const REFRESH_CONFIRM_TEXT = "Start a new game? Your progress will be lost";
const REJECTION_TEXT = {
  length: "Not enough letters",
  "not-in-list": "Not in word list",
  repeat: "Already guessed",
};
const BACKSPACE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7z"/>' +
  '<path d="M12.5 9.5l5 5M17.5 9.5l-5 5"/></svg>';

const statusEl = document.getElementById("status");
const boardsEl = document.getElementById("boards");
const keyboardEl = document.getElementById("keyboard");
const refreshEl = document.getElementById("refresh");
const confirmEl = document.getElementById("confirm");
const confirmTextEl = document.getElementById("confirm-text");
const modeEl = document.getElementById("mode");
const topbarEl = document.querySelector(".topbar");

const boardViews = []; // per Board: { el, selectEl, drawn, current, answered, confirmed }
const keyEls = {}; // letter -> button
const keyMarks = {}; // letter -> mark currently painted

let typed = "";
let typedShown = ""; // letters currently painted in the current rows
let selectedBoard = null; // index of the Selected Board, if any
let flashText = "";
let flashTimer = null;

// --- Building ---

function createRow(className) {
  const el = document.createElement("div");
  el.className = "row " + className;
  const tiles = [];
  for (let i = 0; i < WORD_LENGTH; i++) {
    const tile = document.createElement("div");
    tile.className = "tile";
    tiles.push(tile);
    el.appendChild(tile);
  }
  return { el, tiles };
}

function buildBoards() {
  for (let i = 0; i < BOARD_COUNT; i++) {
    const el = document.createElement("section");
    el.className = "board";
    // A real button laid over the Board. Making the Board itself a button
    // would hide its rows' labels from screen readers.
    const selectEl = document.createElement("button");
    selectEl.type = "button";
    selectEl.className = "board-select";
    selectEl.setAttribute("aria-label", "Select Board " + (i + 1));
    selectEl.setAttribute("aria-pressed", "false");
    selectEl.addEventListener("click", () => toggleBoard(i));
    el.appendChild(selectEl);
    boardsEl.appendChild(el);
    boardViews.push({ el, selectEl, drawn: 0, current: null, answered: false });
  }
}

function createKey(key, label, className) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.dataset.key = key;
  button.setAttribute("aria-label", label);
  return button;
}

function buildKeyboard() {
  KEY_ROWS.forEach((letters, rowIndex) => {
    const row = document.createElement("div");
    row.className = rowIndex === 1 ? "key-row offset" : "key-row";
    if (rowIndex === 2) {
      const enter = createKey("enter", "Enter", "key wide");
      enter.textContent = "Enter";
      row.appendChild(enter);
    }
    for (const letter of letters) {
      const button = createKey(letter, letter.toUpperCase(), "key");
      button.textContent = letter;
      keyEls[letter] = button;
      row.appendChild(button);
    }
    if (rowIndex === 2) {
      const backspace = createKey("backspace", "Backspace", "key wide");
      backspace.innerHTML = BACKSPACE_ICON;
      row.appendChild(backspace);
    }
    keyboardEl.appendChild(row);
  });
}

// --- Rendering ---

function paintGuessRow(row, { word, marks }) {
  row.el.className = "row";
  row.el.setAttribute("role", "img");
  row.el.setAttribute("aria-label", word + ": " + marks.join(", "));
  for (let i = 0; i < WORD_LENGTH; i++) {
    row.tiles[i].textContent = word[i];
    row.tiles[i].className = "tile " + marks[i];
  }
}

function appendAnswerRow(view, answer) {
  const row = createRow("answer");
  row.el.setAttribute("role", "img");
  row.el.setAttribute("aria-label", "Answer: " + answer);
  for (let i = 0; i < WORD_LENGTH; i++) row.tiles[i].textContent = answer[i];
  view.el.appendChild(row.el);
  view.answered = true;
}

// Letters already placed correctly on a Board, by position; "" where unknown.
function confirmedLetters(rows) {
  const letters = Array(WORD_LENGTH).fill("");
  for (const { word, marks } of rows) {
    marks.forEach((mark, i) => {
      if (mark === "correct") letters[i] = word[i];
    });
  }
  return letters;
}

// A typed letter wins; otherwise the tile falls back to the faint confirmed one.
function paintCurrentTile(view, i, typedLetter) {
  const tile = view.current.tiles[i];
  tile.textContent = typedLetter || view.confirmed[i];
  tile.classList.toggle("confirmed", !typedLetter && Boolean(view.confirmed[i]));
}

// Brings one Board up to date with the game, drawing only what is new.
function syncBoard(index) {
  const view = boardViews[index];
  const rows = boardRows(game, index);
  for (let r = view.drawn; r < rows.length; r++) {
    const row = view.current || createRow("");
    if (!view.current) view.el.appendChild(row.el);
    view.current = null;
    paintGuessRow(row, rows[r]);
  }
  view.drawn = rows.length;

  const solved = isBoardSolved(game, index);
  view.el.classList.toggle("solved", solved);
  view.el.setAttribute("aria-label", "Board " + (index + 1) + (solved ? ", solved" : ""));
  // A focused button that becomes disabled would swallow the next key press.
  const selectable = game.status === "playing" && !solved;
  if (!selectable && document.activeElement === view.selectEl) view.selectEl.blur();
  view.selectEl.disabled = !selectable;

  if (game.status === "playing" && !solved && !view.current) {
    view.current = createRow("current");
    view.current.el.setAttribute("aria-hidden", "true");
    view.el.appendChild(view.current.el);
    view.confirmed = confirmedLetters(rows);
    for (let i = 0; i < WORD_LENGTH; i++) paintCurrentTile(view, i, "");
  }
  if (game.status === "lost" && !solved && !view.answered) {
    appendAnswerRow(view, game.answers[index]);
  }
}

function renderTyped() {
  for (let i = 0; i < WORD_LENGTH; i++) {
    const letter = typed[i] || "";
    if (letter === (typedShown[i] || "")) continue;
    for (const view of boardViews) {
      if (view.current) paintCurrentTile(view, i, letter);
    }
  }
  typedShown = typed;
  renderTypedValidity();
}

// A full-length Guess the game would reject shows red before it is submitted.
function renderTypedValidity() {
  const invalid = typed.length === WORD_LENGTH && guessRejection(game, typed) !== null;
  boardsEl.classList.toggle("invalid", invalid);
}

function renderKeys() {
  const states = keyStates(game, selectedBoard);
  for (const letter in keyEls) {
    const mark = states[letter] || "";
    if (mark === (keyMarks[letter] || "")) continue;
    keyMarks[letter] = mark;
    keyEls[letter].className = mark ? "key " + mark : "key";
    keyEls[letter].setAttribute("aria-label", letter.toUpperCase() + (mark ? ", " + mark : ""));
  }
}

function solvedCount() {
  let solved = 0;
  for (let i = 0; i < BOARD_COUNT; i++) {
    if (isBoardSolved(game, i)) solved++;
  }
  return solved;
}

// Text for a finished game; renderStatus builds the in-play line itself.
function statusText() {
  const solved = solvedCount();
  if (game.status === "won") return "All " + BOARD_COUNT + " solved in " + game.guesses.length + " guesses";
  return solved + "/" + BOARD_COUNT + " solved";
}

// Zero or fewer Spare Guesses shows in red; below zero not every Board can be solved.
function spareText(spare) {
  return spare < 0 ? "can't win" : spare + " spare";
}

function renderStatus() {
  statusEl.classList.toggle("flash", Boolean(flashText));
  if (flashText || game.status !== "playing") {
    statusEl.textContent = flashText || statusText();
    return;
  }
  // "solved" and "guesses" hide on narrow screens so the spare count still fits.
  const solvedEl = document.createElement("span");
  solvedEl.className = "wide-only";
  solvedEl.textContent = " solved";
  statusEl.textContent = solvedCount() + "/" + BOARD_COUNT;
  statusEl.append(solvedEl);
  const left = GUESS_LIMIT - game.guesses.length;
  const unitEl = document.createElement("span");
  unitEl.className = "wide-only";
  unitEl.textContent = left === 1 ? " guess" : " guesses";
  const spare = spareGuesses(game);
  const spareEl = document.createElement("span");
  spareEl.className = spare <= 0 ? "spare out" : "spare";
  spareEl.textContent = spareText(spare);
  statusEl.append(" · " + left, unitEl, " left · ", spareEl);
}

function clearFlash() {
  clearTimeout(flashTimer);
  flashTimer = null;
  flashText = "";
}

function flashStatus(text) {
  clearFlash();
  flashText = text;
  renderStatus();
  flashTimer = setTimeout(() => {
    clearFlash();
    renderStatus();
  }, FLASH_MS);
}

function shakeCurrentRows() {
  boardsEl.classList.remove("shake");
  void boardsEl.offsetWidth; // restart the animation on repeat rejections
  boardsEl.classList.add("shake");
}

// The strip of page between the top bar and the keyboard.
function visibleArea() {
  return {
    top: topbarEl.getBoundingClientRect().bottom,
    bottom: keyboardEl.getBoundingClientRect().top,
  };
}

// The Board whose current row is on screen, or failing that closest to it.
function nearestCurrentView() {
  const area = visibleArea();
  let nearest = null;
  let nearestDistance = Infinity;
  for (const view of boardViews) {
    if (!view.current) continue;
    const rect = view.current.el.getBoundingClientRect();
    const distance = Math.max(area.top - rect.top, rect.bottom - area.bottom, 0);
    // On a tie the lowest wins: Boards grow downward, so it moves off first.
    if (distance <= nearestDistance) {
      nearest = view;
      nearestDistance = distance;
    }
  }
  return nearest;
}

// Scrolls only as far as needed to bring one Board's current row into view.
function keepCurrentRowInView(view) {
  if (!view || !view.current) return;
  const area = visibleArea();
  const rect = view.current.el.getBoundingClientRect();
  if (rect.bottom > area.bottom) {
    window.scrollBy(0, rect.bottom + REVEAL_MARGIN_PX - area.bottom);
  } else if (rect.top < area.top) {
    window.scrollBy(0, rect.top - REVEAL_MARGIN_PX - area.top);
  }
}

// The Selected Board leads the view; without one, the nearest Board does.
function viewToFollow() {
  return selectedBoard !== null ? boardViews[selectedBoard] : nearestCurrentView();
}

function revealCurrentRow() {
  keepCurrentRowInView(viewToFollow());
}

// --- Selection ---

function paintSelected(index, selected) {
  boardViews[index].el.classList.toggle("selected", selected);
  boardViews[index].selectEl.setAttribute("aria-pressed", String(selected));
}

function selectBoard(index) {
  if (selectedBoard !== null) paintSelected(selectedBoard, false);
  selectedBoard = index;
  if (selectedBoard !== null) paintSelected(selectedBoard, true);
}

function toggleBoard(index) {
  selectBoard(selectedBoard === index ? null : index);
  renderKeys();
}

// After a Guess: a solved Selected Board hands over to the next unsolved one,
// and selection ends with the game.
function advanceSelection() {
  if (selectedBoard === null) return;
  if (game.status !== "playing") selectBoard(null);
  else if (isBoardSolved(game, selectedBoard)) selectBoard(nextUnsolvedBoard(game, selectedBoard));
}

// --- Input ---

function inputLocked() {
  return confirmEl.open || game.status !== "playing";
}

function addLetter(letter) {
  if (inputLocked() || typed.length >= WORD_LENGTH) return;
  typed += letter;
  renderTyped();
}

function removeLetter() {
  if (inputLocked() || typed.length === 0) return;
  typed = typed.slice(0, -1);
  renderTyped();
}

function submitTyped() {
  if (inputLocked()) return;
  // Chosen before the Boards grow, so the view stays on the same Boards.
  const anchor = viewToFollow();
  const result = submitGuess(game, typed);
  if (!result.ok) {
    flashStatus(REJECTION_TEXT[result.reason]);
    shakeCurrentRows();
    revealCurrentRow();
    return;
  }
  typed = "";
  typedShown = "";
  renderTypedValidity();
  clearFlash();
  boardsEl.classList.remove("shake");
  for (let i = 0; i < BOARD_COUNT; i++) syncBoard(i);
  advanceSelection();
  renderKeys();
  renderStatus();
  // Auto-select may have moved the Selected Board somewhere off screen.
  const followed = selectedBoard !== null ? boardViews[selectedBoard] : anchor;
  // The anchor has no current row if this Guess solved it.
  if (followed && followed.current) keepCurrentRowInView(followed);
  else revealCurrentRow();
}

function pressKey(key) {
  if (key === "enter") submitTyped();
  else if (key === "backspace") removeLetter();
  else addLetter(key);
}

function focusIsOnButton() {
  return document.activeElement instanceof HTMLButtonElement;
}

function onKeyDown(event) {
  if (confirmEl.open) {
    if (event.key === "Escape") {
      event.preventDefault();
      confirmEl.close();
    }
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;

  if (event.key === "Enter") {
    // A button reached with Tab keeps its normal Enter behaviour. Clicked
    // buttons never hold focus, so this cannot re-trigger the last click.
    if (focusIsOnButton()) return;
    event.preventDefault();
    if (!event.repeat) submitTyped();
    return;
  }

  const isLetter = /^[a-z]$/i.test(event.key);
  if (!isLetter && event.key !== "Backspace") return;
  if (inputLocked()) return;
  event.preventDefault();
  // Typing means the player has left any Tab-focused button behind, so the
  // Enter that follows must submit rather than press that button.
  if (focusIsOnButton()) document.activeElement.blur();
  if (isLetter) addLetter(event.key.toLowerCase());
  else removeLetter();
}

// --- New games ---

function startNewGame() {
  game = createGame({ words: WORDS, commonCount: COMMON_COUNT, answerCount: ANSWER_COUNT }, mode);
  typed = "";
  typedShown = "";
  renderTypedValidity();
  selectBoard(null);
  clearFlash();
  boardsEl.classList.remove("shake");
  for (let i = 0; i < BOARD_COUNT; i++) {
    const view = boardViews[i];
    view.el.replaceChildren(view.selectEl);
    view.drawn = 0;
    view.current = null;
    view.answered = false;
    syncBoard(i);
  }
  renderKeys();
  renderStatus();
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  window.scrollTo(0, 0);
}

// A new game only needs confirming once a Guess has been made in a game
// that is still being played.
function progressAtRisk() {
  return game.guesses.length > 0 && game.status === "playing";
}

function onRefresh() {
  if (progressAtRisk()) {
    pendingMode = null;
    confirmTextEl.textContent = REFRESH_CONFIRM_TEXT;
    confirmEl.showModal();
  } else {
    startNewGame();
  }
}

// --- Mode ---

// Blocked or broken storage falls back to Easy.
function loadMode() {
  try {
    return localStorage.getItem(MODE_KEY) === "hard" ? "hard" : "easy";
  } catch {
    return "easy";
  }
}

function saveMode() {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Storage is blocked; the Mode lasts until the page is reloaded.
  }
}

function renderMode() {
  for (const button of modeEl.querySelectorAll("button[data-mode]")) {
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  }
}

function switchMode(next) {
  mode = next;
  saveMode();
  renderMode();
  startNewGame();
}

function onModeChosen(next) {
  if (next === mode) return;
  if (progressAtRisk()) {
    pendingMode = next;
    confirmTextEl.textContent =
      "Switch to " + MODE_NAMES[next] + "? This starts a new game and your progress will be lost";
    confirmEl.showModal();
  } else {
    switchMode(next);
  }
}

// --- Wiring ---

// Stops a mouse press or tap from moving focus onto the control at all.
function keepFocusOff(event) {
  event.preventDefault();
}

buildBoards();
buildKeyboard();

boardsEl.addEventListener("mousedown", keepFocusOff);
keyboardEl.addEventListener("mousedown", keepFocusOff);
keyboardEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-key]");
  if (button) pressKey(button.dataset.key);
});
refreshEl.addEventListener("mousedown", keepFocusOff);
refreshEl.addEventListener("click", onRefresh);
modeEl.addEventListener("mousedown", keepFocusOff);
modeEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-mode]");
  if (button) onModeChosen(button.dataset.mode);
});
// A press on the backdrop or dialog text would pull focus off the buttons.
confirmEl.addEventListener("mousedown", (event) => {
  if (!event.target.closest("button")) event.preventDefault();
});
boardsEl.addEventListener("animationend", () => boardsEl.classList.remove("shake"));
document.getElementById("confirm-cancel").addEventListener("click", () => confirmEl.close());
document.getElementById("confirm-new").addEventListener("click", () => {
  const next = pendingMode;
  confirmEl.close();
  if (next) switchMode(next);
  else startNewGame();
});
// Closing the dialog hands focus back to Refresh or the Mode switch; drop it
// so the next physical Enter submits the typed Guess instead of reopening it.
confirmEl.addEventListener("close", () => {
  pendingMode = null;
  if (focusIsOnButton()) document.activeElement.blur();
});
document.addEventListener("keydown", onKeyDown);

mode = loadMode();
renderMode();
startNewGame();
