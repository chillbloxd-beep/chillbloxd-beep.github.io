import { Card as CardType } from '../types';
import Card from './Card';
import './Hand.css';

interface HandProps {
  cards: CardType[];
  score: number;
  label: string;
  hideFirstCard?: boolean;
}

export default function Hand({ cards, score, label, hideFirstCard = false }: HandProps) {
  return (
    <div className="hand">
      <div className="hand-label">
        <h3>{label}</h3>
        <span className="score">{hideFirstCard ? '?' : score}</span>
      </div>
      <div className="cards">
        {cards.map((card, index) => (
          <Card key={index} card={card} hidden={hideFirstCard && index === 0} />
        ))}
      </div>
    </div>
  );
}
