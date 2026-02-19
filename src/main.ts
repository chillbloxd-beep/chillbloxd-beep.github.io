import { Application, Container, Graphics, Text } from 'pixi.js';
import Matter from 'matter-js';

type Suit = '♠' | '♥' | '♦' | '♣';
type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
type Card = { rank: Rank; suit: Suit };

type Hand = {
  cards: Card[];
  bet: number;
  isStanding: boolean;
  isBusted: boolean;
  isSurrendered: boolean;
};

type PlayerState = {
  id: number;
  bankroll: number;
  baseBet: number;
  insuranceBet: number;
  hands: Hand[];
  activeHandIndex: number;
  lastBet: number;
};

type GamePhase = 'betting' | 'playerTurn' | 'dealerTurn' | 'roundOver';
type CardSprite = { container: Container; body: Matter.Body; targetX: number; targetY: number };

const STARTING_MONEY = 1000;
const RULES = {
  decks: 6,
  shufflePenetration: 0.75,
  dealerHitsSoft17: false,
  blackjackPayout: 1.5,
  maxHands: 4,
  splitAcesOneCardOnly: true,
  lateSurrender: true,
  insurancePayout: 2,
};

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function cardValue(rank: Rank): number {
  if (rank === 'A') return 11;
  if (['J', 'Q', 'K'].includes(rank)) return 10;
  return Number(rank);
}

function handTotal(cards: Card[]): { best: number; soft: boolean } {
  let total = cards.reduce((s, c) => s + cardValue(c.rank), 0);
  let aces = cards.filter((c) => c.rank === 'A').length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return { best: total, soft: total <= 21 && aces > 0 };
}

function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handTotal(cards).best === 21;
}

class Shoe {
  cards: Card[] = [];

  constructor() {
    this.build();
  }

