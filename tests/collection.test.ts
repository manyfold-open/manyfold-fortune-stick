import { describe, expect, it } from 'vitest';
import { STICK_TOTAL, addToCollection, collectedCount, collectionFrom, parseCollection } from '../src/shared/collection';

const record = (id: string, stickNo: number, createdAt: string) => ({ id, stickNo, createdAt });

describe('籤譜', () => {
  it('一共 36 支', () => {
    expect(STICK_TOTAL).toBe(36);
  });

  it('從記錄回填：同一支留最早那次，排除這一局本身，壞籤號略過', () => {
    const collection = collectionFrom(
      [
        record('now', 7, '2026-09-28T10:00:00Z'),
        record('b', 3, '2026-09-27T10:00:00Z'),
        record('a', 3, '2026-09-20T10:00:00Z'),
        record('x', 99, '2026-09-20T10:00:00Z'),
      ],
      'now',
    );
    expect(collection).toEqual({ 3: '2026-09-20T10:00:00Z' });
  });

  it('沒收過的才算新；收過的不改第一次的時間', () => {
    const first = addToCollection({}, 5, '2026-09-28T10:00:00Z');
    expect(first.isNew).toBe(true);
    expect(collectedCount(first.collection)).toBe(1);
    const again = addToCollection(first.collection, 5, '2026-09-29T10:00:00Z');
    expect(again.isNew).toBe(false);
    expect(again.collection[5]).toBe('2026-09-28T10:00:00Z');
  });

  it('收齊 36 支', () => {
    let collection = {};
    for (let no = 1; no <= 36; no += 1) collection = addToCollection(collection, no, 't').collection;
    expect(collectedCount(collection)).toBe(STICK_TOTAL);
  });

  it('壞掉的存檔：不是物件就回填，物件裡只留合法的', () => {
    expect(parseCollection(null)).toBeNull();
    expect(parseCollection([1, 2])).toBeNull();
    expect(parseCollection('x')).toBeNull();
    expect(parseCollection({ 1: 't', 0: 't', 37: 't', 2: 5, abc: 't' })).toEqual({ 1: 't' });
  });
});
