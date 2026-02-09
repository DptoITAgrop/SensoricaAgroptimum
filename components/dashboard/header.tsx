"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Menu,
  Bell,
  Settings,
  User,
  RefreshCw,
  Calendar,
  LogOut,
  Shield,
  Wrench,
  Building2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Farm {
  id: string;
  name: string;
}

interface UserSession {
  id: string;
  name: string;
  email: string;
  role: string;
  allowedFarms: string[] | "all";
}

interface HeaderProps {
  farms: Farm[];
  selectedFarmId: string;
  onFarmChange: (farmId: string) => void;
  alertCount?: number;
  onRefresh?: () => void;
  user?: UserSession;
  onLogout?: () => void;
}

export function Header({
  farms,
  selectedFarmId,
  onFarmChange,
  alertCount = 0,
  onRefresh,
  user,
  onLogout,
}: HeaderProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    onRefresh?.();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center justify-between px-4 lg:px-6">
        {/* Left side - Logo and finca selector */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="lg:hidden">
            <Menu className="h-5 w-5" />
          </Button>

          {/* BRAND */}
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-lg border border-border bg-secondary">
              <Image
                src="/AG%20Cuadrado%20Blanco.png"
                alt="AG - Logo"
                width={28}
                height={28}
                className="h-7 w-7 object-contain"
                priority
              />
            </div>

            <div className="hidden sm:block">
              <h1 className="text-base font-bold tracking-tight text-foreground">
                Agroptimum
              </h1>
              <p className="text-[9px] text-muted-foreground -mt-0.5 tracking-widest uppercase">
                Shaping Pistachio Industry
              </p>
            </div>
          </div>

          <div className="h-6 w-px bg-border mx-2 hidden sm:block" />

          <Select value={selectedFarmId} onValueChange={onFarmChange}>
            <SelectTrigger className="w-[180px] md:w-[220px] bg-secondary border-border">
              <SelectValue placeholder="Seleccionar finca" />
            </SelectTrigger>
            <SelectContent>
              {farms.map((farm) => (
                <SelectItem key={farm.id} value={farm.id}>
                  <span>{farm.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Center - Date info */}
        <div className="hidden md:flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            {new Date().toLocaleDateString("es-ES", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
        </div>

        {/* Right side - Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            className="text-muted-foreground hover:text-foreground"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="relative text-muted-foreground hover:text-foreground"
          >
            <Bell className="h-4 w-4" />
            {alertCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]"
              >
                {alertCount}
              </Badge>
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
          >
            <Settings className="h-4 w-4" />
          </Button>

          <div className="h-6 w-px bg-border mx-1" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center">
                  {user?.role === "admin" ? (
                    <Shield className="h-4 w-4 text-primary" />
                  ) : user?.role === "tecnico" ? (
                    <Wrench className="h-4 w-4 text-primary" />
                  ) : (
                    <Building2 className="h-4 w-4 text-primary" />
                  )}
                </div>
                <span className="hidden lg:block text-sm text-foreground">
                  {user?.name || "Usuario"}
                </span>
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="font-medium">{user?.name}</span>
                  <span className="text-xs text-muted-foreground font-normal">
                    {user?.email}
                  </span>
                </div>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              <DropdownMenuItem disabled>
                <User className="mr-2 h-4 w-4" />
                <span>
                  Rol:{" "}
                  {user?.role === "admin"
                    ? "Administrador"
                    : user?.role === "tecnico"
                    ? "Técnico"
                    : "Usuario Finca"}
                </span>
              </DropdownMenuItem>

              <DropdownMenuItem disabled>
                <Building2 className="mr-2 h-4 w-4" />
                <span>
                  {user?.allowedFarms === "all"
                    ? "Acceso a todas las fincas"
                    : `${(user?.allowedFarms as string[])?.length || 0} finca(s)`}
                </span>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                <span>Configuración</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={onLogout}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>Cerrar sesión</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
