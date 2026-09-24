import { describe, expect, it } from 'vitest';
import { withoutDashes } from '../src/shared/text';

describe('display text punctuation', () => {
  it('removes typographic dash characters without touching ordinary hyphens', () => {
    expect(withoutDashes('一步——再一步 — keep-going – 继续')).toBe('一步 再一步 keep-going 继续');
    expect(withoutDashes('AI Fortune Stick')).toBe('AI Fortune Stick');
  });

  it('treats a spaced or doubled hyphen as a dash', () => {
    expect(withoutDashes('Wait - then act')).toBe('Wait then act');
    expect(withoutDashes('Wait--then act')).toBe('Wait then act');
    expect(withoutDashes('a well-worn path')).toBe('a well-worn path');
  });
});
