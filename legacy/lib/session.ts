import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@prisma/client";

// Edge-safe session helpers (used by middleware and server code).
export const SESSION_COOKIE = "altheo_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export type Session = { userId: string; role: Role; name: string };

const key = () => new TextEncoder().encode(process.env.AUTH_SECRET);

export async function signSession(session: Session) {
  return new SignJWT({ role: session.role, name: session.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return { userId: payload.sub!, role: payload.role as Role, name: payload.name as string };
  } catch {
    return null;
  }
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE,
};

export const homeFor = (role: Role) =>
  role === "MANAGER" ? "/manager" : role === "STAFF" ? "/staff" : "/tenant";
