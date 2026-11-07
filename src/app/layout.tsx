import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Rail from "@/components/shell/Rail";
import "./globals.css";
import s from "./layout.module.css";

const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["300", "400", "500", "600"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "OpsCrew",
  description: "Nemotron agents that catch building failures early, price them, and fix them after a manager approves.",
};

// Apply ?theme=, the saved choice or the system theme before first paint.
const themeScript = `try{var q=new URLSearchParams(location.search).get("theme");if(q==="light"||q==="dark")localStorage.setItem("opscrew-theme",q);var t=localStorage.getItem("opscrew-theme")||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <div className={s.app}>
          <Rail />
          <main className={s.page}>{children}</main>
        </div>
      </body>
    </html>
  );
}
