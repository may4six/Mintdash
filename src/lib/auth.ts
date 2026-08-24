import { auth } from "@clerk/nextjs/server";

/**
 * Resolve the current Clerk user for a Route Handler. Middleware already
 * blocks unauthenticated requests to /api/*, but route handlers check again
 * so they never silently run with an undefined userId if that ever changes.
 */
export async function requireUserId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) {
    throw new AuthError();
  }
  return userId;
}

export class AuthError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "AuthError";
  }
}
