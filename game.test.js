const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const {
  BOARD_COUNT,
  GUESS_LIMIT,
  scoreGuess,
  drawAnswers,
  createGame,
  guessRejection,
  submitGuess,
  boardRows,
  isBoardSolved,
  nextUnsolvedBoard,
  keyStates,
  spareGuesses,
} = require("./game.js");

// --- Fixtures -------------------------------------------------------------

// Filler words use only v-z, so they never share a letter with the named
// words used in the tests below.
function fillerWords(count) {
  const letters = "vwxyz";
  const words = [];
  for (let i = 0; i < count; i++) {
    let word = "";
    let rest = i;
    for (let p = 0; p < 5; p++) {
      word += letters[rest % 5];
      rest = Math.floor(rest / 5);
    }
    words.push(word);
  }
  return words;
}

const LIST_SIZE = 100;

// A Word List whose Word Numbers 1..32 are the given Answers followed by
// filler, then the extra words, then more filler up to LIST_SIZE.
function makeWordList(answers = [], extras = []) {
  const filler = fillerWords(LIST_SIZE);
  const head = answers.concat(filler.splice(0, BOARD_COUNT - answers.length));
  const all = head.concat(extras, filler).slice(0, LIST_SIZE);
  return all.map((w, i) => ({ n: i + 1, w }));
}

// A random function whose output maps to the given Word Numbers in turn.
function randomFor(numbers, highest) {
  let i = 0;
  const random = () => {
    assert.ok(i < numbers.length, "random called more often than expected");
    return (numbers[i++] - 0.5) / highest;
  };
  random.calls = () => i;
  return random;
}

function range(from, to) {
  const out = [];
  for (let n = from; n <= to; n++) out.push(n);
  return out;
}

// A Word List with its two boundaries; both default to every entry.
function listOf(words, commonCount = words.length, answerCount = commonCount) {
  return { words, commonCount, answerCount };
}

// A game whose Answers are exactly Word Numbers 1..32 of the list, in order.
function gameWith(answers = [], extras = []) {
  const words = makeWordList(answers, extras);
  const game = createGame(listOf(words), "easy", randomFor(range(1, BOARD_COUNT), words.length));
  return { game, words };
}

// Words from the list that are not Answers in a gameWith() game.
function wrongGuesses(words, count) {
  return words.slice(BOARD_COUNT, BOARD_COUNT + count).map((e) => e.w);
}

function play(game, guesses) {
  for (const guess of guesses) {
    assert.deepStrictEqual(submitGuess(game, guess), { ok: true }, `guess ${guess}`);
  }
}

// --- Constants and loading ------------------------------------------------

test("constants match the game's shape", () => {
  assert.strictEqual(BOARD_COUNT, 32);
  assert.strictEqual(GUESS_LIMIT, 37);
});

test("game.js runs as a classic script with no module object and no DOM", () => {
  const source = fs.readFileSync(path.join(__dirname, "game.js"), "utf8");
  const context = vm.createContext({});
  vm.runInContext(source, context);
  const result = vm.runInContext(
    `(() => {
      const words = [];
      for (let n = 1; n <= 40; n++) {
        words.push({ n, w: "aaa" + String.fromCharCode(96 + Math.ceil(n / 26)) + String.fromCharCode(97 + (n % 26)) });
      }
      const game = createGame({ words, commonCount: 40, answerCount: 40 }, "easy");
      const accepted = submitGuess(game, words[0].w).ok;
      return JSON.stringify({
        boards: BOARD_COUNT, limit: GUESS_LIMIT, answers: game.answers.length, accepted,
        rows: boardRows(game, 0).length, solved: typeof isBoardSolved(game, 0),
        keys: typeof keyStates(game), marks: scoreGuess("speed", "abide").length,
        draw: drawAnswers(words, 2).length
      });
    })()`,
    context
  );
  assert.deepStrictEqual(JSON.parse(result), {
    boards: 32,
    limit: 37,
    answers: 32,
    accepted: true,
    rows: 1,
    solved: "boolean",
    keys: "object",
    marks: 5,
    draw: 2,
  });
});

// --- scoreGuess -----------------------------------------------------------