  build() {
    this.cards = [];
    for (let d = 0; d < RULES.decks; d += 1) {
      for (const suit of SUITS) {
        for (const rank of RANKS) this.cards.push({ rank, suit });
      }
    }
    for (let i = this.cards.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  draw(): Card {
    const threshold = RULES.decks * 52 * (1 - RULES.shufflePenetration);
    if (this.cards.length < threshold) this.build();
    const card = this.cards.pop();
    if (!card) throw new Error('Shoe empty');
    return card;
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
  cardSprites: CardSprite[] = [];
  staticLayer!: Container;
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

    const rim = new Graphics().roundRect(18, 76, w - 36, h - 186, 38).fill(0x4e2d17);
    this.staticLayer.addChild(rim);

    const felt = new Graphics().roundRect(30, 88, w - 60, h - 210, 32).fill(0x0a6a4a);
    this.staticLayer.addChild(felt);

    const centerGlow = new Graphics().circle(w / 2, h / 2 + 40, Math.min(420, w * 0.3)).fill({ color: 0xffffff, alpha: 0.05 });
    this.staticLayer.addChild(centerGlow);

    const title = new Text({
      text: 'BLACKJACK ROYALE',
      style: { fill: 0xf7d986, fontSize: 26, fontWeight: 'bold', letterSpacing: 2 },
    });
    title.anchor.set(0.5, 0.5);
    title.position.set(w / 2, 120);
    this.staticLayer.addChild(title);
  }

  resetPlayers() {
    this.players = Array.from({ length: this.playerCount }, (_, idx) => ({
      id: idx + 1,
      bankroll: STARTING_MONEY,
      baseBet: 50,
      insuranceBet: 0,
      hands: [],
      activeHandIndex: 0,
      lastBet: 50,
    }));
    this.phase = 'betting';
    this.dealer = [];
    this.activePlayerIndex = 0;
  }

  setPlayerCount(count: number) {
    if (!(this.phase === 'betting' || this.phase === 'roundOver')) return;
    this.playerCount = count;
    this.resetPlayers();
    this.message = `${count} seats selected. Everyone starts with $${STARTING_MONEY}.`;
    this.layoutCards(true);
    this.render();
  }

  makeHand(bet: number): Hand {
    return { cards: [], bet, isStanding: false, isBusted: false, isSurrendered: false };
  }

  currentPlayer(): PlayerState | undefined {
    return this.players[this.activePlayerIndex];
  }

  currentHand(): Hand | undefined {
    const player = this.currentPlayer();
    if (!player) return undefined;
    return player.hands[player.activeHandIndex];
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
    const cardBase = new Graphics().roundRect(0, 0, 82, 122, 10).fill(hidden ? 0x23448f : 0xffffff).stroke({ color: 0x1b1b1b, width: 2 });
    container.addChild(cardBase);

    if (!hidden) {
      const red = card.suit === '♥' || card.suit === '♦';
      const text = new Text({
        text: `${card.rank}${card.suit}`,
        style: { fill: red ? 0xc12525 : 0x101010, fontSize: 24, fontWeight: 'bold' },
      });
      text.position.set(9, 8);
      container.addChild(text);
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

  dealRound() {
    if (!(this.phase === 'betting' || this.phase === 'roundOver')) return;

    for (const p of this.players) {
      if (p.baseBet <= 0 || p.baseBet > p.bankroll) {
        this.message = `Player ${p.id} has invalid bet.`;
        this.render();
        return;
      }
    }

    this.dealer = [];
    for (const p of this.players) {
      p.lastBet = p.baseBet;
      p.bankroll -= p.baseBet;
      p.insuranceBet = 0;
      p.hands = [this.makeHand(p.baseBet)];
      p.activeHandIndex = 0;
    }

    this.players.forEach((p) => p.hands[0].cards.push(this.shoe.draw()));
    this.dealer.push(this.shoe.draw());
    this.players.forEach((p) => p.hands[0].cards.push(this.shoe.draw()));
    this.dealer.push(this.shoe.draw());

    this.activePlayerIndex = 0;
    this.phase = 'playerTurn';

    if (['A', '10', 'J', 'Q', 'K'].includes(this.dealer[0].rank) && isBlackjack(this.dealer)) {
      this.resolveDealerBlackjack();
      return;
    }

    this.message = `Player ${this.activePlayerIndex + 1} turn.`;
    this.layoutCards(true);
    this.render();
  }

  hit() {
    if (this.phase !== 'playerTurn') return;
    const hand = this.currentHand();
    if (!hand) return;
    hand.cards.push(this.shoe.draw());
    if (handTotal(hand.cards).best > 21) {
      hand.isBusted = true;
      hand.isStanding = true;
      this.advanceTurn();
    }
    this.layoutCards(true);
    this.render();
  }

  stand() {
    if (this.phase !== 'playerTurn') return;
    const hand = this.currentHand();
    if (!hand) return;
    hand.isStanding = true;
    this.advanceTurn();
    this.render();
  }

  standAllHands() {
    if (this.phase !== 'playerTurn') return;
    const player = this.currentPlayer();
    if (!player) return;
    player.hands.forEach((h) => {
      h.isStanding = true;
    });
    this.advanceTurn();
    this.render();
  }

  double() {
    if (this.phase !== 'playerTurn') return;
    const player = this.currentPlayer();
    const hand = this.currentHand();
    if (!player || !hand || hand.cards.length !== 2 || player.bankroll < hand.bet) return;

    player.bankroll -= hand.bet;
    hand.bet *= 2;
    hand.cards.push(this.shoe.draw());
    if (handTotal(hand.cards).best > 21) hand.isBusted = true;
    hand.isStanding = true;
    this.layoutCards(true);
    this.advanceTurn();
    this.render();
  }

  split() {
    if (this.phase !== 'playerTurn') return;
    const player = this.currentPlayer();
    const hand = this.currentHand();
    if (!player || !hand) return;

    const pair = hand.cards.length === 2 && cardValue(hand.cards[0].rank) === cardValue(hand.cards[1].rank);
    if (!pair || player.hands.length >= RULES.maxHands || player.bankroll < hand.bet) return;

    player.bankroll -= hand.bet;
    const moved = hand.cards.pop();
    if (!moved) return;

    const newHand = this.makeHand(hand.bet);
    newHand.cards.push(moved);
    hand.cards.push(this.shoe.draw());
    newHand.cards.push(this.shoe.draw());

    if (hand.cards[0].rank === 'A' && moved.rank === 'A' && RULES.splitAcesOneCardOnly) {
      hand.isStanding = true;
      newHand.isStanding = true;
    }

    player.hands.splice(player.activeHandIndex + 1, 0, newHand);
    this.layoutCards(true);
    this.render();
  }

  surrender() {
    if (this.phase !== 'playerTurn' || !RULES.lateSurrender) return;
    const player = this.currentPlayer();
    const hand = this.currentHand();
    if (!player || !hand) return;
    if (hand.cards.length !== 2 || player.hands.length > 1) return;

    hand.isSurrendered = true;
    hand.isStanding = true;
    player.bankroll += hand.bet / 2;
    this.advanceTurn();
    this.render();
  }

  insurance() {
    if (this.phase !== 'playerTurn' || this.dealer[0].rank !== 'A') return;
    const player = this.currentPlayer();
    if (!player || player.insuranceBet > 0) return;

    const side = Math.floor(player.baseBet / 2);
    if (player.bankroll < side) return;

    player.bankroll -= side;
    player.insuranceBet = side;
    this.message = `Player ${player.id} placed insurance.`;
    this.render();
  }

  rebetAll() {
    if (!(this.phase === 'betting' || this.phase === 'roundOver')) return;
    this.players.forEach((p) => {
      p.baseBet = Math.min(p.lastBet, p.bankroll);
    });
    this.message = 'Rebet applied to all seats.';
    this.render();
  }

  allInCurrent() {
    if (!(this.phase === 'betting' || this.phase === 'roundOver')) return;
    const p = this.currentPlayer() ?? this.players[0];
    p.baseBet = p.bankroll;
    this.message = `Player ${p.id} is all-in for next round.`;
    this.render();
  }

  newShoeNow() {
    this.shoe.build();
    this.message = 'New shoe shuffled.';
    this.render();
  }

  resetSessionMoney() {
    if (!(this.phase === 'betting' || this.phase === 'roundOver')) return;
    this.resetPlayers();
    this.message = 'Session reset. All players back to $1000.';
    this.layoutCards(true);
    this.render();
  }

  advanceTurn() {
    let player = this.currentPlayer();
    if (!player) return;

    while (player.activeHandIndex < player.hands.length && player.hands[player.activeHandIndex].isStanding) {
      player.activeHandIndex += 1;
    }

    while (player.activeHandIndex >= player.hands.length) {
      this.activePlayerIndex += 1;
      player = this.currentPlayer();
      if (!player) break;

      while (player.activeHandIndex < player.hands.length && player.hands[player.activeHandIndex].isStanding) {
        player.activeHandIndex += 1;
      }
      if (player.activeHandIndex < player.hands.length) break;
    }

    if (this.activePlayerIndex >= this.players.length) {
      this.phase = 'dealerTurn';
      this.playDealer();
      return;
    }

    this.message = `Player ${this.activePlayerIndex + 1} turn.`;
    this.layoutCards(true);
  }

  resolveDealerBlackjack() {
    const summary: string[] = [];

    this.players.forEach((player) => {
      const hand = player.hands[0];
      const playerBJ = isBlackjack(hand.cards);
      if (playerBJ) {
        player.bankroll += hand.bet;
        summary.push(`P${player.id}: Push`);
      } else {
        summary.push(`P${player.id}: Dealer BJ`);
      }

      if (player.insuranceBet > 0) {
        player.bankroll += player.insuranceBet * (RULES.insurancePayout + 1);
      }
    });

    this.phase = 'roundOver';
    this.message = summary.join(' | ');
    this.layoutCards(false);
    this.render();
  }

  playDealer() {
    this.layoutCards(false);
    while (true) {
      const total = handTotal(this.dealer);
      const hit = total.best < 17 || (total.best === 17 && total.soft && RULES.dealerHitsSoft17);
      if (!hit) break;
      this.dealer.push(this.shoe.draw());
    }
    this.settle();
  }

  settle() {
    const dealerTotal = handTotal(this.dealer).best;
    const dealerBJ = isBlackjack(this.dealer);
    const dealerBust = dealerTotal > 21;
    const summary: string[] = [];

    this.players.forEach((player) => {
      player.hands.forEach((hand, idx) => {
        if (hand.isSurrendered) {
          summary.push(`P${player.id}H${idx + 1}: Surrender`);
          return;
        }
        if (hand.isBusted) {
          summary.push(`P${player.id}H${idx + 1}: Bust`);
          return;
        }

        const total = handTotal(hand.cards).best;
        if (isBlackjack(hand.cards) && !dealerBJ) {
          player.bankroll += hand.bet * (1 + RULES.blackjackPayout);
          summary.push(`P${player.id}H${idx + 1}: Blackjack`);
        } else if (dealerBust || total > dealerTotal) {
          player.bankroll += hand.bet * 2;
          summary.push(`P${player.id}H${idx + 1}: Win`);
        } else if (total === dealerTotal) {
          player.bankroll += hand.bet;
          summary.push(`P${player.id}H${idx + 1}: Push`);
        } else {
          summary.push(`P${player.id}H${idx + 1}: Lose`);
        }
      });

      if (dealerBJ && player.insuranceBet > 0) {
        player.bankroll += player.insuranceBet * (RULES.insurancePayout + 1);
      }
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
        const activeMark = this.phase === 'playerTurn' && pIndex === this.activePlayerIndex && hIndex === player.activeHandIndex ? ' ◀' : '';

        const label = new Text({
          text: `Player ${player.id} Hand ${hIndex + 1}${activeMark}\nTotal: ${total}  Bet: $${hand.bet}`,
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
    const playerRows = this.players
      .map((p) => `P${p.id}: <b>$${p.bankroll}</b> · Bet $${p.baseBet} · Last $${p.lastBet}`)
      .join('<br/>');

    this.statusEl.innerHTML = `<b>Phase:</b> ${this.phase}<br/><b>Table:</b> ${this.playerCount} players<br/><b>Message:</b> ${this.message}`;
    this.bankrollEl.innerHTML = `<b>Bankrolls</b><br/>${playerRows}`;

    const canAct = this.phase === 'playerTurn';
    const player = this.currentPlayer();
    const hand = this.currentHand();

    const canDouble = canAct && !!player && !!hand && hand.cards.length === 2 && player.bankroll >= hand.bet;
    const canSplit = canAct && !!player && !!hand && hand.cards.length === 2 && cardValue(hand.cards[0].rank) === cardValue(hand.cards[1].rank) && player.bankroll >= hand.bet && player.hands.length < RULES.maxHands;
    const canSurrender = canAct && !!player && !!hand && hand.cards.length === 2 && player.hands.length === 1;
    const canInsurance = canAct && this.dealer[0]?.rank === 'A' && !!player && player.insuranceBet === 0;
    const canConfig = this.phase === 'betting' || this.phase === 'roundOver';

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
    add('Stand All', () => this.standAllHands(), !canAct, 'btn-secondary');
    add('Double', () => this.double(), !canDouble);
    add('Split', () => this.split(), !canSplit);
    add('Surrender', () => this.surrender(), !canSurrender);
    add('Insurance', () => this.insurance(), !canInsurance, 'btn-secondary');

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
  'Step 1: Select 2, 3, or 4 players. Every seat starts at $1000.',
  'Step 2: Adjust bet for the active seat, then press Deal.',
  'Step 3: Use actions: Hit, Stand, Double, Split, Surrender, Insurance.',
  'Step 4: Advanced actions: Stand All, Rebet Last, All-In Current, New Shoe, Reset Session.',
  'Step 5: Dealer resolves all hands after every player finishes.',
  'You are ready. Press Skip Tutorial and enjoy Blackjack Royale.',
];

let tutorialIdx = 0;
playTutorialBtn.onclick = () => {
  tutorialStep.textContent = tutorialSlides[tutorialIdx];
  tutorialIdx = Math.min(tutorialIdx + 1, tutorialSlides.length - 1);
};

skipTutorialBtn.onclick = () => {
  tutorialOverlay.style.display = 'none';
};
