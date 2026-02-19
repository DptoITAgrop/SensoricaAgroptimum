"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Leaf, Calendar, Target, TrendingUp } from "lucide-react";
import type { AgronomyData } from "@/lib/types";

interface PhenologyPanelProps {
  data: AgronomyData;
  variety: string;
}

const phenologyStages = [
  { id: "dormancy", name: "Reposo invernal", icon: "1" },
  { id: "pre-bud", name: "Pre-brotación", icon: "2" },
  { id: "bud-break", name: "Inicio brotación", icon: "3" },
  { id: "flowering", name: "Floración", icon: "4" },
  { id: "fruit-set", name: "Cuajado", icon: "5" },
  { id: "growth", name: "Crecimiento", icon: "6" },
  { id: "maturation", name: "Maduración", icon: "7" },
  { id: "harvest", name: "Cosecha", icon: "8" },
] as const;

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function safeNumber(n: any, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function parseToDate(d: any): Date | null {
  if (!d) return null;
  if (d instanceof Date && !Number.isNaN(d.getTime())) return d;
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function getCurrentStageIndex(stageName: string): number {
  const stageMap: Record<string, number> = {
    "Reposo invernal": 0,
    "Pre-brotación": 1,
    "Inicio brotación": 2,
    "Floración": 3,
    "Cuajado": 4,
    "Crecimiento": 5,
    "Maduración": 6,
    "Cosecha": 7,
  };
  return stageMap[stageName] ?? 0;
}

function stageHelpText(stageName: string) {
  if (stageName === "Reposo invernal")
    return "El árbol está en dormancia. Acumulando horas frío necesarias.";
  if (stageName === "Pre-brotación")
    return "Las yemas comienzan a hincharse. Monitorizar temperaturas bajas.";
  if (stageName === "Inicio brotación")
    return "Las yemas están abriendo. Fase crítica para heladas tardías.";
  if (stageName === "Floración")
    return "Floración activa. Ajustar manejo para asegurar cuajado.";
  if (stageName === "Cuajado")
    return "Cuajado del fruto. Vigilar estrés hídrico y nutrición.";
  if (stageName === "Crecimiento")
    return "Crecimiento del fruto. Controlar riego y carga productiva.";
  if (stageName === "Maduración")
    return "Maduración. Ajustar riego/calidad y seguimiento de parámetros.";
  if (stageName === "Cosecha")
    return "Cosecha. Planificar recolección y logística.";
  return "Monitoriza el cultivo y ajusta el manejo según condiciones y objetivos.";
}

/**
 * Progreso continuo:
 * - Si estamos en etapas tempranas (reposo/pre-brotación/brotación): usar HF (chillHours vs target)
 * - Desde floración en adelante: usar GDD (usa hitos 450/900 del email como referencia)
 */
function computeCampaignProgressPercent(data: AgronomyData): number {
  const stageIdx = getCurrentStageIndex(String(data.phenologyStage || ""));
  const chillHours = safeNumber((data as any).chillHours, 0);
  const chillTarget = safeNumber((data as any).chillHoursTarget, 0);

  const gdd = safeNumber((data as any).gdd, 0);

  // Umbrales sugeridos por el cliente (email): 450 y 900
  const gdd450 = safeNumber((data as any).gdd450Threshold, 450);
  const gdd900 = safeNumber((data as any).gdd900Threshold, 900);

  // Etapas 0-2: progreso por HF
  if (stageIdx <= 2) {
    if (chillTarget <= 0) return 0;
    return clamp((chillHours / chillTarget) * 100, 0, 100);
  }

  // Etapas 3+: progreso por GDD en escala 0..100 usando 900 como “fin ventana”
  // (Si quieres que 100% sea cosecha real, habría que definir umbral de cosecha)
  const denom = gdd900 > 0 ? gdd900 : 900;
  return clamp((gdd / denom) * 100, 0, 100);
}

export function PhenologyPanel({ data, variety }: PhenologyPanelProps) {
  const currentStageIndex = getCurrentStageIndex(String(data.phenologyStage || ""));
  const chillHours = safeNumber((data as any).chillHours, 0);
  const chillTarget = safeNumber((data as any).chillHoursTarget, 0);

  const chillProgress =
    chillTarget > 0 ? clamp((chillHours / chillTarget) * 100, 0, 100) : 0;

  const gdd = safeNumber((data as any).gdd, 0);
  const gddBase = safeNumber((data as any).gddBase, 7.2);

  // Si tu backend te da “hoy”, úsalo. Si no, no inventamos.
  const gddToday = (data as any).gddToday;
  const gddTodayNum = Number.isFinite(Number(gddToday)) ? Number(gddToday) : null;

  const overallProgress = computeCampaignProgressPercent(data);

  const lastUpdatedDate = parseToDate((data as any).lastUpdated);
  const lastUpdatedLabel = lastUpdatedDate
    ? lastUpdatedDate.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Leaf className="h-4 w-4 text-primary" />
            <CardTitle className="text-base font-semibold text-foreground">
              Estado Fenológico
            </CardTitle>
          </div>
          <Badge variant="secondary" className="text-xs">
            {variety}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        {/* Current Stage Display */}
        <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">
              Fase Actual
            </span>
            <Badge className="bg-primary text-primary-foreground">
              {String(data.phenologyStage || "—")}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {stageHelpText(String(data.phenologyStage || ""))}
          </p>

          {/* ✅ Progreso continuo real */}
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                Progreso continuo (HF/GDD)
              </span>
              <span className="text-[11px] text-muted-foreground">
                {Math.round(overallProgress)}%
              </span>
            </div>
            <Progress value={overallProgress} className="h-1.5 mt-2" />
          </div>
        </div>

        {/* Stage Timeline (stepper) */}
        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-2">Progreso de la campaña</p>
          <div className="flex items-center gap-1">
            {phenologyStages.map((stage, index) => (
              <div
                key={stage.id}
                className={`flex-1 h-2 rounded-full transition-colors ${
                  index < currentStageIndex
                    ? "bg-primary"
                    : index === currentStageIndex
                    ? "bg-primary animate-pulse"
                    : "bg-muted"
                }`}
              />
            ))}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">Reposo</span>
            <span className="text-[10px] text-muted-foreground">Cosecha</span>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-secondary">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-3 w-3 text-chart-2" />
              <span className="text-[10px] text-muted-foreground uppercase">
                Horas Frío
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold text-foreground">
                {Math.round(chillHours * 10) / 10}
              </span>
              <span className="text-xs text-muted-foreground">
                / {Math.round(chillTarget * 10) / 10}
              </span>
            </div>
            <Progress value={chillProgress} className="h-1.5 mt-2" />
          </div>

          <div className="p-3 rounded-lg bg-secondary">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-3 w-3 text-primary" />
              <span className="text-[10px] text-muted-foreground uppercase">
                GDD Acum.
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold text-foreground">
                {Math.round(gdd * 10) / 10}
              </span>
              <span className="text-xs text-muted-foreground">base {gddBase}°C</span>
            </div>

            {gddTodayNum !== null ? (
              <div className="flex items-center gap-1 mt-2">
                <TrendingUp className="h-3 w-3 text-primary" />
                <span className="text-xs text-primary">+{gddTodayNum} hoy</span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Last Update */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>Última actualización</span>
          </div>
          <span className="text-xs text-muted-foreground">{lastUpdatedLabel}</span>
        </div>
      </CardContent>
    </Card>
  );
}
