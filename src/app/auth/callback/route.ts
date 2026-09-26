import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const response = NextResponse.redirect(new URL("/login?error=oauth", requestUrl.origin));

  if (!code || !url || !publishableKey) return response;

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.headers.get("cookie")
        ?.split("; ")
        .filter(Boolean)
        .map((entry) => {
          const separator = entry.indexOf("=");
          return { name: entry.slice(0, separator), value: entry.slice(separator + 1) };
        }) ?? [],
      setAll: (entries) => entries.forEach(({ name, value, options }) =>
        response.cookies.set(name, value, options),
      ),
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) response.headers.set("Location", new URL("/workspace", requestUrl.origin).toString());

  return response;
}
