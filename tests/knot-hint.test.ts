import { describe, expect, it } from 'vitest';
import { glowKnots, peekOnTie, readKnotHint } from '../src/shared/knot-hint';

describe('繩結的提示', () => {
  it('從沒點開過結：結有微光，第一次打結時自己解開一下', () => {
    const hint = { seen: false, peeked: false };
    expect(glowKnots(hint)).toBe(true);
    expect(peekOnTie(hint)).toBe(true);
  });

  it('自己解開過一次就不再解開，但微光還在，直到真的點過', () => {
    const hint = { seen: false, peeked: true };
    expect(peekOnTie(hint)).toBe(false);
    expect(glowKnots(hint)).toBe(true);
  });

  it('點開過結之後，微光與自動解開都永遠停止', () => {
    const hint = { seen: true, peeked: false };
    expect(glowKnots(hint)).toBe(false);
    expect(peekOnTie(hint)).toBe(false);
  });

  it('本機存的值：只有 "1" 算數，其他當沒有', () => {
    expect(readKnotHint('1', '1')).toEqual({ seen: true, peeked: true });
    expect(readKnotHint(null, null)).toEqual({ seen: false, peeked: false });
    expect(readKnotHint('yes', '0')).toEqual({ seen: false, peeked: false });
  });
});
