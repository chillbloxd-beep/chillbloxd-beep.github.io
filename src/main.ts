import { Application, Container, Graphics, Text } from 'pixi.js';
import Matter from 'matter-js';

type Suit = '♠' | '♥' | '♦' | '♣';
type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
type Card = { rank: Rank; suit: Suit };

type Hand = {
  cards: Card[];
  bet: number;
  stood: boolean;
  busted: boolean;
  doubled: boolean;
};

type PlayerState = {
  id: number;
  bankroll: number;
  baseBet: number;
  lastBet: number;
  hands: Hand[];
  activeHandIndex: number;
};

type GamePhase = 'betting' | 'playerTurn' | 'dealerTurn' | 'roundOver';
type CardSprite = { container: Container; body: Matter.Body; targetX: number; targetY: number };

const STARTING_MONEY = 1000;
const BLACKJACK_PAYOUT = 1.5;
const MAX_SPLIT_HANDS = 4;
const DECKS = 6;

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function cardValue(rank: Rank): number {
  if (rank === 'A') return 11;
  if (rank === 'K' || rank === 'Q' || rank === 'J') return 10;
  return Number(rank);
}

function handTotal(cards: Card[]): { best: number; soft: boolean } {
  let total = cards.reduce((sum, card) => sum + cardValue(card.rank), 0);
  let aceCount = cards.filter((card) => card.rank === 'A').length;

  while (total > 21 && aceCount > 0) {
    total -= 10;
    aceCount -= 1;
  }

  return { best: total, soft: aceCount > 0 };
}

function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handTotal(cards).best === 21;
}

class Shoe {
  cards: Card[] = [];

  constructor() {
    this.shuffle();
  }

  shuffle() {
    this.cards = [];
    for (let d = 0; d < DECKS; d += 1) {
      for (const suit of SUITS) {
        for (const rank of RANKS) {
          this.cards.push({ rank, suit });
        }
      }
    }

    for (let i = this.cards.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  draw(): Card {
    if (this.cards.length < 52) {
      this.shuffle();
    }
    const next = this.cards.pop();
    if (!next) throw new Error('No cards available');
    return next;
  }
}

class BlackjackGame {
  shoe = new Shoe();
  phase: GamePhase = 'betting';
  playerCount = 2;
  players: PlayerState[] = [];
  dealer: Card[] = [];
  activePlayerIndex = 0;
  message = 'Choose players, set bets, and press Deal.';

  app!: Application;
  table!: Container;
  staticLayer!: Container;
  cardSprites: CardSprite[] = [];
  engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });

  statusEl = document.getElementById('status') as HTMLDivElement;
  bankrollEl = document.getElementById('bankroll') as HTMLDivElement;
  controlsEl = document.getElementById('controls') as HTMLDivElement;

  constructor() {
    this.resetPlayers();
  }

  async init() {
    this.app = new Application();
    await this.app.init({
      width: window.innerWidth,
      height: window.innerHeight,
      background: '#073b2b',
      antialias: true,
      resizeTo: window,
    });

    document.getElementById('app')?.appendChild(this.app.canvas);
    this.table = new Container();
    this.staticLayer = new Container();
    this.table.addChild(this.staticLayer);
    this.app.stage.addChild(this.table);

    this.drawTableBase();
    this.app.ticker.add(() => this.tick());
    this.render();
  }

  drawTableBase() {
    this.staticLayer.removeChildren();
    const w = window.innerWidth;
    const h = window.innerHeight;

    const wood = new Graphics().roundRect(18, 76, w - 36, h - 186, 38).fill(0x4e2d17);
    const felt = new Graphics().roundRect(30, 88, w - 60, h - 210, 32).fill(0x0a6a4a);
    const glow = new Graphics().circle(w / 2, h / 2 + 40, Math.min(420, w * 0.3)).fill({ color: 0xffffff, alpha: 0.05 });

    const title = new Text({
      text: 'BLACKJACK ROYALE',
      style: { fill: 0xf7d986, fontSize: 26, fontWeight: 'bold', letterSpacing: 2 },
    });
    title.anchor.set(0.5, 0.5);
    title.position.set(w / 2, 120);

    this.staticLayer.addChild(wood);
    this.staticLayer.addChild(felt);
    this.staticLayer.addChild(glow);
    this.staticLayer.addChild(title);
  }

