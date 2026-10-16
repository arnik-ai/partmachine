/** حرف اول نام شرکت برای وقتی که عکس پروفایل ندارد */
export function initialOf(name: string): string {
  return Array.from(name.trim())[0] ?? "؟";
}

/** رنگ ثابت هر شرکت (از روی نامش) تا جای عکس، همیشه همان رنگ دیده شود */
export function toneOf(name: string, tones: number): number {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return hash % tones;
}
