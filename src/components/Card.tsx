import { Card as CardType } from '../types';
import './Card.css';

interface CardProps {
  card?: CardType;
  hidden?: boolean;
}

export default function Card({ card, hidden = false }: CardProps) {
  if (hidden || !card) {
    return (
      <div className="card card-back">
        <div className="card-pattern"></div>
      </div>
    );
  }

  const suitSymbols = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠',
  };

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';

  return (
    <div className={`card ${isRed ? 'red' : 'black'}`}>
      <div className="card-corner top-left">
        <div className="rank">{card.rank}</div>
        <div className="suit">{suitSymbols[card.suit]}</div>
      </div>
      <div className="card-center">
        <span className="suit-large">{suitSymbols[card.suit]}</span>
      </div>
      <div className="card-corner bottom-right">
        <div className="rank">{card.rank}</div>
        <div className="suit">{suitSymbols[card.suit]}</div>
      </div>
    </div>
  );
}
