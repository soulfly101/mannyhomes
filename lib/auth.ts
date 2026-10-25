import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { SESSION_COOKIE, cookieOptions, signSession, verifySession, type Session } from "./session";

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

export async function startSession(session: Session) {
  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession(session), cookieOptions);
}

export async function endSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Use at the top of any page or action that needs a logged-in user. */
export async function requireUser(...roles: Role[]): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (roles.length && !roles.includes(session.role)) redirect("/");
  return session;
}
