"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { logout } from "@/app/(auth)/actions";
import { Logo } from "./Logo";

type Props = { user: { name: string; home: string } | null; overHero?: boolean };

const SECTIONS = [
  {
    id: "how",
    title: "How it works",
    body: (
      <ol className="m-0 flex list-none flex-col gap-3 p-0 pb-4">
        {[
          ["Create your account", "Your name, phone number and email."],
          ["See prices and choose", "Prices show once you're logged in. Pay a refundable GH₵ 200 booking deposit and we hold the apartment for you for 48 hours."],
          ["Get approved, pay your security deposit", "Once the manager approves you, your booking deposit is refunded and you pay the security deposit by Mobile Money or card."],
          ["Move in and pay rent", "Get a reminder before each payment is due."],
        ].map(([t, s], i) => (
          <li key={t} className="grid grid-cols-[34px_1fr] gap-3">
            <span className="grid h-[34px] w-[34px] place-items-center rounded-full text-sm font-semibold" style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>{i + 1}</span>
            <div><b className="block">{t}</b><span className="text-[0.92rem]" style={{ color: "var(--muted)" }}>{s}</span></div>
          </li>
        ))}
      </ol>
    ),
  },
  {
    id: "services",
    title: "Tenant services",
    body: (
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0 pb-4">
        {[
          ["Report a problem", "Ask for a plumber, an electrician or another tradesperson, or report a problem in the building."],
          ["Book cleaning", "Standard, deep or move-out cleaning on a day you choose."],
          ["Rent and receipts", "Pay rent and the sanitation fee, and keep every receipt."],
        ].map(([t, s]) => (
          <li key={t} className="rounded-2xl p-3.5" style={{ background: "var(--glass)", border: "1px solid var(--glass-line)" }}>
            <b className="block">{t}</b><span className="text-[0.92rem]" style={{ color: "var(--muted)" }}>{s}</span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <div className="flex flex-col gap-2 pb-4" style={{ color: "var(--muted)" }}>
        <span><b style={{ color: "var(--fg)" }}>Phone</b> +233 00 000 0000</span>
        <span><b style={{ color: "var(--fg)" }}>Email</b> hello@altheohomes.com</span>
        <span><b style={{ color: "var(--fg)" }}>Office</b> Mon–Sat, 8:00–18:00</span>
      </div>
    ),
  },
];

export function SiteNav({ user, overHero = false }: Props) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<string | null>("how");
  const closeRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => {
    setOpen(false);
    menuRef.current?.focus();
  };
  const linkColor = overHero ? "#fff" : "var(--fg)";

  return (
    <>
      <nav className="wrap sticky z-20 w-full pt-4" style={{ top: "env(safe-area-inset-top, 0px)" }} aria-label="Main">
        <div className={`${overHero ? "hglass" : "glass"} flex items-center gap-3 rounded-full py-2 pl-[18px] pr-2`}>
          <div className="mr-auto"><Logo light={overHero} /></div>
          <Link href="/#apartments" className="hidden rounded-full px-3 py-2 font-medium no-underline md:inline" style={{ color: linkColor }}>Apartments</Link>
          {user ? (
            <>
              <Link href={user.home} className="hidden rounded-full px-3 py-2 font-medium no-underline sm:inline" style={{ color: linkColor }}>
                Hi, {user.name.split(" ")[0]}
              </Link>
              <Link href={user.home} className="btn btn-primary">My account</Link>
            </>
          ) : (
            <>
              <Link href="/login" className={`btn ${overHero ? "btn-ghost" : "btn-soft"} hidden sm:inline-flex`}>Log in</Link>
              <Link href="/register" className="btn btn-primary">Sign up</Link>
            </>
          )}
          <button
            ref={menuRef}
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="drawer"
            className="grid h-[42px] w-[42px] cursor-pointer place-items-center rounded-full transition-transform duration-300 hover:rotate-90"
            style={{ border: overHero ? "1px solid rgba(255,255,255,.45)" : "1px solid var(--glass-line)", background: overHero ? "rgba(255,255,255,.12)" : "var(--glass)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={overHero ? "#fff" : "currentColor"} strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10" /></svg>
          </button>
        </div>
      </nav>

      <div
        onClick={close}
        className="fixed inset-0 z-40 transition-opacity duration-500"
        style={{ background: "var(--scrim)", backdropFilter: "blur(4px)", opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }}
      />
      <aside
        id="drawer"
        aria-label="Menu"
        aria-hidden={!open}
        inert={!open}
        className="glass fixed bottom-0 right-0 top-0 z-50 w-[min(420px,100%)] overflow-y-auto rounded-l-[28px] px-[26px] pb-[26px] pt-[22px]"
        style={{ background: "var(--glass-strong)", transform: open ? "none" : "translateX(105%)", transition: "transform .6s var(--ease)" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <Logo />
          <button ref={closeRef} onClick={close} aria-label="Close menu" className="grid h-10 w-10 cursor-pointer place-items-center rounded-full transition-transform duration-300 hover:rotate-90" style={{ border: "1px solid var(--glass-line)", background: "var(--glass)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        {SECTIONS.map((s) => {
          const isOpen = section === s.id;
          return (
            <div key={s.id} style={{ borderTop: "1px solid var(--glass-line)" }}>
              <button
                onClick={() => setSection(isOpen ? null : s.id)}
                aria-expanded={isOpen}
                aria-controls={`sec-${s.id}`}
                className="flex w-full cursor-pointer items-center justify-between border-0 bg-transparent px-0.5 py-[18px] text-[1.2rem] font-semibold"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {s.title}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ transition: "transform .45s var(--ease)", transform: isOpen ? "rotate(45deg)" : "none" }}><path d="M12 5v14M5 12h14" /></svg>
              </button>
              <div id={`sec-${s.id}`} className="grid" style={{ gridTemplateRows: isOpen ? "1fr" : "0fr", transition: "grid-template-rows .5s var(--ease)" }}>
                <div className="overflow-hidden">{s.body}</div>
              </div>
            </div>
          );
        })}

        <div className="mt-5 flex gap-2.5">
          {user ? (
            <>
              <Link href={user.home} className="btn btn-primary flex-1" onClick={close}>My account</Link>
              <form action={logout} className="flex-1"><button className="btn btn-soft w-full">Log out</button></form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-soft flex-1">Log in</Link>
              <Link href="/register" className="btn btn-primary flex-1">Sign up</Link>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