  resetPlayers() {
    this.players = Array.from({ length: this.playerCount }, (_, i) => ({
      id: i + 1,
      bankroll: STARTING_MONEY,
      baseBet: 50,
      lastBet: 50,
      hands: [],
      activeHandIndex: 0,
    }));
    this.dealer = [];
    this.activePlayerIndex = 0;
    this.phase = 'betting';
  }

  makeHand(bet: number): Hand {
    return { cards: [], bet, stood: false, busted: false, doubled: false };
  }

  currentPlayer(): PlayerState | undefined {
    return this.players[this.activePlayerIndex];
  }

  currentHand(): Hand | undefined {
    const p = this.currentPlayer();
    if (!p) return undefined;
    return p.hands[p.activeHandIndex];
  }

  setPlayerCount(count: number) {
    if (this.phase !== 'betting' && this.phase !== 'roundOver') return;
    this.playerCount = count;
    this.resetPlayers();
    this.message = `${count} seats ready. Each player starts with $${STARTING_MONEY}.`;
    this.layoutCards(true);
    this.render();
  }

  tick() {
    Matter.Engine.update(this.engine, 16);
    for (const sprite of this.cardSprites) {
      const dx = sprite.targetX - sprite.body.position.x;
      const dy = sprite.targetY - sprite.body.position.y;
      Matter.Body.applyForce(sprite.body, sprite.body.position, { x: dx * 0.0009, y: dy * 0.0009 });
      Matter.Body.setVelocity(sprite.body, { x: sprite.body.velocity.x * 0.9, y: sprite.body.velocity.y * 0.9 });
      sprite.container.position.set(sprite.body.position.x, sprite.body.position.y);
    }
  }

  createCardVisual(card: Card, hidden = false): CardSprite {
    const container = new Container();
    const base = new Graphics().roundRect(0, 0, 82, 122, 10).fill(hidden ? 0x23448f : 0xffffff).stroke({ color: 0x1b1b1b, width: 2 });
    container.addChild(base);

    if (!hidden) {
      const red = card.suit === '♥' || card.suit === '♦';
      const label = new Text({
        text: `${card.rank}${card.suit}`,
        style: { fill: red ? 0xc12525 : 0x101010, fontSize: 24, fontWeight: 'bold' },
      });
      label.position.set(9, 8);
      container.addChild(label);
    }

    this.table.addChild(container);
    const body = Matter.Bodies.rectangle(window.innerWidth / 2, -60, 82, 122, { frictionAir: 0.1 });
    Matter.World.add(this.engine.world, body);

    const sprite = { container, body, targetX: window.innerWidth / 2, targetY: 220 };
    this.cardSprites.push(sprite);
    return sprite;
  }

  clearTable() {
    for (const sprite of this.cardSprites) {
      Matter.World.remove(this.engine.world, sprite.body);
      sprite.container.destroy();
    }
    this.cardSprites = [];

    while (this.table.children.length > 1) {
      this.table.removeChildAt(1).destroy();
    }
  }

  rebetAll() {
    if (this.phase !== 'betting' && this.phase !== 'roundOver') return;
    for (const p of this.players) {
      p.baseBet = Math.max(10, Math.min(p.bankroll, p.lastBet));
    }
    this.message = 'Rebet applied for all players.';
    this.render();
  }

  allInCurrent() {
    if (this.phase !== 'betting' && this.phase !== 'roundOver') return;
    const p = this.currentPlayer() ?? this.players[0];
    p.baseBet = p.bankroll;
    this.message = `Player ${p.id} goes all-in ($${p.baseBet}).`;
    this.render();
  }

