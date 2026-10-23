import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";
import { authorize, type Role } from "../domain";
export const cookieName = "bistro_session";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function assertOrigin(request: Request) {
  const origin = process.env.APP_ORIGIN;
  if (!origin) throw new ApiError(503, "APP_ORIGIN non configurato");
  if (request.headers.get("origin") !== origin)
    throw new ApiError(403, "Origine non autorizzata");
}
export async function currentUser() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: digest(token) },
    include: {
      user: {
        include: { memberships: { include: { venue: true } }, employee: true },
      },
    },
  });
  if (!session || session.expiresAt <= new Date() || !session.user.active)
    return null;
  return session.user;
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new ApiError(401, "Accedi per continuare");
  return user;
}
export async function requireVenue(venueId: string, financial = false) {
  const user = await requireUser();
  if (!user.memberships.some((m) => m.venueId === venueId))
    throw new ApiError(403, "Locale non autorizzato");
  if (financial && user.role === "EMPLOYEE")
    throw new ApiError(403, "Operazione non autorizzata");
  return user;
}
export function requireManager(user: { role: Role }) {
  if (!authorize(user.role, "editAttendance"))
    throw new ApiError(403, "Operazione riservata al responsabile");
}
export function requireAdmin(user: { role: Role }) {
  if (!authorize(user.role, "configure"))
    throw new ApiError(403, "Operazione riservata all’amministratore");
}
export async function newSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await db.session.create({
    data: {
      id: digest(token),
      userId,
      expiresAt: new Date(Date.now() + 12 * 3600 * 1000),
    },
  });
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    secure: process.env.APP_ORIGIN?.startsWith("https://") ?? true,
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 3600,
  });
}
