/** The Canary mark: a bold "C" that is also a canary's head (a beak on the top end, an eye inside). */
export default function Logo({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M22.2 10.6 A9 9 0 1 0 22.2 23.4" fill="none" stroke="currentColor" strokeWidth="4.6" strokeLinecap="round" />
      <path d="M21.4 8.2 L28.6 11.3 L22.6 14.2 Z" fill="currentColor" strokeLinejoin="round" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="16.6" cy="13.4" r="1.9" fill="currentColor" />
    </svg>
  );
}
