import { Fragment } from "react";

/** AI text with its light markdown shown properly: **bold** becomes bold, and stray markers are dropped. */
export default function Md({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  const clean = text
    .replace(/^#{1,6}\s+/gm, "") // headings
    .replace(/__(.+?)__/g, "**$1**");
  return (
    <>
      {clean.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4
          ? <b key={i}>{part.slice(2, -2)}</b>
          : <Fragment key={i}>{part.replace(/\*\*/g, "").replace(/(^|\s)\*(\S)/g, "$1$2")}</Fragment>,
      )}
    </>
  );
}

/** The same text as plain words, for places that can't show bold (tooltips, titles). */
export const stripMd = (text: string) => text.replace(/^#{1,6}\s+/gm, "").replace(/\*\*|__/g, "");
