const SET_PASSWORD_PATH = "/set-password";

export function oauthCallbackUrl(origin: string) {
  return new URL("/auth/callback", origin).toString();
}

export function recoveryRequestRedirect(origin: string) {
  return new URL("/", origin).toString();
}

export function recoveryCallbackPath(code: string) {
  const params = new URLSearchParams({ code, next: SET_PASSWORD_PATH });
  return `/auth/callback?${params.toString()}`;
}

export function authDestination(next: string | null) {
  return next === SET_PASSWORD_PATH ? SET_PASSWORD_PATH : "/workspace";
}
