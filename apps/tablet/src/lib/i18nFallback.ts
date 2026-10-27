// BR-11 fallback — name_i18n / description_i18n 같은 jsonb를 화면에 렌더.
//
// 우선순위: requested lang → store default_language → 'en' → placeholder.
// 빈 객체 또는 null 입력 시 placeholder 반환 (caller가 빈 카드 방지).

import type { I18nString, SupportedLang } from '@restosync/shared';

const PLACEHOLDER = '(no name)';

export function renderI18n(
  value: I18nString | null | undefined,
  lang: SupportedLang | undefined = 'en',
  defaultLang: SupportedLang = 'en',
  placeholder: string = PLACEHOLDER,
): string {
  if (!value) return placeholder;
  const candidates: (SupportedLang | undefined)[] = [lang, defaultLang, 'en'];
  for (const k of candidates) {
    if (!k) continue;
    const v = value[k];
    if (typeof v === 'string' && v.trim().length > 0) return v;
  }
  // 모든 값이 비어있으면 placeholder
  return placeholder;
}
