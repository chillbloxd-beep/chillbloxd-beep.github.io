import { Card, Rank, Suit } from './types';

export function createDeck(): Card[] {
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck: Card[] = [];

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank });
    }
  }

  return shuffleDeck(deck);
}

function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function calculateScore(hand: Card[]): number {
  let score = 0;
  let aces = 0;

  for (const card of hand) {
    if (card.rank === 'A') {
      aces += 1;
      score += 11;
    } else if (['J', 'Q', 'K'].includes(card.rank)) {
      score += 10;
    } else {
      score += parseInt(card.rank);
    }
  }

  while (score > 21 && aces > 0) {
    score -= 10;
    aces -= 1;
  }

  return score;
}

export function drawCard(deck: Card[]): { card: Card; remainingDeck: Card[] } {
  const newDeck = [...deck];
  const card = newDeck.pop()!;
  return { card, remainingDeck: newDeck };
}

export function shouldDealerHit(dealerScore: number): boolean {
  return dealerScore < 17;
}

export function determineWinner(
  playerScore: number,
  dealerScore: number
): 'player' | 'dealer' | 'push' {
  if (playerScore > 21) return 'dealer';
  if (dealerScore > 21) return 'player';
  if (playerScore > dealerScore) return 'player';
  if (dealerScore > playerScore) return 'dealer';
  return 'push';
}
