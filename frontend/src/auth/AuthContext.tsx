import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, apiFetch } from "../api";

export type Role = "tenant" | "admin" | "staff";

export type User = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  needs_onboarding: boolean;
};

export type RegisterInput = { name: string; phone: string; email: string; password: string };

type AuthState = {
  /** undefined while we're still checking whether someone is logged in. */
  user: User | null | undefined;
  googleEnabled: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => Promise<void>;
  updateMe: (changes: { name?: string; phone?: string }) => Promise<User>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    apiFetch<User>("/api/auth/me")
      .then(setUser)
      .catch((e) => {
        if (!(e instanceof ApiError) || e.status !== 401) console.warn("Couldn't check login:", e);
        setUser(null);
      });
    apiFetch<{ google: boolean }>("/api/auth/config")
      .then((c) => setGoogleEnabled(c.google))
      .catch(() => setGoogleEnabled(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const u = await apiFetch<User>("/api/auth/login", { method: "POST", body: { email, password } });
    setUser(u);
    return u;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const u = await apiFetch<User>("/api/auth/register", { method: "POST", body: input });
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    await apiFetch<void>("/api/auth/logout", { method: "POST" });
    setUser(null);
  }, []);

  const updateMe = useCallback(async (changes: { name?: string; phone?: string }) => {
    const u = await apiFetch<User>("/api/auth/me", { method: "PATCH", body: changes });
    setUser(u);
    return u;
  }, []);

  const value = useMemo(
    () => ({ user, googleEnabled, login, register, logout, updateMe }),
    [user, googleEnabled, login, register, logout, updateMe],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>.");
  return ctx;
}