test("scoreGuess: the worked example", () => {
  assert.deepStrictEqual(scoreGuess("speed", "abide"), [
    "absent",
    "absent",
    "present",
    "absent",
    "present",
  ]);
});

test("scoreGuess: all correct and all absent", () => {
  assert.deepStrictEqual(scoreGuess("crane", "crane"), Array(5).fill("correct"));
  assert.deepStrictEqual(scoreGuess("fuzzy", "crane"), Array(5).fill("absent"));
});

test("scoreGuess: a repeated guess letter gets only as many marks as the answer has copies", () => {
  assert.deepStrictEqual(scoreGuess("geese", "those"), [
    "absent",
    "absent",
    "absent",
    "correct",
    "correct",
  ]);
});

test("scoreGuess: an exact match later in the word outranks an earlier present", () => {
  assert.deepStrictEqual(scoreGuess("eerie", "crane"), [
    "absent",
    "absent",
    "present",
    "absent",
    "correct",
  ]);
});

test("scoreGuess: present marks go left to right and stop when copies run out", () => {
  assert.deepStrictEqual(scoreGuess("otter", "tepid"), [
    "absent",
    "present",
    "absent",
    "present",
    "absent",
  ]);
});

test("scoreGuess: a letter repeated in the answer can be matched twice", () => {
  assert.deepStrictEqual(scoreGuess("abbey", "babes"), [
    "present",
    "present",
    "correct",
    "correct",
    "absent",
  ]);
});

test("scoreGuess: repeated letters in both guess and answer", () => {
  assert.deepStrictEqual(scoreGuess("sassy", "essay"), [
    "present",
    "present",
    "correct",
    "absent",
    "correct",
  ]);
});

// --- drawAnswers ----------------------------------------------------------

test("drawAnswers: defaults to 32 different words from the list", () => {
  const words = makeWordList();
  const drawn = drawAnswers(words);
  const known = new Set(words.map((e) => e.w));
  assert.strictEqual(drawn.length, 32);
  assert.strictEqual(new Set(drawn).size, 32);
  assert.ok(drawn.every((w) => typeof w === "string" && known.has(w)));
});

test("drawAnswers: can draw every entry of a list exactly as long as count", () => {
  const words = makeWordList().slice(0, 32);
  const drawn = drawAnswers(words);
  assert.deepStrictEqual([...drawn].sort(), words.map((e) => e.w).sort());
});

test("drawAnswers: draws again when a number repeats", () => {
  const words = makeWordList().slice(0, 5);
  const random = randomFor([3, 3, 1, 3, 2], words.length);
  assert.deepStrictEqual(drawAnswers(words, 3, random), [words[2].w, words[0].w, words[1].w]);
  assert.strictEqual(random.calls(), 5);
});

test("drawAnswers: the number range reaches 1 and the highest Word Number", () => {
  const words = makeWordList().slice(0, 10);
  assert.deepStrictEqual(drawAnswers(words, 1, () => 0), [words[0].w]);
  assert.deepStrictEqual(drawAnswers(words, 1, () => 0.999999), [words[9].w]);
});

test("drawAnswers: looks entries up by Word Number, not array position", () => {
  const words = [
    { n: 3, w: "three" },
    { n: 1, w: "first" },
    { n: 2, w: "other" },
  ];
  assert.deepStrictEqual(drawAnswers(words, 3, randomFor([1, 2, 3], 3)), ["first", "other", "three"]);
  assert.deepStrictEqual(drawAnswers(words, 1, () => 0.999), ["three"]);
});

test("drawAnswers: throws when count exceeds the entries", () => {
  const words = makeWordList().slice(0, 4);
  assert.throws(() => drawAnswers(words, 5, () => 0));
  assert.throws(() => drawAnswers(makeWordList().slice(0, 31)));
});

// --- createGame -----------------------------------------------------------

test("createGame: starts playing with 32 different Answers and no guesses", () => {
  const words = makeWordList();
  const game = createGame(listOf(words), "easy");
  assert.strictEqual(game.status, "playing");
  assert.deepStrictEqual(game.guesses, []);
  assert.strictEqual(game.answers.length, 32);
  assert.strictEqual(new Set(game.answers).size, 32);
});

