# Blackjack Royale (TypeScript + PixiJS + Matter.js)

A browser blackjack game with a premium mobile-game style UI:

- Cinematic table HUD with modern control panel
- PixiJS rendering + Matter.js motion physics for dealing cards
- Skippable tutorial overlay on launch
- 2, 3, or 4 players (choosable)
- Starting money: **$1000 per player**

## Core blackjack rules implemented

- Number cards = face value; J/Q/K = 10; Ace = 1 or 11
- Players and dealer receive 2 cards; dealer shows one card and hides one
- Player actions: Hit, Stand, Double Down (one final card), Split pairs
- Bust over 21 loses immediately
- Dealer draws until reaching at least 17
- Win by beating dealer without busting, or when dealer busts
- Two-card 21 (blackjack) pays extra at 3:2

## Extra table actions

- Rebet Last
- All-In Current
- New Shoe
- Reset Session

## Run

```bash
npm install
npm run dev
```

## Test

```bash
npm test
```
