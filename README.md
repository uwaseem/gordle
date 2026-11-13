# Gordle

A word-guessing game played across 32 hidden words at once, with one shared set of 37 guesses.

Inspired by [Wordle](https://www.nytimes.com/games/wordle/) and [Duotrigordle](https://duotrigordle.com/), which already plays Wordle across 32 boards at once. This is my own version, built from scratch. It isn't affiliated with or endorsed by either.

Words come from the public-domain ENABLE word list. Word frequency scores come from [wordfreq](https://github.com/rspeer/wordfreq) by Robyn Speer, whose data is licensed under [CC-BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

**Play it:** https://uwaseem.github.io/gordle/

## How it works

- Every guess is a 5-letter word, and it goes to all unsolved boards at once.
- Each board shows the usual colours: green for the right letter in the right spot, yellow for a letter that's in the word but elsewhere, grey for a letter that isn't in it.
- Solve all 32 boards within 37 guesses to win.
- Tap a board to select it. The keyboard then shows colours for that board only.

## Run it locally

No build step and no dependencies. Open `index.html` in a browser.

## Tests

The game logic in `game.js` and the shipped Word List in `words.js` have tests that use Node's built-in test runner:

```bash
node --test
```

## License

[MIT](LICENSE)
