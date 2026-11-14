"use client";

import { useSession, type SupportedLang } from "../user/session";
import en from "./dictionaries/en.json";
import hi from "./dictionaries/hi.json";
import mr from "./dictionaries/mr.json";
import hinglish from "./dictionaries/hinglish.json";
import bn from "./dictionaries/bn.json";
import gu from "./dictionaries/gu.json";
import kn from "./dictionaries/kn.json";
import ml from "./dictionaries/ml.json";
import pa from "./dictionaries/pa.json";
import ta from "./dictionaries/ta.json";
import te from "./dictionaries/te.json";

export type Dictionary = typeof en;

// Record over every language code: tsc fails if a code is missing, and each JSON must match en's shape (every key).
const dictionaries: Record<SupportedLang, Dictionary> = { en, hi, mr, hinglish, bn, gu, kn, ml, pa, ta, te };

export function useI18n() {
  const { language } = useSession();
  const d = dictionaries[language] ?? en;
  // Runtime safety net: any section/key missing at runtime falls back to English.
  const t = Object.fromEntries(
    Object.entries(en).map(([sec, vals]) => [sec, { ...vals, ...(d as Record<string, object>)[sec] }]),
  ) as Dictionary;

  return { t, lang: language };
}