  newShoeNow() {
    this.shoe.shuffle();
    this.message = 'A fresh shoe has been shuffled.';
    this.render();
  }

  resetSessionMoney() {
    if (this.phase !== 'betting' && this.phase !== 'roundOver') return;
    this.resetPlayers();
    this.layoutCards(true);
    this.message = 'Session reset to $1000 each.';
    this.render();
  }

  dealRound() {
    if (this.phase !== 'betting' && this.phase !== 'roundOver') return;

    for (const p of this.players) {
      if (p.baseBet <= 0 || p.baseBet > p.bankroll) {
        this.message = `Player ${p.id} has an invalid bet.`;
        this.render();
        return;
      }
    }

    this.dealer = [];
    for (const p of this.players) {
      p.lastBet = p.baseBet;
      p.bankroll -= p.baseBet;
      p.hands = [this.makeHand(p.baseBet)];
      p.activeHandIndex = 0;
    }

    this.players.forEach((p) => p.hands[0].cards.push(this.shoe.draw()));
    this.dealer.push(this.shoe.draw());
    this.players.forEach((p) => p.hands[0].cards.push(this.shoe.draw()));
    this.dealer.push(this.shoe.draw());

    this.activePlayerIndex = 0;
    this.phase = 'playerTurn';
    this.message = `Player 1's turn.`;

    this.layoutCards(true);
    this.render();
  }

  hit() {
    if (this.phase !== 'playerTurn') return;
    const hand = this.currentHand();
    if (!hand) return;

    hand.cards.push(this.shoe.draw());
    const total = handTotal(hand.cards).best;
    if (total > 21) {
      hand.busted = true;
      hand.stood = true;
      this.advanceTurn();
    }

    this.layoutCards(true);
    this.render();
  }

  stand() {
    if (this.phase !== 'playerTurn') return;
    const hand = this.currentHand();
    if (!hand) return;

    hand.stood = true;
    this.advanceTurn();
    this.render();
  }

  doubleDown() {
    if (this.phase !== 'playerTurn') return;
    const p = this.currentPlayer();
    const hand = this.currentHand();
    if (!p || !hand) return;

    if (hand.cards.length !== 2 || p.bankroll < hand.bet) return;

    p.bankroll -= hand.bet;
    hand.bet *= 2;
    hand.doubled = true;
    hand.cards.push(this.shoe.draw());

    if (handTotal(hand.cards).best > 21) {
      hand.busted = true;
    }

    hand.stood = true;
    this.layoutCards(true);
    this.advanceTurn();
    this.render();
  }

  split() {
    if (this.phase !== 'playerTurn') return;
    const p = this.currentPlayer();
    const hand = this.currentHand();
    if (!p || !hand) return;

    const canSplit =
      hand.cards.length === 2 &&
      hand.cards[0].rank === hand.cards[1].rank &&
      p.hands.length < MAX_SPLIT_HANDS &&
      p.bankroll >= hand.bet;

    if (!canSplit) return;

    p.bankroll -= hand.bet;
    const moved = hand.cards.pop();
    if (!moved) return;

    const newHand = this.makeHand(hand.bet);
    newHand.cards.push(moved);

    hand.cards.push(this.shoe.draw());
    newHand.cards.push(this.shoe.draw());

    p.hands.splice(p.activeHandIndex + 1, 0, newHand);
    this.layoutCards(true);
    this.render();
  }

  advanceTurn() {
    let p = this.currentPlayer();
    if (!p) return;

    while (p.activeHandIndex < p.hands.length && p.hands[p.activeHandIndex].stood) {
      p.activeHandIndex += 1;
    }

    while (p.activeHandIndex >= p.hands.length) {
      this.activePlayerIndex += 1;
      p = this.currentPlayer();
      if (!p) break;

      while (p.activeHandIndex < p.hands.length && p.hands[p.activeHandIndex].stood) {
        p.activeHandIndex += 1;
      }
      if (p.activeHandIndex < p.hands.length) break;
    }

    if (this.activePlayerIndex >= this.players.length) {
      this.phase = 'dealerTurn';
      this.playDealer();
      return;
    }

    this.message = `Player ${this.activePlayerIndex + 1}'s turn.`;
    this.layoutCards(true);
  }

