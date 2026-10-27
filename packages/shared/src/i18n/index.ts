import { EN, type I18nKey } from './en';
import { ES } from './es';

export type Lang = 'en' | 'es';

const TABLES: Record<Lang, Partial<Record<I18nKey, string>>> = {
  en: EN,
  es: ES,
};

// Resolve a key for a given language; falls back to EN, then to the key itself.
// Supports {{var}} substitution from `vars`.
export function t(
  key: I18nKey,
  lang: Lang = 'en',
  vars?: Record<string, string | number>,
): string {
  const tpl = TABLES[lang]?.[key] ?? EN[key] ?? key;
  if (!vars) return tpl;
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    const v = vars[name];
    return v === undefined || v === null ? '' : String(v);
  });
}

export { EN, ES };
export type { I18nKey };
