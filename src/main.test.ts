import { describe, expect, it } from 'vitest';

function cardValue(rank: string): number {
  if (rank === 'A') return 11;
  if (['J', 'Q', 'K'].includes(rank)) return 10;
  return Number(rank);
}

function handTotal(ranks: string[]): number {
  let total = ranks.reduce((sum, r) => sum + cardValue(r), 0);
  let aces = ranks.filter((r) => r === 'A').length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

describe('hand totals', () => {
  it('handles soft aces', () => {
    expect(handTotal(['A', '6'])).toBe(17);
    expect(handTotal(['A', '6', 'A'])).toBe(18);
  });

  it('handles blackjack', () => {
    expect(handTotal(['A', 'K'])).toBe(21);
  });

  it('handles bust conversion with aces', () => {
    expect(handTotal(['A', '9', '5'])).toBe(15);
  });
});
