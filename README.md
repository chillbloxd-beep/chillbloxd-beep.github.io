# Blackjack (TypeScript + PixiJS + Matter.js)

A browser blackjack game implementing casino-style rules with:

- PixiJS rendering
- Matter.js-driven card movement physics
- Skippable in-game tutorial overlay on launch

## Rules implemented

- 6-deck shoe (auto reshuffle near 75% penetration)
- Dealer stands on soft 17
- Blackjack pays 3:2
- Dealer peek on Ace/10-value upcard
- Insurance (2:1)
- Late surrender (first decision only, non-split hand)
- Split pairs up to 4 total hands
- Double down including after split
- Split aces receive one card each

## Run

```bash
npm install
npm run dev
```

## Test

```bash
npm test
```

## Put this code directly on `main` (no feature branch)

```bash
# from this repo

git checkout -B main
# if a remote already exists:
# git remote set-url origin <your-repo-url>
# otherwise:
# git remote add origin <your-repo-url>

git push -u origin main --force-with-lease
```

This publishes the current code directly to `main` instead of opening a branch PR.
