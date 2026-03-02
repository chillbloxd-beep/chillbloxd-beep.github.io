import { GameStatus } from '../types';
import './Controls.css';

interface ControlsProps {
  status: GameStatus;
  balance: number;
  currentBet: number;
  onBet: (amount: number) => void;
  onDeal: () => void;
  onHit: () => void;
  onStand: () => void;
  onNewGame: () => void;
}

export default function Controls({
  status,
  balance,
  currentBet,
  onBet,
  onDeal,
  onHit,
  onStand,
  onNewGame,
}: ControlsProps) {
  const betAmounts = [10, 25, 50, 100];

  return (
    <div className="controls">
      <div className="balance-section">
        <div className="balance-display">
          <span className="balance-label">Balance:</span>
          <span className="balance-amount">${balance}</span>
        </div>
        {currentBet > 0 && (
          <div className="bet-display">
            <span className="bet-label">Current Bet:</span>
            <span className="bet-amount">${currentBet}</span>
          </div>
        )}
      </div>

      {status === 'betting' && (
        <div className="betting-section">
          <div className="bet-buttons">
            {betAmounts.map((amount) => (
              <button
                key={amount}
                onClick={() => onBet(amount)}
                disabled={balance < amount}
                className="bet-button"
              >
                ${amount}
              </button>
            ))}
          </div>
          {currentBet > 0 && (
            <button onClick={onDeal} className="action-button deal-button">
              Deal
            </button>
          )}
        </div>
      )}

      {status === 'playing' && (
        <div className="action-buttons">
          <button onClick={onHit} className="action-button hit-button">
            Hit
          </button>
          <button onClick={onStand} className="action-button stand-button">
            Stand
          </button>
        </div>
      )}

      {status === 'game-over' && (
        <button onClick={onNewGame} className="action-button new-game-button">
          New Game
        </button>
      )}
    </div>
  );
}
