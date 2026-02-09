"use client";

import React, { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Eye, EyeOff, Lock, User } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const canSubmit = useMemo(() => {
    return !isLoading && username.trim().length > 0 && password.length > 0;
  }, [isLoading, username, password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data?.error || "Error al iniciar sesión");
        setIsLoading(false);
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Error de conexión. Intente nuevamente.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden">
      {/* Background image */}
      <Image
        src="/Campo de pistachos.png"
        alt="Campo de pistachos"
        fill
        priority
        className="object-cover"
      />

      {/* Premium overlays */}
      <div className="absolute inset-0 bg-black/35" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/35 to-black/70" />
      <div className="absolute inset-0 [background:radial-gradient(80%_60%_at_50%_30%,rgba(255,255,255,0.10),rgba(0,0,0,0)_60%)]" />

      {/* Content */}
      <div className="relative z-10 w-full max-w-md">
        <Card className="border-white/10 bg-black/35 backdrop-blur-xl shadow-2xl">
          <CardHeader className="text-center space-y-4 pb-2">
            {/* Logo */}
            <div className="flex justify-center">
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
                <Image
                  src="/AG Cuadrado Blanco.png"
                  alt="Agroptimum"
                  width={76}
                  height={76}
                  className="h-16 w-16 object-contain"
                />
              </div>
            </div>

            <div className="space-y-1">
              <CardTitle className="text-2xl font-semibold tracking-tight text-white">
                Agróptimum
              </CardTitle>
              <CardDescription className="text-xs tracking-[0.35em] uppercase text-white/70">
                Shaping Pistachio Industry
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert
                  variant="destructive"
                  className="bg-destructive/15 border-destructive/30"
                >
                  <AlertDescription className="text-destructive">
                    {error}
                  </AlertDescription>
                </Alert>
              )}

              {/* Username */}
              <div className="space-y-2">
                <Label htmlFor="username" className="text-sm font-medium text-white/90">
                  Usuario
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
                  <Input
                    id="username"
                    type="text"
                    placeholder="Introduce tu finca o email"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={isLoading}
                    className="h-11 pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/40 focus-visible:ring-2 focus-visible:ring-white/20"
                    autoComplete="username"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-white/90">
                  Contraseña
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className="h-11 pl-10 pr-10 bg-white/5 border-white/10 text-white placeholder:text-white/40 focus-visible:ring-2 focus-visible:ring-white/20"
                    autoComplete="current-password"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/55 hover:text-white transition-colors"
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full h-11 mt-6 font-medium bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20"
                disabled={!canSubmit}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Iniciando sesión...
                  </>
                ) : (
                  "Iniciar Sesión"
                )}
              </Button>
            </form>

            <div className="mt-8 pt-6 border-t border-white/10">
              <p className="text-xs text-white/60 text-center">
                Sistema de monitoreo agroclimático
              </p>
              <p className="text-xs text-white/60 text-center mt-1">
                Contacte a soporte@agroptimum.com si tiene problemas de acceso
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Small footer / legal */}
        <p className="mt-4 text-center text-[11px] text-white/45">
          © {new Date().getFullYear()} Agroptimum · Acceso privado
        </p>
      </div>
    </div>
  );
}
