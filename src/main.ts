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
  isSplitAces: boolean;
  doubled: boolean;
};

type GamePhase = 'betting' | 'dealing' | 'playerTurn' | 'dealerTurn' | 'settlement' | 'roundOver';

type CardSprite = {
  container: Container;
  body: Matter.Body;
  targetX: number;
  targetY: number;
};

const RULES = {
  decks: 6,
  shufflePenetration: 0.75,
  dealerHitsSoft17: false,
  blackjackPayout: 1.5,
  allowDoubleAfterSplit: true,
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
  let total = cards.reduce((sum, c) => sum + cardValue(c.rank), 0);
  let aces = cards.filter((c) => c.rank === 'A').length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { best: total, soft: cards.some((c) => c.rank === 'A') && total <= 21 && aces > 0 };
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
    for (let d = 0; d < RULES.decks; d++) {
      for (const suit of SUITS) {
        for (const rank of RANKS) {
          this.cards.push({ rank, suit });
        }
      }
    }
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  draw(): Card {
    const penetrationReached = this.cards.length < RULES.decks * 52 * (1 - RULES.shufflePenetration);
    if (penetrationReached) {
      this.build();
    }
    const card = this.cards.pop();
    if (!card) throw new Error('Shoe is empty');
    return card;
  }
}

class BlackjackGame {
  shoe = new Shoe();
  bankroll = 1000;
  baseBet = 50;
  insuranceBet = 0;
  phase: GamePhase = 'betting';
  dealer: Card[] = [];
  hands: Hand[] = [];
  activeHandIndex = 0;
  message = 'Place your bet and deal.';

