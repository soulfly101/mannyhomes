import Link from "next/link";
import { logout } from "@/app/(auth)/actions";
import { Ambient } from "./Ambient";
import { Logo } from "./Logo";

type Props = { name: string; subtitle?: string; tabs: { href: string; label: string }[]; current: string; children: React.ReactNode };

/** Shell for the tenant, manager and staff areas: glass top bar with tabs and a log-out button. */
export function AppShell({ name, subtitle, tabs, current, children }: Props) {
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <>
      <Ambient />
      <header className="wrap sticky z-20 pt-3.5" style={{ top: "env(safe-area-inset-top, 0px)" }}>
        <div className="glass flex items-center gap-3.5 rounded-full py-2 pl-[18px] pr-2">
          <div className="mr-auto"><Logo /></div>
          <nav className="flex gap-0.5 overflow-x-auto max-[900px]:hidden" aria-label="Sections">
            {tabs.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                aria-current={t.href === current ? "page" : undefined}
                className="whitespace-nowrap rounded-full px-3.5 py-2 font-medium no-underline transition-colors duration-300"
                style={t.href === current ? { background: "var(--accent)", color: "var(--accent-ink)" } : { color: "var(--muted)" }}
              >
                {t.label}
              </Link>
            ))}
          </nav>
          <span className="flex items-center gap-2.5 whitespace-nowrap rounded-full py-1 pl-3 pr-1" style={{ background: "var(--glass)", border: "1px solid var(--glass-line)" }}>
            {subtitle && <small className="max-[560px]:hidden" style={{ color: "var(--muted)" }}>{subtitle}</small>}
            <span className="grid h-8 w-8 place-items-center rounded-full text-[0.85rem] font-semibold" style={{ background: "var(--accent)", color: "var(--accent-ink)" }} aria-hidden="true">{initials}</span>
          </span>
          <form action={logout}><button className="btn btn-soft">Log out</button></form>
        </div>
        <nav className="glass mt-2 flex gap-0.5 overflow-x-auto rounded-full p-1 min-[901px]:hidden" aria-label="Sections">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              aria-current={t.href === current ? "page" : undefined}
              className="whitespace-nowrap rounded-full px-3.5 py-1.5 text-[0.92rem] font-medium no-underline"
              style={t.href === current ? { background: "var(--accent)", color: "var(--accent-ink)" } : { color: "var(--muted)" }}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="wrap pb-16 pt-8">{children}</main>
    </>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="glass rounded-[22px] p-5">
      <small className="block text-[0.78rem] font-semibold uppercase tracking-[0.07em]" style={{ color: "var(--muted)" }}>{label}</small>
      <b className="block text-[2rem] tabular-nums" style={{ fontFamily: "var(--font-display)" }}>{value}</b>
      {hint && <span className="text-[0.88rem]" style={{ color: "var(--muted)" }}>{hint}</span>}
    </div>
  );
}
