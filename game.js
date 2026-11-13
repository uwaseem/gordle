// Gordle game logic: 32 Boards, 37 shared Guesses. See GLOSSARY.md for terms.
// Loads as a classic browser script and in Node. No DOM access.

const BOARD_COUNT = 32;
const GUESS_LIMIT = 37;

// Marks a Guess against an Answer: exact matches first, then "present" left
// to right while unmatched copies of the letter remain in the Answer.
function scoreGuess(guess, answer) {
  const marks = ["absent", "absent", "absent", "absent", "absent"];
  const unmatched = {};
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) {
      marks[i] = "correct";
    } else {
      unmatched[answer[i]] = (unmatched[answer[i]] || 0) + 1;
    }
  }
  for (let i = 0; i < 5; i++) {
    if (marks[i] !== "correct" && unmatched[guess[i]] > 0) {
      marks[i] = "present";
      unmatched[guess[i]]--;
    }
  }
  return marks;
}

// The Draw: picks random Word Numbers from 1 to the highest allowed (by
// default the highest in the list), drawing again whenever a number was
// already picked.
function drawAnswers(words, count = BOARD_COUNT, random = Math.random, highest = null) {
  const wordsByNumber = new Map();
  let top = 0;
  for (const entry of words) {
    wordsByNumber.set(entry.n, entry.w);
    if (entry.n > top) top = entry.n;
  }
  if (highest === null) highest = top;
  let pool = 0;
  for (const entry of words) {
    if (entry.n <= highest) pool++;
  }
  if (count > pool) {
    throw new Error(`Cannot draw ${count} Answers from ${pool} words`);
  }
  const picked = new Set();
  const answers = [];
  while (answers.length < count) {
    const number = Math.floor(random() * highest) + 1;
    if (picked.has(number)) continue;
    picked.add(number);
    answers.push(wordsByNumber.get(number));
  }
  return answers;
}

// A Mode's highest Answer Word Number: Easy stops at the Common count, Hard
// at the Answer count. Words above the Answer count are Guess-only.
function highestAnswer(wordList, mode) {
  if (mode === "easy") return wordList.commonCount;
  if (mode === "hard") return wordList.answerCount;
  throw new Error(`Unknown Mode: ${mode}`);
}

// wordList is { words, commonCount, answerCount }; mode is "easy" or "hard".
function createGame(wordList, mode, random = Math.random) {
  const { words } = wordList;
  return {
    answers: drawAnswers(words, BOARD_COUNT, random, highestAnswer(wordList, mode)),
    guesses: [],
    status: "playing",
    wordList: new Set(words.map((entry) => entry.w)),
  };
}

function isBoardSolved(game, boardIndex) {
  return game.guesses.includes(game.answers[boardIndex]);
}

// Why a Guess would be rejected, or null if it would be accepted. Checks run
// in this order: over, length, not-in-list, repeat. Changes nothing.
function guessRejection(game, guess) {
  if (game.status !== "playing") return "over";
  if (typeof guess !== "string" || guess.length !== 5) return "length";
  const word = guess.toLowerCase();
  if (!game.wordList.has(word)) return "not-in-list";
  if (game.guesses.includes(word)) return "repeat";
  return null;
}

// Rejected Guesses change nothing.
function submitGuess(game, guess) {
  const reason = guessRejection(game, guess);
  if (reason) return { ok: false, reason };

  const word = guess.toLowerCase();
  game.guesses.push(word);
  if (game.answers.every((answer) => game.guesses.includes(answer))) {
    game.status = "won";
  } else if (game.guesses.length >= GUESS_LIMIT) {
    game.status = "lost";
  }
  return { ok: true };
}

// A Board's rows end at the Guess that solved it.
function boardRows(game, boardIndex) {
  const answer = game.answers[boardIndex];
  const rows = [];
  for (const word of game.guesses) {
    rows.push({ word, marks: scoreGuess(word, answer) });
    if (word === answer) break;
  }
  return rows;
}

// Spare Guesses: Guesses left after setting aside one for each unsolved Board.
// Only a Guess that solves nothing lowers it. Below zero, some Board must stay
// unsolved.
function spareGuesses(game) {
  let unsolved = 0;
  for (let board = 0; board < game.answers.length; board++) {
    if (!isBoardSolved(game, board)) unsolved++;
  }
  return GUESS_LIMIT - game.guesses.length - unsolved;
}

// The Selected Board's replacement once it is solved: the next unsolved Board
// in reading order, wrapping past the last. Null when none is left.
function nextUnsolvedBoard(game, boardIndex) {
  const count = game.answers.length;
  for (let step = 1; step < count; step++) {
    const board = (boardIndex + step) % count;
    if (!isBoardSolved(game, board)) return board;
  }
  return null;
}

// Every guessed letter starts "absent"; only unsolved Boards can raise it.
// With a Selected Board, it is the only Board that counts.
function keyStates(game, selectedBoard = null) {
  const states = {};
  for (const word of game.guesses) {
    for (const letter of word) states[letter] = "absent";
  }
  for (let board = 0; board < game.answers.length; board++) {
    if (selectedBoard !== null && board !== selectedBoard) continue;
    if (isBoardSolved(game, board)) continue;
    for (const { word, marks } of boardRows(game, board)) {
      for (let i = 0; i < 5; i++) {
        if (marks[i] === "correct") {
          states[word[i]] = "correct";
        } else if (marks[i] === "present" && states[word[i]] !== "correct") {
          states[word[i]] = "present";
        }
      }
    }
  }
  return states;
}

if (typeof module !== "undefined") module.exports = { BOARD_COUNT, GUESS_LIMIT, scoreGuess, drawAnswers, createGame, guessRejection, submitGuess, boardRows, isBoardSolved, nextUnsolvedBoard, keyStates, spareGuesses };
