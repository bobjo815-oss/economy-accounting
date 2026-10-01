import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { authDestination } from "@/lib/auth/recovery-redirect";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const destination = authDestination(requestUrl.searchParams.get("next"));
  const errorKind = destination === "/set-password" ? "recovery" : "oauth";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const response = NextResponse.redirect(new URL(`/login?error=${errorKind}`, requestUrl.origin));

  if (!code || !url || !publishableKey) return response;

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (entries) => entries.forEach(({ name, value, options }) =>
        response.cookies.set(name, value, options),
      ),
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) response.headers.set("Location", new URL(destination, requestUrl.origin).toString());

  return response;
}