  playDealer() {
    this.layoutCards(false);

    while (handTotal(this.dealer).best < 17) {
      this.dealer.push(this.shoe.draw());
    }

    this.settle();
  }

  settle() {
    const dealer = handTotal(this.dealer).best;
    const dealerBust = dealer > 21;
    const dealerBJ = isBlackjack(this.dealer);
    const summary: string[] = [];

    this.players.forEach((p) => {
      p.hands.forEach((hand, idx) => {
        const total = handTotal(hand.cards).best;
        const playerBJ = isBlackjack(hand.cards);

        if (hand.busted) {
          summary.push(`P${p.id}H${idx + 1}: Bust`);
          return;
        }

        if (playerBJ && !dealerBJ) {
          p.bankroll += hand.bet * (2 + BLACKJACK_PAYOUT - 1);
          summary.push(`P${p.id}H${idx + 1}: Blackjack`);
          return;
        }

        if (dealerBust || total > dealer) {
          p.bankroll += hand.bet * 2;
          summary.push(`P${p.id}H${idx + 1}: Win`);
          return;
        }

        if (total === dealer) {
          p.bankroll += hand.bet;
          summary.push(`P${p.id}H${idx + 1}: Push`);
          return;
        }

        summary.push(`P${p.id}H${idx + 1}: Lose`);
      });
    });

    this.phase = 'roundOver';
    this.message = summary.join(' | ');
    this.layoutCards(false);
    this.render();
  }

  layoutCards(hideDealerHole: boolean) {
    this.clearTable();

    const dealerY = 170;
    const tableBottom = window.innerHeight - 220;
    const gap = this.players.length > 1 ? (tableBottom - 300) / (this.players.length - 1) : 0;

    this.dealer.forEach((card, i) => {
      const hidden = hideDealerHole && i === 1 && this.phase === 'playerTurn';
      const s = this.createCardVisual(card, hidden);
      s.targetX = 320 + i * 90;
      s.targetY = dealerY;
    });

    this.players.forEach((player, pIndex) => {
      const y = 300 + pIndex * gap;
      player.hands.forEach((hand, hIndex) => {
        hand.cards.forEach((card, cIndex) => {
          const s = this.createCardVisual(card);
          s.targetX = 120 + hIndex * 240 + cIndex * 90;
          s.targetY = y;
        });

        const total = handTotal(hand.cards).best;
        const active = this.phase === 'playerTurn' && pIndex === this.activePlayerIndex && hIndex === player.activeHandIndex;

        const label = new Text({
          text: `Player ${player.id} Hand ${hIndex + 1}${active ? ' ◀' : ''}\nTotal: ${total}  Bet: $${hand.bet}`,
          style: { fill: 0xffffff, fontSize: 14, fontWeight: 'bold' },
        });
        label.position.set(120 + hIndex * 240, y + 124);
        this.table.addChild(label);
      });
    });

    const dealerText = this.phase === 'playerTurn'
      ? `Dealer shows: ${cardValue(this.dealer[0]?.rank ?? '2')}`
      : `Dealer total: ${handTotal(this.dealer).best}`;

    const dealerLabel = new Text({ text: dealerText, style: { fill: 0xfce7a1, fontSize: 19, fontWeight: 'bold' } });
    dealerLabel.position.set(320, 115);
    this.table.addChild(dealerLabel);
  }

