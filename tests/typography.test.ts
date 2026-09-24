import { describe, expect, it } from 'vitest';
import stylesheet from '../src/app/styles.css?raw';

// 字体只有三个角色（styles.css :root 的 --font-mincho / --font-hand / --font-mono）。
// 以前各处自己写字体顺序，最后长出六套字：同一句英文在绘马、签纸、续页上是三种字。
const css = stylesheet.replace(/\/\*[\s\S]*?\*\//g, '');

/** 每条规则的选择器和内容；@media 这类外层只剥掉一层，里面的规则照样拿得到。 */
function rules(source: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    out.push({ selector: m[1].trim().replace(/^@[^{]*$/, ''), body: m[2] });
  }
  return out;
}

describe('字体', () => {
  it('除了 @font-face，font-family 和 font 简写只准用 --font-* 变量或 inherit', () => {
    const offenders: string[] = [];
    for (const { selector, body } of rules(css)) {
      if (body.includes('src:') && body.includes('font-family')) continue; // @font-face
      for (const decl of body.split(';')) {
        const m = decl.match(/^\s*(font-family|font)\s*:\s*(.+)$/s);
        if (!m) continue;
        const value = m[2].trim();
        if (value === 'inherit') continue;
        if (!/var\(--font-(mincho|hand|mono)\)\s*$/.test(value)) offenders.push(`${selector} { ${m[1]}: ${value} }`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('不再有旧的字体变量', () => {
    expect(css).not.toMatch(/var\(--(serif|serif-en|sans|mono|round)\)/);
  });
});
