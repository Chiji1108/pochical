import { jaModel, Parser } from "budoux";

// Japanese has no spaces, so a browser may break a line in the middle of a
// word (メ／ンバー). BudouX, the model behind Chrome's word-break:
// auto-phrase, finds the phrases a line may break between; the site's JSX
// runtime (src/jsx) marks them with <wbr> on every browser, Safari too.

const parser = new Parser(jaModel);

const JAPANESE = /[\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Han}]/u;

// The same words render again and again; keep the most recent ones.
const CACHE_SIZE = 2000;
const cache = new Map<string, string[]>();

export function phrasesOf(text: string): string[] {
  if (!JAPANESE.test(text)) {
    return [text];
  }
  const cached = cache.get(text);
  if (cached !== undefined) {
    return cached;
  }
  const phrases = parser.parse(text);
  if (cache.size >= CACHE_SIZE) {
    const [oldest] = cache.keys();
    cache.delete(oldest);
  }
  cache.set(text, phrases);
  return phrases;
}
