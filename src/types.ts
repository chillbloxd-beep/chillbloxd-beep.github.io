export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type GameStatus = 'betting' | 'playing' | 'dealer-turn' | 'game-over';

export interface GameState {
  deck: Card[];
  playerHand: Card[];
  dealerHand: Card[];
  playerScore: number;
  dealerScore: number;
  balance: number;
  currentBet: number;
  status: GameStatus;
  message: string;
  showDealerCard: boolean;
}
