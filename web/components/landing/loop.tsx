"use client";

import CurvedLoop from "@/components/reactbits/CurvedLoop/CurvedLoop";

const NAMES = ["English", "हिन्दी", "Hinglish", "मराठी", "বাংলা", "ગુજરાતી", "ಕನ್ನಡ", "മലയാളം", "ਪੰਜਾਬੀ", "தமிழ்", "తెలుగు"];

// Decorative only: the Languages section right below lists the same names as real text.
export function LanguageLoop() {
  return (
    <div className="ll-loop" aria-hidden="true">
      <CurvedLoop
        marqueeText={NAMES.join("  ✦  ")}
        separator="✦"
        separatorColor="#714cb6"
        shape="arc"
        curveAmount={120}
        speed={0.6}
        fontSize={64}
        fontWeight={400}
        interactive={false}
        edgeFade={0.12}
      />
    </div>
  );
}
