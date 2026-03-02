import { useState } from 'react';
import { GameState } from './types';
import {
  createDeck,
  calculateScore,
  drawCard,
  shouldDealerHit,
  determineWinner,
} from './gameLogic';
import Hand from './components/Hand';
import Controls from './components/Controls';
import './App.css';

const INITIAL_BALANCE = 1000;

function App() {
  const [gameState, setGameState] = useState<GameState>({
    deck: createDeck(),
    playerHand: [],
    dealerHand: [],
    playerScore: 0,
    dealerScore: 0,
    balance: INITIAL_BALANCE,
    currentBet: 0,
    status: 'betting',
    message: 'Place your bet to start!',
    showDealerCard: false,
  });

  const placeBet = (amount: number) => {
    if (gameState.balance >= amount) {
      setGameState((prev) => ({
        ...prev,
        currentBet: prev.currentBet + amount,
        balance: prev.balance - amount,
        message: `Bet placed: $${prev.currentBet + amount}`,
      }));
    }
  };

  const dealCards = () => {
    let deck = createDeck();
    const cards = [];

    for (let i = 0; i < 4; i++) {
      const { card, remainingDeck } = drawCard(deck);
      cards.push(card);
      deck = remainingDeck;
    }

    const playerHand = [cards[0], cards[2]];
    const dealerHand = [cards[1], cards[3]];
    const playerScore = calculateScore(playerHand);
    const dealerScore = calculateScore(dealerHand);

    if (playerScore === 21) {
      const winnings = Math.floor(gameState.currentBet * 2.5);
      setGameState((prev) => ({
        ...prev,
        deck,
        playerHand,
        dealerHand,
        playerScore,
        dealerScore,
        status: 'game-over',
        message: `Blackjack! You win $${winnings}!`,
        showDealerCard: true,
        balance: prev.balance + winnings,
      }));
    } else {
      setGameState((prev) => ({
        ...prev,
        deck,
        playerHand,
        dealerHand,
        playerScore,
        dealerScore,
        status: 'playing',
        message: 'Hit or Stand?',
        showDealerCard: false,
      }));
    }
  };

  const hit = () => {
    const { card, remainingDeck } = drawCard(gameState.deck);
    const newPlayerHand = [...gameState.playerHand, card];
    const newPlayerScore = calculateScore(newPlayerHand);

    if (newPlayerScore > 21) {
      setGameState((prev) => ({
        ...prev,
        deck: remainingDeck,
        playerHand: newPlayerHand,
        playerScore: newPlayerScore,
        status: 'game-over',
        message: `Bust! You lose $${prev.currentBet}`,
        showDealerCard: true,
      }));
    } else if (newPlayerScore === 21) {
      stand(newPlayerHand, newPlayerScore, remainingDeck);
    } else {
      setGameState((prev) => ({
        ...prev,
        deck: remainingDeck,
        playerHand: newPlayerHand,
        playerScore: newPlayerScore,
      }));
    }
  };

  const stand = (
    _playerHand = gameState.playerHand,
    playerScore = gameState.playerScore,
    deck = gameState.deck
  ) => {
    let dealerHand = [...gameState.dealerHand];
    let dealerScore = calculateScore(dealerHand);
    let remainingDeck = [...deck];

    setGameState((prev) => ({
      ...prev,
      status: 'dealer-turn',
      showDealerCard: true,
      message: "Dealer's turn...",
    }));

    setTimeout(() => {
      while (shouldDealerHit(dealerScore)) {
        const { card, remainingDeck: newDeck } = drawCard(remainingDeck);
        dealerHand.push(card);
        dealerScore = calculateScore(dealerHand);
        remainingDeck = newDeck;
      }

      const winner = determineWinner(playerScore, dealerScore);
      let message = '';
      let winnings = 0;

      if (winner === 'player') {
        winnings = gameState.currentBet * 2;
        message = `You win $${winnings}!`;
      } else if (winner === 'dealer') {
        message = `Dealer wins! You lose $${gameState.currentBet}`;
      } else {
        winnings = gameState.currentBet;
        message = `Push! Your bet of $${gameState.currentBet} is returned`;
      }

      setGameState((prev) => ({
        ...prev,
        deck: remainingDeck,
        dealerHand,
        dealerScore,
        status: 'game-over',
        message,
        balance: prev.balance + winnings,
      }));
    }, 1000);
  };

  const newGame = () => {
    setGameState({
      deck: createDeck(),
      playerHand: [],
      dealerHand: [],
      playerScore: 0,
      dealerScore: 0,
      balance: gameState.balance,
      currentBet: 0,
      status: 'betting',
      message: gameState.balance > 0 ? 'Place your bet!' : 'Game Over - No more balance!',
      showDealerCard: false,
    });
  };

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">Blackjack</h1>
        <p className="subtitle">Beat the dealer to 21!</p>
      </header>

      <main className="game-container">
        {gameState.message && (
          <div className={`message ${gameState.status === 'game-over' ? 'game-over' : ''}`}>
            {gameState.message}
          </div>
        )}

        {gameState.dealerHand.length > 0 && (
          <Hand
            cards={gameState.dealerHand}
            score={gameState.dealerScore}
            label="Dealer"
            hideFirstCard={!gameState.showDealerCard}
          />
        )}

        {gameState.playerHand.length > 0 && (
          <Hand
            cards={gameState.playerHand}
            score={gameState.playerScore}
            label="Player"
          />
        )}

        <Controls
          status={gameState.status}
          balance={gameState.balance}
          currentBet={gameState.currentBet}
          onBet={placeBet}
          onDeal={dealCards}
          onHit={hit}
          onStand={() => stand()}
          onNewGame={newGame}
        />
      </main>
    </div>
  );
}

export default App;