  app!: Application;
  table!: Container;
  cardSprites: CardSprite[] = [];
  engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });

  statusEl = document.getElementById('status') as HTMLDivElement;
  bankrollEl = document.getElementById('bankroll') as HTMLDivElement;
  controlsEl = document.getElementById('controls') as HTMLDivElement;

  async init() {
    this.app = new Application();
    await this.app.init({
      width: window.innerWidth,
      height: window.innerHeight,
      background: '#0a5935',
      antialias: true,
      resizeTo: window,
    });
    document.getElementById('app')?.appendChild(this.app.canvas);
    this.table = new Container();
    this.app.stage.addChild(this.table);

    const felt = new Graphics().roundRect(20, 80, window.innerWidth - 40, window.innerHeight - 180, 20).fill(0x0c6e43);
    this.table.addChild(felt);

    this.app.ticker.add(() => this.tick());
    this.render();
  }

  tick() {
    Matter.Engine.update(this.engine, 16);
    for (const sprite of this.cardSprites) {
      const dx = sprite.targetX - sprite.body.position.x;
      const dy = sprite.targetY - sprite.body.position.y;
      Matter.Body.applyForce(sprite.body, sprite.body.position, { x: dx * 0.0008, y: dy * 0.0008 });
      Matter.Body.setVelocity(sprite.body, {
        x: sprite.body.velocity.x * 0.92,
        y: sprite.body.velocity.y * 0.92,
      });
      sprite.container.position.set(sprite.body.position.x, sprite.body.position.y);
    }
  }

  makeHand(bet: number): Hand {
    return {
      cards: [],
      bet,
      isStanding: false,
      isBusted: false,
      isSurrendered: false,
      isSplitAces: false,
      doubled: false,
    };
  }

  createCardVisual(card: Card, hidden = false): CardSprite {
    const container = new Container();
    const bg = new Graphics().roundRect(0, 0, 80, 120, 10).fill(hidden ? 0x153262 : 0xffffff).stroke({ color: 0x222222, width: 2 });
    container.addChild(bg);

    const color = card.suit === '♥' || card.suit === '♦' ? 0xbb1d1d : 0x111111;
    if (!hidden) {
      const label = new Text({ text: `${card.rank}${card.suit}`, style: { fill: color, fontSize: 24, fontWeight: 'bold' } });
      label.position.set(10, 10);
      container.addChild(label);
    }
    this.table.addChild(container);
    const body = Matter.Bodies.rectangle(window.innerWidth / 2, -50, 80, 120, { frictionAir: 0.1 });
    Matter.World.add(this.engine.world, body);
    const sprite: CardSprite = { container, body, targetX: window.innerWidth / 2, targetY: 200 };
    this.cardSprites.push(sprite);
    return sprite;
  }

  dealRound() {
    if (this.phase !== 'betting' && this.phase !== 'roundOver') return;
    if (this.bankroll < this.baseBet) {
      this.message = 'Not enough bankroll for this bet.';
      this.render();
      return;
    }

    this.clearTable();
    this.bankroll -= this.baseBet;
    this.insuranceBet = 0;
    this.dealer = [];
    this.hands = [this.makeHand(this.baseBet)];
    this.activeHandIndex = 0;
    this.phase = 'dealing';

    this.hands[0].cards.push(this.shoe.draw());
    this.dealer.push(this.shoe.draw());
    this.hands[0].cards.push(this.shoe.draw());
    this.dealer.push(this.shoe.draw());

    this.layoutCards(true);

    if (this.dealer[0].rank === 'A') {
      this.message = 'Dealer shows Ace. You may take Insurance.';
    } else {
      this.message = 'Your turn.';
    }

    const dealerMayPeek = ['A', '10', 'J', 'Q', 'K'].includes(this.dealer[0].rank);
    if (dealerMayPeek && isBlackjack(this.dealer)) {
      this.resolveDealerBlackjack();
      return;
    }

    if (isBlackjack(this.hands[0].cards)) {
      this.phase = 'dealerTurn';
      this.message = 'Blackjack! Dealer plays out.';
      this.playDealer();
      return;
    }

    this.phase = 'playerTurn';
    this.render();
  }

  resolveDealerBlackjack() {
    this.phase = 'settlement';
    this.layoutCards(false);
    const playerBJ = isBlackjack(this.hands[0].cards);
    if (playerBJ) {
      this.bankroll += this.baseBet;
      this.message = 'Both have blackjack. Push.';
    } else {
      this.message = 'Dealer has blackjack.';
    }
    if (this.insuranceBet > 0) {
      this.bankroll += this.insuranceBet * (RULES.insurancePayout + 1);
      this.message += ' Insurance pays 2:1.';
    }
    this.phase = 'roundOver';
    this.render();
  }

  hit() {
    if (this.phase !== 'playerTurn') return;
    const hand = this.hands[this.activeHandIndex];
    if (!hand) return;

    hand.cards.push(this.shoe.draw());
    const total = handTotal(hand.cards).best;
    if (total > 21) {
      hand.isBusted = true;
      hand.isStanding = true;
      this.advanceHand();
    } else if (hand.isSplitAces && RULES.splitAcesOneCardOnly) {
      hand.isStanding = true;
      this.advanceHand();
    }
    this.layoutCards(true);
    this.render();
  }

  stand() {
    if (this.phase !== 'playerTurn') return;
    const hand = this.hands[this.activeHandIndex];
    hand.isStanding = true;
    this.advanceHand();
    this.render();
  }

  double() {
    if (this.phase !== 'playerTurn') return;
    const hand = this.hands[this.activeHandIndex];
    const canDouble = hand.cards.length === 2 && this.bankroll >= hand.bet;
    if (!canDouble) return;

    this.bankroll -= hand.bet;
    hand.bet *= 2;
    hand.doubled = true;
    hand.cards.push(this.shoe.draw());
    const total = handTotal(hand.cards).best;
    if (total > 21) hand.isBusted = true;
    hand.isStanding = true;
    this.layoutCards(true);
    this.advanceHand();
    this.render();
  }

  split() {
    if (this.phase !== 'playerTurn') return;
    const hand = this.hands[this.activeHandIndex];
    const isPair = hand.cards.length === 2 && cardValue(hand.cards[0].rank) === cardValue(hand.cards[1].rank);
    if (!isPair || this.hands.length >= RULES.maxHands || this.bankroll < hand.bet) return;

    this.bankroll -= hand.bet;
    const newHand = this.makeHand(hand.bet);
    const moved = hand.cards.pop();
    if (!moved) return;
    newHand.cards.push(moved);

    hand.cards.push(this.shoe.draw());
    newHand.cards.push(this.shoe.draw());

    if (hand.cards[0].rank === 'A' && moved.rank === 'A') {
      hand.isSplitAces = true;
      newHand.isSplitAces = true;
      if (RULES.splitAcesOneCardOnly) {
        hand.isStanding = true;
      }
    }

    this.hands.splice(this.activeHandIndex + 1, 0, newHand);
    this.layoutCards(true);
    this.render();
  }

  surrender() {
    if (this.phase !== 'playerTurn' || !RULES.lateSurrender) return;
    const hand = this.hands[this.activeHandIndex];
    if (hand.cards.length !== 2 || this.hands.length > 1) return;

    hand.isSurrendered = true;
    hand.isStanding = true;
    this.bankroll += hand.bet / 2;
    this.advanceHand();
    this.render();
  }

  insurance() {
    if (this.phase !== 'playerTurn') return;
    if (this.dealer[0].rank !== 'A' || this.insuranceBet > 0) return;
    const sideBet = this.baseBet / 2;
    if (this.bankroll < sideBet) return;
    this.bankroll -= sideBet;
    this.insuranceBet = sideBet;
    this.message = 'Insurance placed.';
    this.render();
  }

  advanceHand() {
    while (this.activeHandIndex < this.hands.length && this.hands[this.activeHandIndex].isStanding) {
      this.activeHandIndex += 1;
    }
    if (this.activeHandIndex >= this.hands.length) {
      this.phase = 'dealerTurn';
      this.playDealer();
    }
  }

  playDealer() {
    this.layoutCards(false);
    while (true) {
      const total = handTotal(this.dealer);
      const shouldHit = total.best < 17 || (total.best === 17 && total.soft && RULES.dealerHitsSoft17);
      if (!shouldHit) break;
      this.dealer.push(this.shoe.draw());
    }
    this.settle();
  }

  settle() {
    const dealerTotal = handTotal(this.dealer).best;
    const dealerBust = dealerTotal > 21;
    const dealerBJ = isBlackjack(this.dealer);

    const summaries: string[] = [];

    for (const hand of this.hands) {
      if (hand.isSurrendered) {
        summaries.push('Surrender');
        continue;
      }
      if (hand.isBusted) {
        summaries.push('Bust');
        continue;
      }

      const total = handTotal(hand.cards).best;
      if (isBlackjack(hand.cards) && !dealerBJ) {
        this.bankroll += hand.bet * (1 + RULES.blackjackPayout);
        summaries.push('Blackjack pays 3:2');
      } else if (dealerBust || total > dealerTotal) {
        this.bankroll += hand.bet * 2;
        summaries.push('Win');
      } else if (total === dealerTotal) {
        this.bankroll += hand.bet;
        summaries.push('Push');
      } else {
        summaries.push('Lose');
      }
    }

    if (dealerBJ && this.insuranceBet > 0) {
      this.bankroll += this.insuranceBet * (RULES.insurancePayout + 1);
      summaries.push('Insurance won');
    }

    this.phase = 'roundOver';
    this.message = summaries.join(' | ');
    this.render();
  }

  clearTable() {
    for (const s of this.cardSprites) {
      Matter.World.remove(this.engine.world, s.body);
      s.container.destroy();
    }
    this.cardSprites = [];
  }

  layoutCards(hideDealerHole: boolean) {
    this.clearTable();
    const dealerY = 140;
    const playerBaseY = 360;

    this.dealer.forEach((card, i) => {
      const s = this.createCardVisual(card, hideDealerHole && i === 1 && this.phase !== 'roundOver' && this.phase !== 'dealerTurn' && this.phase !== 'settlement');
      s.targetX = 320 + i * 90;
      s.targetY = dealerY;
    });

    this.hands.forEach((hand, hIndex) => {
      hand.cards.forEach((card, cIndex) => {
        const s = this.createCardVisual(card);
        s.targetX = 180 + hIndex * 240 + cIndex * 90;
        s.targetY = playerBaseY;
      });

      const total = handTotal(hand.cards).best;
      const lbl = new Text({
        text: `Hand ${hIndex + 1}${hIndex === this.activeHandIndex && this.phase === 'playerTurn' ? ' ◀' : ''}\nTotal: ${total}\nBet: $${hand.bet}`,
        style: { fill: 0xffffff, fontSize: 16 },
      });
      lbl.position.set(180 + hIndex * 240, playerBaseY + 132);
      this.table.addChild(lbl);
    });

    const dealerTotal = handTotal(this.dealer).best;
    const dealerLbl = new Text({
      text:
        this.phase === 'playerTurn' || this.phase === 'dealing'
          ? `Dealer shows: ${cardValue(this.dealer[0]?.rank ?? '2')}`
          : `Dealer total: ${dealerTotal}`,
      style: { fill: 0xffffff, fontSize: 18, fontWeight: 'bold' },
    });
    dealerLbl.position.set(320, 80);
    this.table.addChild(dealerLbl);
  }

  render() {
    this.statusEl.innerHTML = `<strong>Status:</strong> ${this.message} <br/><strong>Phase:</strong> ${this.phase}`;
    this.bankrollEl.innerHTML = `<strong>Bankroll:</strong> $${this.bankroll} <br/><strong>Bet:</strong> $${this.baseBet}`;

    const phase = this.phase;
    const hand = this.hands[this.activeHandIndex];
    const canSplit =
      phase === 'playerTurn' &&
      !!hand &&
      hand.cards.length === 2 &&
      cardValue(hand.cards[0].rank) === cardValue(hand.cards[1].rank) &&
      this.hands.length < RULES.maxHands &&
      this.bankroll >= hand.bet;

    const canDouble = phase === 'playerTurn' && !!hand && hand.cards.length === 2 && this.bankroll >= hand.bet;
    const canSurrender = phase === 'playerTurn' && !!hand && hand.cards.length === 2 && this.hands.length === 1;
    const canInsurance = phase === 'playerTurn' && this.dealer[0]?.rank === 'A' && this.insuranceBet === 0 && this.bankroll >= this.baseBet / 2;

    this.controlsEl.innerHTML = '';
    const mk = (label: string, fn: () => void, disabled = false) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.disabled = disabled;
      b.onclick = fn;
      this.controlsEl.appendChild(b);
    };

    mk('Deal', () => this.dealRound(), !(phase === 'betting' || phase === 'roundOver'));
    mk('Hit', () => this.hit(), phase !== 'playerTurn');
    mk('Stand', () => this.stand(), phase !== 'playerTurn');
    mk('Double', () => this.double(), !canDouble);
    mk('Split', () => this.split(), !canSplit);
    mk('Surrender', () => this.surrender(), !canSurrender);
    mk('Insurance', () => this.insurance(), !canInsurance);
    mk('Bet -', () => {
      this.baseBet = Math.max(10, this.baseBet - 10);
      this.render();
    }, !(phase === 'betting' || phase === 'roundOver'));
    mk('Bet +', () => {
      this.baseBet = Math.min(this.bankroll, this.baseBet + 10);
      this.render();
    }, !(phase === 'betting' || phase === 'roundOver'));
  }
}

const game = new BlackjackGame();
void game.init();

const tutorialOverlay = document.getElementById('tutorialOverlay') as HTMLDivElement;
const tutorialStep = document.getElementById('tutorialStep') as HTMLParagraphElement;
const playTutorialBtn = document.getElementById('playTutorial') as HTMLButtonElement;
const skipTutorialBtn = document.getElementById('skipTutorial') as HTMLButtonElement;

const tutorialSlides = [
  'Step 1: Press Deal to begin a round with your selected bet.',
  'Step 2: Use Hit to draw cards, and Stand to hold your total.',
  'Step 3: Double doubles your bet and draws exactly one final card.',
  'Step 4: Split pairs into two hands (up to 4 total hands).',
  'Step 5: Surrender gives up half your bet (late surrender, first action only).',
  'Step 6: If dealer shows Ace, Insurance is available and pays 2:1 if dealer has blackjack.',
  'You are ready. Press Skip Tutorial to start playing.',
];
let idx = 0;

playTutorialBtn.onclick = () => {
  tutorialStep.textContent = tutorialSlides[idx];
  idx = Math.min(idx + 1, tutorialSlides.length - 1);
};

skipTutorialBtn.onclick = () => {
  tutorialOverlay.style.display = 'none';
};
