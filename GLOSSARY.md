# Gordle

A word-guessing game played across 32 hidden words at once, with one shared set of guesses.

## Language

**Word List**:
The numbered set of every 5-letter word the game recognises, held in random order. Obscure and offensive words are not part of it, and every word in it can be an Answer.
_Avoid_: Dictionary, word bank

**Word Number**:
The unique number that identifies one word in the Word List.
_Avoid_: Index, ID

**Board**:
One of the 32 grids in a game, each hiding a single Answer.
_Avoid_: Grid, puzzle

**Selected Board**:
The one unsolved Board the player has picked, if any, whose results alone colour the keyboard. Guesses still go to every unsolved Board.
_Avoid_: Active board, focused board, clicked board

**Answer**:
The word hidden on a Board. No two Boards in a game share an Answer.
_Avoid_: Solution, target

**Guess**:
A 5-letter word from the Word List submitted against every unsolved Board at once.
_Avoid_: Try, attempt

**Guess Limit**:
The 37 Guesses shared across all Boards in a game.
_Avoid_: Lives

**Spare Guesses**:
The Guesses left after setting aside one for each unsolved Board: the Guess Limit minus Guesses made minus unsolved Boards. A Guess that solves a Board leaves it unchanged; one that solves nothing lowers it by one. Below zero, not every Board can be solved, so the game can't be won.
_Avoid_: Wrong chances, mistakes left

**Draw**:
The random selection of Word Numbers that chooses a game's 32 Answers.
_Avoid_: Shuffle

**Refresh**:
Abandoning the current game through the on-page button and starting a new one with a fresh Draw.
_Avoid_: Reset, restart

**Reload**:
Using the browser's own reload, which also starts a new game with a fresh Draw.
