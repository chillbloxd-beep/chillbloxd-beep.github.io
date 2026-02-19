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
};

type GamePhase = 'betting' | 'playerTurn' | 'dealerTurn' | 'roundOver';

type CardSprite = {
  container: Container;
  body: Matter.Body;
  targetX: number;
  targetY: number;
};

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
  let total = cards.reduce((sum, c) => sum + cardValue(c.rank), 0);
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
    const penetrationReached = this.cards.length < RULES.decks * 52 * (1 - RULES.shufflePenetration);
    if (penetrationReached) this.build();
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
  message = 'Choose 2/3/4 players, then deal.';

  app!: Application;
  table!: Container;
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

  resetPlayers() {
    this.players = Array.from({ length: this.playerCount }, (_, idx) => ({
      id: idx + 1,
      bankroll: STARTING_MONEY,
      baseBet: 50,
      insuranceBet: 0,
      hands: [],
      activeHandIndex: 0,
    }));
    this.phase = 'betting';
    this.dealer = [];
    this.activePlayerIndex = 0;
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
      Matter.Body.applyForce(sprite.body, sprite.body.position, { x: dx * 0.0008, y: dy * 0.0008 });
      Matter.Body.setVelocity(sprite.body, { x: sprite.body.velocity.x * 0.92, y: sprite.body.velocity.y * 0.92 });
      sprite.container.position.set(sprite.body.position.x, sprite.body.position.y);
    }
  }

  createCardVisual(card: Card, hidden = false): CardSprite {
    const container = new Container();
    const bg = new Graphics().roundRect(0, 0, 80, 120, 10).fill(hidden ? 0x153262 : 0xffffff).stroke({ color: 0x222222, width: 2 });
    container.addChild(bg);
    if (!hidden) {
      const color = card.suit === '♥' || card.suit === '♦' ? 0xbb1d1d : 0x111111;
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

  clearTable() {
    for (const s of this.cardSprites) {
      Matter.World.remove(this.engine.world, s.body);
      s.container.destroy();
    }
    this.cardSprites = [];
  }

  setPlayerCount(count: number) {
    if (this.phase !== 'betting' && this.phase !== 'roundOver') return;
    this.playerCount = count;
    this.resetPlayers();
    this.message = `${count} players selected. Each starts with $${STARTING_MONEY}.`;
    this.render();
  }

  dealRound() {
    if (this.phase !== 'betting' && this.phase !== 'roundOver') return;

    for (const p of this.players) {
      if (p.bankroll < p.baseBet) {
        this.message = `Player ${p.id} cannot cover the bet.`;
        this.render();
        return;
      }
    }

    this.dealer = [];
    for (const p of this.players) {
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

    this.message = `Player 1's turn.`;
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

  double() {
    if (this.phase !== 'playerTurn') return;
    const player = this.currentPlayer();
    const hand = this.currentHand();
    if (!player || !hand) return;
    if (hand.cards.length !== 2 || player.bankroll < hand.bet) return;
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
    const isPair = hand.cards.length === 2 && cardValue(hand.cards[0].rank) === cardValue(hand.cards[1].rank);
    if (!isPair || player.hands.length >= RULES.maxHands || player.bankroll < hand.bet) return;

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
    const sideBet = player.baseBet / 2;
    if (player.bankroll < sideBet) return;
    player.bankroll -= sideBet;
    player.insuranceBet = sideBet;
    this.message = `Player ${player.id} placed insurance.`;
    this.render();
  }

  advanceTurn() {
    let player = this.currentPlayer();
    if (!player) return;

    while (player && player.activeHandIndex < player.hands.length && player.hands[player.activeHandIndex].isStanding) {
      player.activeHandIndex += 1;
    }

    while (player && player.activeHandIndex >= player.hands.length) {
      this.activePlayerIndex += 1;
      player = this.currentPlayer();
      if (player) {
        while (player.activeHandIndex < player.hands.length && player.hands[player.activeHandIndex].isStanding) {
          player.activeHandIndex += 1;
        }
      }
    }

    if (this.activePlayerIndex >= this.players.length) {
      this.phase = 'dealerTurn';
      this.playDealer();
      return;
    }

    this.message = `Player ${this.activePlayerIndex + 1}'s turn.`;
  }

  resolveDealerBlackjack() {
    const summary: string[] = [];
    const dealerBJ = isBlackjack(this.dealer);

    this.players.forEach((player) => {
      const hand = player.hands[0];
      const playerBJ = isBlackjack(hand.cards);
      if (dealerBJ && playerBJ) {
        player.bankroll += hand.bet;
        summary.push(`P${player.id}: Push`);
      } else if (dealerBJ) {
        summary.push(`P${player.id}: Dealer BJ`);
      }
      if (dealerBJ && player.insuranceBet > 0) {
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
    const dealerY = 120;
    const rows = this.players.length;
    const rowGap = Math.min(130, Math.floor((window.innerHeight - 320) / Math.max(1, rows - 1 || 1)));

    this.dealer.forEach((card, i) => {
      const hidden = hideDealerHole && i === 1 && this.phase === 'playerTurn';
      const s = this.createCardVisual(card, hidden);
      s.targetX = 250 + i * 90;
      s.targetY = dealerY;
    });

    this.players.forEach((player, pIdx) => {
      const y = 280 + pIdx * rowGap;
      player.hands.forEach((hand, hIdx) => {
        hand.cards.forEach((card, cIdx) => {
          const s = this.createCardVisual(card);
          s.targetX = 110 + hIdx * 260 + cIdx * 90;
          s.targetY = y;
        });

        const total = handTotal(hand.cards).best;
        const marker = pIdx === this.activePlayerIndex && hIdx === player.activeHandIndex && this.phase === 'playerTurn' ? ' ◀' : '';
        const lbl = new Text({
          text: `P${player.id} H${hIdx + 1}${marker}\nTotal: ${total}\nBet: $${hand.bet}`,
          style: { fill: 0xffffff, fontSize: 14 },
        });
        lbl.position.set(110 + hIdx * 260, y + 125);
        this.table.addChild(lbl);
      });
    });

    const dealerText = this.phase === 'playerTurn' ? `Dealer shows: ${cardValue(this.dealer[0]?.rank ?? '2')}` : `Dealer total: ${handTotal(this.dealer).best}`;
    const dealerLbl = new Text({ text: dealerText, style: { fill: 0xffffff, fontSize: 18, fontWeight: 'bold' } });
    dealerLbl.position.set(250, 70);
    this.table.addChild(dealerLbl);
  }

  render() {
    const playerMoney = this.players.map((p) => `P${p.id}: $${p.bankroll} (Bet $${p.baseBet})`).join('<br/>');
    this.statusEl.innerHTML = `<strong>Status:</strong> ${this.message}<br/><strong>Phase:</strong> ${this.phase}<br/><strong>Players:</strong> ${this.playerCount}`;
    this.bankrollEl.innerHTML = `<strong>Money</strong><br/>${playerMoney}`;

    const player = this.currentPlayer();
    const hand = this.currentHand();
    const canAct = this.phase === 'playerTurn';
    const canDouble = canAct && !!player && !!hand && hand.cards.length === 2 && player.bankroll >= hand.bet;
    const canSplit =
      canAct &&
      !!player &&
      !!hand &&
      hand.cards.length === 2 &&
      cardValue(hand.cards[0].rank) === cardValue(hand.cards[1].rank) &&
      player.hands.length < RULES.maxHands &&
      player.bankroll >= hand.bet;

    this.controlsEl.innerHTML = '';
    const mk = (label: string, fn: () => void, disabled = false) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.disabled = disabled;
      b.onclick = fn;
      this.controlsEl.appendChild(b);
    };

    mk('2 Players', () => this.setPlayerCount(2), !(this.phase === 'betting' || this.phase === 'roundOver'));
    mk('3 Players', () => this.setPlayerCount(3), !(this.phase === 'betting' || this.phase === 'roundOver'));
    mk('4 Players', () => this.setPlayerCount(4), !(this.phase === 'betting' || this.phase === 'roundOver'));

    mk('Deal', () => this.dealRound(), !(this.phase === 'betting' || this.phase === 'roundOver'));
    mk('Hit', () => this.hit(), !canAct);
    mk('Stand', () => this.stand(), !canAct);
    mk('Double', () => this.double(), !canDouble);
    mk('Split', () => this.split(), !canSplit);
    mk('Surrender', () => this.surrender(), !(canAct && !!player && !!hand && hand.cards.length === 2 && player.hands.length === 1));
    mk('Insurance', () => this.insurance(), !(canAct && this.dealer[0]?.rank === 'A'));

    mk('Bet -', () => {
      if (!player) return;
      player.baseBet = Math.max(10, player.baseBet - 10);
      this.render();
    }, !(this.phase === 'betting' || this.phase === 'roundOver'));

    mk('Bet +', () => {
      if (!player) return;
      player.baseBet = Math.min(player.bankroll, player.baseBet + 10);
      this.render();
    }, !(this.phase === 'betting' || this.phase === 'roundOver'));
  }
}

const game = new BlackjackGame();
void game.init();

const tutorialOverlay = document.getElementById('tutorialOverlay') as HTMLDivElement;
const tutorialStep = document.getElementById('tutorialStep') as HTMLParagraphElement;
const playTutorialBtn = document.getElementById('playTutorial') as HTMLButtonElement;
const skipTutorialBtn = document.getElementById('skipTutorial') as HTMLButtonElement;

const tutorialSlides = [
  'Step 1: Choose 2, 3, or 4 players. Each player starts with $1000.',
  'Step 2: Press Deal to place each player bet and start the round.',
  'Step 3: Players take turns using Hit, Stand, Double, Split, Surrender, and Insurance.',
  'Step 4: Dealer stands on soft 17 and settles against every player hand.',
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
