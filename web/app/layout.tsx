import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Noto_Sans_Devanagari, IBM_Plex_Mono } from "next/font/google";
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
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LoanLoop · Voice Banking Desk",
  description: "Secure multilingual voice service desk for Sahyadri Finance Bank. Demo with synthetic data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${sansLatin.variable} ${devanagari.variable} ${mono.variable}`}
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
