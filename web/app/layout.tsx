import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Noto_Sans_Devanagari, IBM_Plex_Mono,
  Noto_Sans_Bengali, Noto_Sans_Gujarati, Noto_Sans_Gurmukhi, Noto_Sans_Kannada, Noto_Sans_Malayalam, Noto_Sans_Tamil, Noto_Sans_Telugu } from "next/font/google";
import { Agentation } from "agentation";
import "./globals.css";

const sansLatin = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans-latin",
  display: "swap",
});
const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-devanagari",
  display: "swap",
});
const bengali = Noto_Sans_Bengali({
  subsets: ["bengali"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-bengali",
  display: "swap",
});
const gujarati = Noto_Sans_Gujarati({
  subsets: ["gujarati"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-gujarati",
  display: "swap",
});
const gurmukhi = Noto_Sans_Gurmukhi({
  subsets: ["gurmukhi"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-gurmukhi",
  display: "swap",
});
const kannada = Noto_Sans_Kannada({
  subsets: ["kannada"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-kannada",
  display: "swap",
});
const malayalam = Noto_Sans_Malayalam({
  subsets: ["malayalam"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-malayalam",
  display: "swap",
});
const tamil = Noto_Sans_Tamil({
  subsets: ["tamil"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-tamil",
  display: "swap",
});
const telugu = Noto_Sans_Telugu({
  subsets: ["telugu"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-telugu",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-mono",
  display: "swap",
});

// Indic script fallbacks; unlayered so it overrides the @theme font stacks in globals.css without editing that file.

export const metadata: Metadata = {
  title: "LoanLoop · Voice Banking Desk",
  description: "Secure multilingual voice service desk for Sahyadri Finance Bank.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${sansLatin.variable} ${devanagari.variable} ${bengali.variable} ${gujarati.variable} ${gurmukhi.variable} ${kannada.variable} ${malayalam.variable} ${tamil.variable} ${telugu.variable} ${mono.variable}`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("loanloop.theme");if(t){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen antialiased selection:bg-secondary-container selection:text-primary">
        {children}
        {process.env.NODE_ENV === "development" && <Agentation endpoint="http://localhost:4747" />}
      </body>
    </html>
  );
}
