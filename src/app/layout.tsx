import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import Rail from "@/components/shell/Rail";
import "./globals.css";
import "./shell.css";

const sans = IBM_Plex_Sans({ variable: "--font-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const mono = IBM_Plex_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500"] });
const serif = Source_Serif_4({ variable: "--font-serif", subsets: ["latin"], weight: ["400", "600", "700"] });

export const metadata: Metadata = {
  title: "OpsCrew",
  description: "Nemotron agents that catch building failures early, price them, and fix them after a manager approves.",
};

// Apply ?theme= or the saved light/dark choice before first paint.
const themeScript = `try{var p=new URLSearchParams(location.search),q=p.get("theme");if(q==="light"||q==="dark")localStorage.setItem("opscrew-theme",q);var t=localStorage.getItem("opscrew-theme")||"light";document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <div className="app">
          <Rail />
          <main className="page">{children}</main>
        </div>
      </body>
    </html>
  );
}