  render() {
    const rows = this.players
      .map((p) => `P${p.id}: <b>$${p.bankroll}</b> · Bet $${p.baseBet} · Last $${p.lastBet}`)
      .join('<br/>');

    this.statusEl.innerHTML = `<b>Phase:</b> ${this.phase}<br/><b>Table:</b> ${this.playerCount} players<br/><b>Message:</b> ${this.message}`;
    this.bankrollEl.innerHTML = `<b>Bankrolls</b><br/>${rows}`;

    const p = this.currentPlayer();
    const hand = this.currentHand();
    const canAct = this.phase === 'playerTurn';
    const canConfig = this.phase === 'betting' || this.phase === 'roundOver';

    const canDouble = canAct && !!p && !!hand && hand.cards.length === 2 && p.bankroll >= hand.bet;
    const canSplit =
      canAct &&
      !!p &&
      !!hand &&
      hand.cards.length === 2 &&
      hand.cards[0].rank === hand.cards[1].rank &&
      p.bankroll >= hand.bet &&
      p.hands.length < MAX_SPLIT_HANDS;

    this.controlsEl.innerHTML = '';

    const add = (label: string, fn: () => void, disabled = false, cls = '') => {
      const b = document.createElement('button');
      b.textContent = label;
      b.disabled = disabled;
      if (cls) b.className = cls;
      b.onclick = fn;
      this.controlsEl.appendChild(b);
    };

    add('2P', () => this.setPlayerCount(2), !canConfig, 'btn-secondary');
    add('3P', () => this.setPlayerCount(3), !canConfig, 'btn-secondary');
    add('4P', () => this.setPlayerCount(4), !canConfig, 'btn-secondary');

    add('Deal', () => this.dealRound(), !canConfig);
    add('Hit', () => this.hit(), !canAct);
    add('Stand', () => this.stand(), !canAct);
    add('Double', () => this.doubleDown(), !canDouble);
    add('Split', () => this.split(), !canSplit);

    add('Bet -', () => {
      const target = this.currentPlayer() ?? this.players[0];
      target.baseBet = Math.max(10, target.baseBet - 10);
      this.render();
    }, !canConfig, 'btn-secondary');

    add('Bet +', () => {
      const target = this.currentPlayer() ?? this.players[0];
      target.baseBet = Math.min(target.bankroll, target.baseBet + 10);
      this.render();
    }, !canConfig, 'btn-secondary');

    add('Rebet Last', () => this.rebetAll(), !canConfig, 'btn-secondary');
    add('All-In Current', () => this.allInCurrent(), !canConfig, 'btn-secondary');
    add('New Shoe', () => this.newShoeNow(), false, 'btn-secondary');
    add('Reset Session', () => this.resetSessionMoney(), !canConfig, 'btn-secondary');
  }
}

const game = new BlackjackGame();
void game.init();

const tutorialOverlay = document.getElementById('tutorialOverlay') as HTMLDivElement;
const tutorialStep = document.getElementById('tutorialStep') as HTMLParagraphElement;
const playTutorialBtn = document.getElementById('playTutorial') as HTMLButtonElement;
const skipTutorialBtn = document.getElementById('skipTutorial') as HTMLButtonElement;

const tutorialSlides = [
  'Step 1: Players start with 2 cards. Dealer gets 2 cards, 1 hidden.',
  'Step 2: Cards: number = face value, J/Q/K = 10, Ace = 1 or 11.',
  'Step 3: Choose Hit or Stand. You may Double Down or Split pairs when allowed.',
  'Step 4: Bust over 21 and that hand loses immediately.',
  'Step 5: Dealer draws until reaching at least 17.',
  'Step 6: Beat dealer without busting. Natural blackjack pays extra (3:2).',
];

let tutorialIdx = 0;
playTutorialBtn.onclick = () => {
  tutorialStep.textContent = tutorialSlides[tutorialIdx];
  tutorialIdx = Math.min(tutorialIdx + 1, tutorialSlides.length - 1);
};

skipTutorialBtn.onclick = () => {
  tutorialOverlay.style.display = 'none';
};
