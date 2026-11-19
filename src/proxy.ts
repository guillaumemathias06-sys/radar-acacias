import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Next.js 16 : `proxy.ts` remplace `middleware.ts`. Rafraîchit la session
// Supabase et renvoie vers /login toute visite non connectée.
//
// Exceptions (leçon Jarvis, vécue 3 fois) : les appels machine n'ont pas
// de session Supabase et ont leur propre authentification par secret,
// vérifiée dans la route elle-même. Sans ces exceptions, ils recevraient
// une redirection vers /login et n'atteindraient jamais leur code.
const MACHINE_PREFIXES = ["/api/cron/", "/api/ingest/", "/api/webhooks/"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (MACHINE_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLogin = pathname.startsWith("/login");
  if (!user && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (user && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