test("createGame: uses the injected random function", () => {
  const { game, words } = gameWith();
  assert.deepStrictEqual(game.answers, words.slice(0, 32).map((e) => e.w));
});

test("createGame: throws with fewer than 32 words", () => {
  assert.throws(() => createGame(listOf(makeWordList().slice(0, 31)), "easy", () => 0));
});

// A 100-word list: 40 Common, 30 Uncommon, 30 Guess-only.
const TIERED = listOf(makeWordList(), 40, 70);

// Word Numbers drawn across many games, using the real random function.
function numbersDrawn(list, mode, games = 200) {
  const numberOf = new Map(list.words.map((e) => [e.w, e.n]));
  const seen = new Set();
  for (let i = 0; i < games; i++) {
    for (const answer of createGame(list, mode).answers) seen.add(numberOf.get(answer));
  }
  return seen;
}

test("createGame: Easy only draws Word Numbers from 1 to the Common count", () => {
  const seen = numbersDrawn(TIERED, "easy");
  assert.ok(Math.max(...seen) <= 40);
  assert.ok(seen.has(1) && seen.has(40));
});

test("createGame: Easy's injected random maps onto 1..Common count", () => {
  const game = createGame(TIERED, "easy", randomFor([40].concat(range(1, 31)), 40));
  assert.strictEqual(game.answers[0], TIERED.words[39].w);
});

test("createGame: Hard draws up to the Answer count and reaches both ends", () => {
  const seen = numbersDrawn(TIERED, "hard");
  assert.ok(Math.max(...seen) <= 70);
  assert.ok(seen.has(1) && seen.has(70));
  assert.ok([...seen].some((n) => n > 40), "Hard reaches Uncommon words");
});

test("createGame: Hard's injected random maps onto 1..Answer count", () => {
  const numbers = [1, 70].concat(range(2, 31));
  const game = createGame(TIERED, "hard", randomFor(numbers, 70));
  assert.strictEqual(game.answers[0], TIERED.words[0].w);
  assert.strictEqual(game.answers[1], TIERED.words[69].w);
});

test("createGame: neither Mode draws a Guess-only word", () => {
  for (const mode of ["easy", "hard"]) {
    assert.ok(Math.max(...numbersDrawn(TIERED, mode)) <= 70, mode);
  }
});

test("createGame: Guess-only words are accepted as Guesses in both Modes", () => {
  for (const mode of ["easy", "hard"]) {
    const game = createGame(TIERED, mode);
    const guessOnly = TIERED.words.find((e) => e.n === 100).w;
    assert.deepStrictEqual(submitGuess(game, guessOnly), { ok: true }, mode);
  }
});

test("createGame: throws when a Mode's pool is smaller than 32 words", () => {
  const smallCommon = listOf(makeWordList(), 31, 70);
  assert.throws(() => createGame(smallCommon, "easy"));
  assert.doesNotThrow(() => createGame(smallCommon, "hard"));
  assert.throws(() => createGame(listOf(makeWordList(), 31, 31), "hard"));
});

test("createGame: throws on an unknown Mode", () => {
  assert.throws(() => createGame(TIERED, "medium"));
});

// --- submitGuess: rejections ----------------------------------------------

function assertRejected(game, guess, reason) {
  const before = { guesses: [...game.guesses], status: game.status };
  assert.deepStrictEqual(submitGuess(game, guess), { ok: false, reason }, `guess ${guess}`);
  assert.deepStrictEqual(game.guesses, before.guesses);
  assert.strictEqual(game.status, before.status);
}

test("submitGuess: rejects the wrong length and uses no guess", () => {
  const { game } = gameWith();
  for (const guess of ["", "abcd", "abcdef"]) assertRejected(game, guess, "length");
  assert.strictEqual(game.guesses.length, 0);
});

test("submitGuess: rejects a non-string as length", () => {
  const { game } = gameWith();
  for (const guess of [undefined, null, 12345]) assertRejected(game, guess, "length");
});

test("submitGuess: rejects a 5-letter word outside the Word List and uses no guess", () => {
  const { game } = gameWith();
  assertRejected(game, "qqqqq", "not-in-list");
  assert.strictEqual(game.guesses.length, 0);
});

