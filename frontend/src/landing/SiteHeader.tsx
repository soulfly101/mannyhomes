import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Menu, X } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { UserInitials } from "../components/UserInitials";
import { cn } from "@/lib/utils";
import { BRAND, NAV_LINKS } from "./content";
import { buttonClass, navLinkClass } from "./parts";

function AccountLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  if (user === undefined) return null;
  if (!user) {
    return (
      <>
        <Link to="/login" onClick={onNavigate} className={cn(navLinkClass, "text-sm font-medium")}>
          Log in
        </Link>
        <Link to="/register" onClick={onNavigate} className={cn(buttonClass, "bg-white text-ink hover:bg-white/90")}>
          Sign up
        </Link>
      </>
    );
  }
  return (
    <>
      {user.role === "admin" && (
        <>
          <Link to="/admin/buildings" onClick={onNavigate} className={cn(navLinkClass, "text-sm font-medium")}>
            Buildings
          </Link>
          <Link to="/admin/allocations" onClick={onNavigate} className={cn(navLinkClass, "text-sm font-medium")}>
            Allocations
          </Link>
        </>
      )}
      {user.role === "tenant" && (
        <>
          <Link to="/dashboard" onClick={onNavigate} className={cn(navLinkClass, "text-sm font-medium")}>
            Dashboard
          </Link>
          <Link to="/bookings" onClick={onNavigate} className={cn(navLinkClass, "text-sm font-medium")}>
            My bookings
          </Link>
        </>
      )}
      <UserInitials name={user.name} className="bg-white text-ink" />
      <button type="button" onClick={() => void logout()} className="min-h-11 text-sm font-medium text-white/90 underline-offset-4 hover:text-white hover:underline">
        Log out
      </button>
    </>
  );
}

/** The site menu (logo, sections, account links, phone menu). White on dark: over the hero video or on an ink bar. */
export function SiteNav({ label = "Main", menuId = "mobile-menu" }: { label?: string; menuId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <nav aria-label={label} className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Link to="/" className="group flex min-h-11 shrink-0 items-center gap-3 whitespace-nowrap text-white">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-white text-xl font-bold tracking-tight text-ink transition-transform duration-300 ease-out motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:-rotate-6">
            {BRAND.monogram}
          </span>
          <span className="text-2xl font-bold tracking-tight">{BRAND.name}</span>
        </Link>
        <ul className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((n) => (
            <li key={n.href}>
              <Link to={n.href} className={cn(navLinkClass, "text-sm font-semibold")}>
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="hidden items-center gap-5 whitespace-nowrap lg:flex">
          <AccountLinks />
        </div>
        <button
          type="button"
          className="grid h-11 w-11 place-items-center rounded-md border border-white/30 lg:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>
      {open && (
        <div id={menuId} className="mx-4 mb-4 flex max-h-[75dvh] flex-col gap-4 overflow-y-auto rounded-xl bg-ink p-5 lg:hidden">
          {NAV_LINKS.map((n) => (
            <Link key={n.href} to={n.href} onClick={() => setOpen(false)} className="flex min-h-11 items-center text-base font-medium text-white">
              {n.label}
            </Link>
          ))}
          <div className="flex flex-wrap items-center gap-4 border-t border-white/15 pt-4">
            <AccountLinks onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}

/** Header for every page except the home page (whose hero has the menu over the video): stays at the top while scrolling. */
export function SiteHeader() {
  return (
    <header id="top" className="sticky top-0 z-50 bg-ink text-white shadow-sm print:hidden">
      <SiteNav />
    </header>
  );
}

/** Home page: once the hero has scrolled away, the menu slides down and stays at the top. */
export function StickyHomeHeader() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const hero = document.getElementById("top");
    if (!hero || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setShow(!entry?.isIntersecting));
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);
  if (!show) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-ink text-white shadow-sm motion-safe:animate-in motion-safe:slide-in-from-top">
      <SiteNav label="Main, while scrolling" menuId="mobile-menu-sticky" />
    </div>
  );
}
