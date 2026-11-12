"use client";

import { useSession } from "../auth/auth-context";
import en from "./dictionaries/en.json";
import hi from "./dictionaries/hi.json";
import mr from "./dictionaries/mr.json";

export type Dictionary = typeof en;

const dictionaries: Record<"en" | "hi" | "mr", Dictionary> = {
  en,
  hi,
  mr,
};

export function useI18n() {
  const { language } = useSession();
  const dict = dictionaries[language] ?? en;

  return {
    t: dict,
    lang: language,
  };
}