test("submitGuess: rejects a repeat, ignoring case, and uses no guess", () => {
  const { game, words } = gameWith();
  const [word] = wrongGuesses(words, 1);
  play(game, [word]);
  assertRejected(game, word, "repeat");
  assertRejected(game, word.toUpperCase(), "repeat");
  assert.deepStrictEqual(game.guesses, [word]);
});

test("guessRejection: names the reason submitGuess would give, without changing the game", () => {
  const { game, words } = gameWith(["crane"]);
  const [word] = wrongGuesses(words, 1);
  assert.strictEqual(guessRejection(game, "cra"), "length");
  assert.strictEqual(guessRejection(game, "qqqqq"), "not-in-list");
  assert.strictEqual(guessRejection(game, word), null);
  assert.strictEqual(guessRejection(game, "CRANE"), null);
  assert.deepStrictEqual(game.guesses, []);
  play(game, [word]);
  assert.strictEqual(guessRejection(game, word), "repeat");
});

test("submitGuess: lowercases before checking and stores lowercase", () => {
  const { game } = gameWith(["crane"]);
  assert.deepStrictEqual(submitGuess(game, "CrAnE"), { ok: true });
  assert.deepStrictEqual(game.guesses, ["crane"]);
  assert.strictEqual(isBoardSolved(game, 0), true);
});

test("submitGuess: a rejected guess does not affect any Board", () => {
  const { game } = gameWith(["crane"]);
  assertRejected(game, "qqqqq", "not-in-list");
  assert.strictEqual(isBoardSolved(game, 0), false);
  assert.deepStrictEqual(boardRows(game, 0), []);
});

// --- Boards ---------------------------------------------------------------

test("a guess applies to every unsolved Board with that Board's own marks", () => {
  const { game } = gameWith(["crane", "bacon"], ["cabin"]);
  play(game, ["cabin"]);
  for (let board = 0; board < BOARD_COUNT; board++) {
    assert.deepStrictEqual(boardRows(game, board), [
      { word: "cabin", marks: scoreGuess("cabin", game.answers[board]) },
    ]);
  }
  assert.notDeepStrictEqual(boardRows(game, 0)[0].marks, boardRows(game, 1)[0].marks);
});

test("isBoardSolved: false until the Answer is guessed, then true for that Board only", () => {
  const { game } = gameWith(["crane", "bacon"], ["cabin"]);
  assert.strictEqual(isBoardSolved(game, 0), false);
  play(game, ["cabin"]);
  assert.strictEqual(isBoardSolved(game, 0), false);
  play(game, ["crane"]);
  assert.strictEqual(isBoardSolved(game, 0), true);
  assert.strictEqual(isBoardSolved(game, 1), false);
});

test("a solved Board stops receiving guesses and its rows end at the solving guess", () => {
  const { game } = gameWith(["crane", "bacon"], ["cabin", "cloth"]);
  play(game, ["cabin", "crane", "cloth"]);
  assert.deepStrictEqual(
    boardRows(game, 0).map((row) => row.word),
    ["cabin", "crane"]
  );
  assert.deepStrictEqual(boardRows(game, 0)[1].marks, Array(5).fill("correct"));
  assert.deepStrictEqual(
    boardRows(game, 1).map((row) => row.word),
    ["cabin", "crane", "cloth"]
  );
});

// --- Game end -------------------------------------------------------------

test("winning on an earlier guess leaves the remaining guesses unused", () => {
  const { game, words } = gameWith();
  const answers = [...game.answers];
  play(game, wrongGuesses(words, 1));
  play(game, answers.slice(0, 31));
  assert.strictEqual(game.status, "playing");
  play(game, answers.slice(31));
  assert.strictEqual(game.status, "won");
  assert.strictEqual(game.guesses.length, 33);
});

test("winning exactly on guess 37 is a win, not a loss", () => {
  const { game, words } = gameWith();
  const answers = [...game.answers];
  play(game, wrongGuesses(words, 5));
  play(game, answers.slice(0, 31));
  assert.strictEqual(game.guesses.length, 36);
  assert.strictEqual(game.status, "playing");
  play(game, answers.slice(31));
  assert.strictEqual(game.guesses.length, GUESS_LIMIT);
  assert.strictEqual(game.status, "won");
});

