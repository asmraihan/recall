import { DEFAULT_LANGUAGE_PREFERENCES } from '@/lib/languages';

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  mainLanguage: string | null;
  translationLanguages: unknown;
  preferredVoice: string | null;
};

export type MobileUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  mainLanguage: string;
  translationLanguages: string[];
  preferredVoice: string | null;
};

/** The single shape every /api/mobile/* route returns for the signed-in user. */
export function publicUser(user: UserRow): MobileUser {
  const langs = Array.isArray(user.translationLanguages)
    ? (user.translationLanguages as string[])
    : [...DEFAULT_LANGUAGE_PREFERENCES.translationLanguages];
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role ?? 'user',
    mainLanguage: user.mainLanguage ?? DEFAULT_LANGUAGE_PREFERENCES.mainLanguage,
    translationLanguages: langs,
    preferredVoice: user.preferredVoice,
  };
}
