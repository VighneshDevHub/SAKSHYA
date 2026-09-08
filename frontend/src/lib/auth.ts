const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const TOKEN_KEY = "forensicguard_token";
const EMAIL_KEY = "forensicguard_email";
const ROLE_KEY  = "forensicguard_role";
const USER_ID_KEY = "forensicguard_user_id";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredEmail(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(EMAIL_KEY);
}

export function getStoredRole(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ROLE_KEY);
}

export function getStoredUserId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(USER_ID_KEY);
}

function setSession(token: string, email: string, role?: string, userId?: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EMAIL_KEY, email);
  if (role)   localStorage.setItem(ROLE_KEY, role);
  if (userId) localStorage.setItem(USER_ID_KEY, userId);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EMAIL_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(USER_ID_KEY);
}

export class AuthError extends Error {}

export async function login(email: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new AuthError("Incorrect email or password");
  }
  const data = await res.json();
  // data.role and data.user_id are returned by the backend TokenResponse schema
  setSession(data.access_token, email, data.role ?? undefined, data.user_id ?? undefined);
}

export async function register(email: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.status === 409) {
    throw new AuthError("An account with this email already exists — try signing in instead.");
  }
  if (!res.ok) {
    throw new AuthError("Registration failed");
  }
}

export function logout(): void {
  clearSession();
}