test("losing after 37 guesses with no Board solved", () => {
  const { game, words } = gameWith();
  const wrong = wrongGuesses(words, GUESS_LIMIT);
  play(game, wrong.slice(0, 36));
  assert.strictEqual(game.status, "playing");
  play(game, wrong.slice(36));
  assert.strictEqual(game.status, "lost");
  assert.strictEqual(game.guesses.length, GUESS_LIMIT);
});

test("losing on guess 37 with one Board still unsolved", () => {
  const { game, words } = gameWith();
  play(game, game.answers.slice(0, 31));
  play(game, wrongGuesses(words, 6));
  assert.strictEqual(game.guesses.length, GUESS_LIMIT);
  assert.strictEqual(game.status, "lost");
  assert.strictEqual(isBoardSolved(game, 31), false);
});

test("no guess is accepted after a win, and over outranks other reasons", () => {
  const { game, words } = gameWith();
  const answers = [...game.answers];
  play(game, answers);
  const [spare] = wrongGuesses(words, 1);
  assertRejected(game, spare, "over");
  assertRejected(game, "abc", "over");
  assertRejected(game, "qqqqq", "over");
  assertRejected(game, answers[0], "over");
  assert.strictEqual(game.status, "won");
  assert.strictEqual(game.guesses.length, 32);
});

test("no guess is accepted after a loss, even an unsolved Board's Answer", () => {
  const { game, words } = gameWith();
  play(game, wrongGuesses(words, GUESS_LIMIT));
  assertRejected(game, game.answers[0], "over");
  assert.strictEqual(game.status, "lost");
  assert.strictEqual(game.guesses.length, GUESS_LIMIT);
  assert.strictEqual(isBoardSolved(game, 0), false);
});

// --- nextUnsolvedBoard ----------------------------------------------------

test("nextUnsolvedBoard: picks the Board after the given one", () => {
  const { game } = gameWith(["crane", "cloth", "bingo"]);
  assert.strictEqual(nextUnsolvedBoard(game, 0), 1);
});

test("nextUnsolvedBoard: skips solved Boards", () => {
  const { game } = gameWith(["crane", "cloth", "bingo"]);
  play(game, ["cloth"]);
  assert.strictEqual(nextUnsolvedBoard(game, 0), 2);
});

test("nextUnsolvedBoard: wraps past the last Board", () => {
  const { game } = gameWith(["crane", "cloth"]);
  assert.strictEqual(nextUnsolvedBoard(game, BOARD_COUNT - 1), 0);
  play(game, ["crane"]);
  assert.strictEqual(nextUnsolvedBoard(game, BOARD_COUNT - 1), 1);
});

test("nextUnsolvedBoard: null when no other Board is unsolved", () => {
  const { game } = gameWith();
  play(game, game.answers.slice(0, BOARD_COUNT - 1));
  assert.strictEqual(nextUnsolvedBoard(game, BOARD_COUNT - 1), null);
});

// --- keyStates ------------------------------------------------------------

test("keyStates: a Selected Board's marks are the only ones that count", () => {
  const { game } = gameWith(["crane", "cloth"], ["chart"]);
  play(game, ["chart"]);
  assert.deepStrictEqual(keyStates(game, 0), {
    c: "correct",
    h: "absent",
    a: "correct",
    r: "present",
    t: "absent",
  });
  assert.deepStrictEqual(keyStates(game, 1), {
    c: "correct",
    h: "present",
    a: "absent",
    r: "absent",
    t: "present",
  });
});

test("keyStates: Board 0 can be the Selected Board without meaning all Boards", () => {
  const { game } = gameWith(["crane", "cloth"], ["hotel"]);
  play(game, ["hotel"]);
  assert.strictEqual(keyStates(game, 0).h, "absent");
  assert.strictEqual(keyStates(game).h, "present");
});

test("keyStates: empty before any guess", () => {
  const { game } = gameWith();
  assert.deepStrictEqual(keyStates(game), {});
});

test("keyStates: correct outranks present outranks absent across Boards", () => {
  const { game } = gameWith(["crane", "bacon"], ["cabin"]);
  play(game, ["cabin"]);
  assert.deepStrictEqual(keyStates(game), {
    c: "correct", // correct on crane, present on bacon
    a: "correct", // present on crane, correct on bacon
    b: "present", // absent on crane, present on bacon
    i: "absent",
    n: "correct", // present on crane, correct on bacon
  });
});

