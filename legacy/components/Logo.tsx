import Link from "next/link";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 no-underline whitespace-nowrap" style={{ color: light ? "#fff" : "var(--fg)" }}>
      <span className="grid h-[30px] w-[30px] place-items-center rounded-[10px]" style={{ background: "linear-gradient(140deg,#fff,var(--sky))", border: "1px solid var(--glass-line)" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0A2540" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 11 12 4l9 7" />
          <path d="M6 10v9h12v-9" />
        </svg>
      </span>
      <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "1.15rem" }}>Altheo Homes</span>
    </Link>
  );
}
