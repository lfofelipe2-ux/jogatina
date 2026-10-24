import { describe, expect, it } from 'vitest';
import type { Card } from '@poker/engine';
import { RANKINGS, analyze, findRanking } from './cheatsheet';

const c = (s: string) => s.split(' ') as Card[];

describe('findRanking', () => {
  it('examples form their own ranking', () => {
    for (const r of RANKINGS) expect(findRanking(r.id, r.example), r.id).not.toBeNull();
  });

  it('finds the wheel and the highest straight', () => {
    expect(findRanking('straight', c('As 2d 3c 4h 5s'))).toEqual(c('5s 4h 3c 2d As'));
    expect(findRanking('straight', c('4h 5s 6d 7c 8h 9s'))).toEqual(c('9s 8h 7c 6d 5s'));
    expect(findRanking('straight', c('As Kd Qc Jh 9s'))).toBeNull();
  });

  it('tells royal from a lower straight flush', () => {
    expect(findRanking('royal-flush', c('Ah Kh Qh Jh Th 2c'))).not.toBeNull();
    expect(findRanking('royal-flush', c('9h Kh Qh Jh Th'))).toBeNull();
    expect(findRanking('straight-flush', c('9h Kh Qh Jh Th'))).toEqual(c('Kh Qh Jh Th 9h'));
  });

  it('builds a full house from two trips', () => {
    expect(findRanking('full-house', c('8s 8h 8d 5c 5s 5h'))).toEqual(c('8s 8h 8d 5c 5s'));
  });
});

describe('analyze', () => {
  it('marks the best made hand and one-card draws on the flop', () => {
    // Pair of jacks; any K, 8 or 5 makes two pair, a J makes trips.
    const a = analyze(c('Jh Kd'), c('Jc 8d 5s'));
    expect(a.best).toBe('pair');
    expect(a.rows.pair.made).toEqual(c('Jh Jc'));
    expect(a.rows['two-pair'].outs).toBe(9);
    expect(a.rows.trips.outs).toBe(2);
    expect(a.rows.straight.outs).toBe(0);
    expect(a.rows.flush.outs).toBe(0);
  });

  it('counts a flush draw and an open-ended straight draw', () => {
    const a = analyze(c('9h Th'), c('Jh 8c 2h'));
    expect(a.best).toBe('high-card');
    expect(a.rows.flush.outs).toBe(9);
    expect(a.rows.flush.draw).toHaveLength(4);
    expect(a.rows.straight.outs).toBe(8); // 7s and Qs, any suit
    expect(a.rows['straight-flush'].outs).toBe(0);
  });

  it('counts an inside straight draw', () => {
    const a = analyze(c('9s 8d'), c('6c 5h Kd'));
    expect(a.rows.straight.outs).toBe(4); // any 7
    expect(a.rows.straight.draw).toEqual(c('9s 8d 6c 5h'));
  });

  it('shows no draws once the board is complete', () => {
    const a = analyze(c('9h Th'), c('Jh 8c 2h 3s 4d'));
    expect(a.rows.flush.outs).toBe(0);
    expect(a.rows.straight.outs).toBe(0);
  });

  it('knows nothing without hole cards', () => {
    const a = analyze(null, c('Jc 8d 5s'));
    expect(a.best).toBeNull();
    expect(a.rows['high-card'].made).toBeNull();
  });

  it('preflop pocket pair draws to trips only', () => {
    const a = analyze(c('7s 7d'), []);
    expect(a.best).toBe('pair');
    expect(a.rows.trips.outs).toBe(2);
    expect(a.rows.straight.outs).toBe(0);
  });
});