test("keyStates: a repeated letter takes its best mark within a guess", () => {
  const { game } = gameWith(["abide"], ["speed"]);
  play(game, ["speed"]);
  assert.deepStrictEqual(keyStates(game), {
    s: "absent",
    p: "absent",
    e: "present",
    d: "present",
  });
});

test("keyStates: a letter keeps its best mark across earlier guesses", () => {
  const { game } = gameWith(["crane"], ["cloth", "scent"]);
  play(game, ["cloth", "scent"]);
  // c is correct in "cloth" and only present in "scent".
  assert.strictEqual(keyStates(game).c, "correct");
});

test("keyStates: leaves out letters never guessed", () => {
  const { game } = gameWith(["crane"], ["cloth"]);
  play(game, ["cloth"]);
  const states = keyStates(game);
  assert.deepStrictEqual(Object.keys(states).sort(), ["c", "h", "l", "o", "t"]);
  assert.ok(!("r" in states));
});

test("keyStates: solved Boards no longer count", () => {
  const { game } = gameWith(["crane", "bacon"], ["cabin"]);
  play(game, ["cabin", "crane"]);
  assert.deepStrictEqual(keyStates(game), {
    c: "present", // correct only on the solved crane; present on bacon
    a: "correct", // correct on bacon
    b: "present",
    i: "absent",
    n: "correct", // correct on bacon, from "cabin"
    r: "absent", // matched only on the solved crane
    e: "absent", // matched only on the solved crane
  });
});

test("keyStates: letters whose only matches were on solved Boards become absent", () => {
  const { game } = gameWith(["crane", "bacon"], ["cabin"]);
  play(game, ["cabin", "crane", "bacon"]);
  const states = keyStates(game);
  assert.deepStrictEqual(Object.keys(states).sort(), ["a", "b", "c", "e", "i", "n", "o", "r"]);
  assert.ok(Object.values(states).every((state) => state === "absent"));
});

test("keyStates: every guessed letter is absent once every Board is solved", () => {
  const { game, words } = gameWith(["crane", "bacon"]);
  const wrong = wrongGuesses(words, 1);
  const answers = [...game.answers];
  play(game, wrong);
  play(game, answers);
  assert.strictEqual(game.status, "won");
  const guessed = new Set([...wrong, ...answers].join(""));
  const states = keyStates(game);
  assert.deepStrictEqual(Object.keys(states).sort(), [...guessed].sort());
  assert.ok(Object.values(states).every((state) => state === "absent"));
});

test("keyStates: unsolved Boards still count after a loss", () => {
  const { game, words } = gameWith(["crane"], ["cloth"]);
  play(game, ["cloth"]);
  play(game, wrongGuesses(words, GUESS_LIMIT).slice(1));
  assert.strictEqual(game.status, "lost");
  assert.strictEqual(keyStates(game).c, "correct");
});

// --- Spare Guesses --------------------------------------------------------

test("spareGuesses: a new game has the Guess Limit minus one Guess per Board", () => {
  const { game } = gameWith();
  assert.strictEqual(spareGuesses(game), GUESS_LIMIT - BOARD_COUNT);
});

test("spareGuesses: a Guess that solves a Board costs nothing", () => {
  const { game } = gameWith(["crane"]);
  play(game, ["crane"]);
  assert.strictEqual(spareGuesses(game), GUESS_LIMIT - BOARD_COUNT);
});

test("spareGuesses: a Guess that solves nothing costs one", () => {
  const { game, words } = gameWith();
  play(game, wrongGuesses(words, 3));
  assert.strictEqual(spareGuesses(game), GUESS_LIMIT - BOARD_COUNT - 3);
});

test("spareGuesses: goes below zero once every Board can no longer be solved", () => {
  const { game, words } = gameWith();
  play(game, wrongGuesses(words, GUESS_LIMIT - BOARD_COUNT + 2));
  assert.strictEqual(game.status, "playing");
  assert.strictEqual(spareGuesses(game), -2);
});
