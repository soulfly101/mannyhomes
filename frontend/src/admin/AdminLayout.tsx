import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { Building2, ExternalLink, FileSignature, KeyRound, LayoutDashboard, Moon, PenLine, Settings, Sun, Users, type LucideIcon } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { UserInitials } from "../components/UserInitials";
import { cn } from "@/lib/utils";
import { BRAND } from "../landing/content";

const SECTIONS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/buildings", label: "Buildings", icon: Building2 },
  { to: "/admin/allocations", label: "Allocations", icon: KeyRound },
  { to: "/admin/tenants", label: "Tenants", icon: Users },
  { to: "/admin/agreements", label: "Agreements", icon: FileSignature },
  { to: "/admin/signature", label: "Signature", icon: PenLine },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

const linkClass = "flex min-h-11 shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition duration-200 motion-safe:hover:translate-x-0.5";

const THEME_KEY = "altheo-admin-theme";
type Theme = "dark" | "light";

function savedTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

/** The admin area's dark or light look: dark to start with, remembered per browser, and only while in the admin area. */
function useAdminTheme() {
  const [theme, setTheme] = useState<Theme>(savedTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Private browsing: the choice just isn't remembered.
    }
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}

/** The admin area's frame: a sidebar on wide screens, a bar with a row of sections on phones. */
export function AdminLayout() {
  const { user, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const { theme, toggle } = useAdminTheme();

  const onLogout = async () => {
    setBusy(true);
    try {
      await logout();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background font-sans text-foreground md:grid md:grid-cols-[240px_minmax(0,1fr)] print:block">
      <aside className="sticky top-0 z-40 flex print:hidden flex-wrap items-center justify-between gap-2 border-b border-border bg-card p-3 md:h-dvh md:flex-col md:flex-nowrap md:items-stretch md:justify-start md:gap-6 md:border-b-0 md:border-r md:p-4">
        <Link to="/admin" className="flex min-h-11 items-center gap-3 text-foreground">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">{BRAND.monogram}</span>
          <span className="font-bold tracking-tight">{BRAND.name}</span>
        </Link>
        <nav aria-label="Admin" className="order-3 flex w-full gap-1 overflow-x-auto [scrollbar-width:none] md:order-none md:flex-1 md:flex-col md:overflow-visible">
          {SECTIONS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === "/admin"} className={({ isActive }) => cn(linkClass, isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground")}>
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
          <Link to="/" className={cn(linkClass, "text-muted-foreground hover:bg-secondary hover:text-foreground md:mt-auto")}>
            <ExternalLink className="h-5 w-5 shrink-0" aria-hidden="true" />
            View website
          </Link>
        </nav>
        <div className="flex items-center gap-2 md:justify-between md:border-t md:border-border md:pt-4">
          {user && <UserInitials name={user.name} className="bg-accent text-foreground" />}
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border transition duration-200 hover:bg-secondary"
          >
            {theme === "dark" ? <Sun className="h-5 w-5" aria-hidden="true" /> : <Moon className="h-5 w-5" aria-hidden="true" />}
          </button>
          <button type="button" disabled={busy} aria-busy={busy || undefined} onClick={() => void onLogout()} className="min-h-11 rounded-full border border-border px-4 text-sm font-semibold transition duration-200 hover:bg-secondary disabled:opacity-70">
            {busy ? "Please wait…" : "Log out"}
          </button>
        </div>
      </aside>
      <Outlet />
    </div>
  );
}
