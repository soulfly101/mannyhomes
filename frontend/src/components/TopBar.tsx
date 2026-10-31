import { useState } from "react";
import { Link, NavLink } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { Button } from "./Button";

/** Glass top bar (DESIGN.md → Navigation): name on the left, account actions on the right. */
export function TopBar() {
  const { user, logout } = useAuth();
  const [busy, setBusy] = useState(false);

  const onLogout = async () => {
    setBusy(true);
    try {
      await logout();
    } finally {
      setBusy(false);
    }
  };

  return (
    <header className="wrap topbar-wrap">
      <div className="glass topbar">
        <Link to="/" className="topbar-logo">
          Altheo Homes
        </Link>
        {user?.role === "admin" && (
          <nav className="topbar-nav" aria-label="Admin">
            <NavLink to="/admin/buildings" className="topbar-link">
              Buildings
            </NavLink>
          </nav>
        )}
        {user === undefined ? null : user ? (
          <div className="topbar-actions">
            <span className="topbar-user">{user.name}</span>
            <Button variant="secondary" busy={busy} onClick={onLogout}>
              Log out
            </Button>
          </div>
        ) : (
          <div className="topbar-actions">
            <Link to="/login" className="btn btn-ghost">
              Log in
            </Link>
            <Link to="/register" className="btn btn-primary">
              Sign up
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
