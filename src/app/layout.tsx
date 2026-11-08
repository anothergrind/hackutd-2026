import type { Metadata } from "next";
import { Libre_Franklin } from "next/font/google";
import Rail from "@/components/shell/Rail";
import "./globals.css";
import "./shell.css";

// One typeface for the whole app: Libre Franklin (Franklin Gothic style, close to CBRE's corporate type).
const franklin = Libre_Franklin({ variable: "--font-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "OpsCrew",
  description: "Nemotron agents that catch building failures early, price them, and fix them after a manager approves.",
};

// Apply ?theme= or the saved light/dark choice before first paint.
const themeScript = `try{var p=new URLSearchParams(location.search),q=p.get("theme");if(q==="light"||q==="dark")localStorage.setItem("opscrew-theme",q);var t=localStorage.getItem("opscrew-theme")||"light";document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={franklin.variable} suppressHydrationWarning>
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
