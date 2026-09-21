/**
 * i18next: `ru` по умолчанию, `en` — заготовка. Словари `<ns>.<lng>.json` подхватываются
 * через import.meta.glob — агент фичи добавляет свой namespace без правки этого файла.
 */
import i18n, { type Resource } from 'i18next';
import { initReactI18next } from 'react-i18next';

export const DEFAULT_LANGUAGE = 'ru';
export const SUPPORTED_LANGUAGES = ['ru', 'en'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const NAMESPACES = [
  'common',
  'auth',
  'student',
  'parent',
  'teacher',
  'notifications',
] as const;

const modules = import.meta.glob<Record<string, unknown>>('./*.*.json', {
  eager: true,
  import: 'default',
});

function buildResources(): Resource {
  const resources: Resource = {};
  for (const [path, dict] of Object.entries(modules)) {
    const match = /\.\/([a-z-]+)\.([a-z]{2})\.json$/i.exec(path);
    if (!match) continue;
    const [, ns, lng] = match as unknown as [string, string, string];
    resources[lng] ??= {};
    resources[lng][ns] = dict;
  }
  return resources;
}

void i18n.use(initReactI18next).init({
  resources: buildResources(),
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  ns: [...NAMESPACES],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function setLanguage(lng: string): Promise<unknown> {
  const target = (SUPPORTED_LANGUAGES as readonly string[]).includes(lng) ? lng : DEFAULT_LANGUAGE;
  if (i18n.language === target) return Promise.resolve();
  return i18n.changeLanguage(target);
}

export { i18n };
export default i18n;
