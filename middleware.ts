import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decrypt } from "@/lib/session";

// Rutas públicas que no requieren autenticación
const publicRoutes = ["/login", "/api/auth/login"];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Permitir acceso a rutas públicas
  if (publicRoutes.some((route) => path.startsWith(route))) {
    return NextResponse.next();
  }

  // Verificar sesión
  const session = request.cookies.get("session")?.value;
  const payload = await decrypt(session);

  // Si no hay sesión válida, redirigir al login
  if (!payload) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Si hay sesión válida y está en login, redirigir al dashboard
  if (path === "/login" && payload) {
    const dashboardUrl = new URL("/", request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     * - API routes except auth
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
