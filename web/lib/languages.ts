// Mirror of i18n/languages.json (the registry). Keep in sync when a mode is added.
export const LANGUAGES = [
  { code: "en", name: "English", native: "English", beta: false },
  { code: "hi", name: "Hindi", native: "हिंदी", beta: false },
  { code: "hinglish", name: "Hinglish", native: "Hinglish", beta: false },
  { code: "mr", name: "Marathi", native: "मराठी", beta: false },
  { code: "bn", name: "Bengali", native: "বাংলা", beta: true },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી", beta: true },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ", beta: true },
  { code: "ml", name: "Malayalam", native: "മലയാളം", beta: true },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ", beta: true },
  { code: "ta", name: "Tamil", native: "தமிழ்", beta: true },
  { code: "te", name: "Telugu", native: "తెలుగు", beta: true },
] as const;

/** "தமிழ் (beta)" for a registry code; unknown codes are shown as-is. */
export function langLabel(code: string | undefined | null): string {
  const l = LANGUAGES.find((x) => x.code === code);
  return l ? l.native + (l.beta ? " (beta)" : "") : (code ?? "");
}
