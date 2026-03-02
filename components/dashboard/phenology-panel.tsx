"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Leaf, Calendar, Target, TrendingUp, Flag } from "lucide-react";
import type { AgronomyData } from "@/lib/types";

interface PhenologyPanelProps {
  data: AgronomyData;
  variety: string;

  /**
   * ✅ NUEVO (opcional): necesarios para el estimador de fases (milestones)
   * Si no se pasan, el panel se comporta como antes.
   */
  farmId?: string;
  selectedSensor?: string; // nombre de tabla (ej: "Parcela 3 (kerman)") o "all"
}

const fetcher = (url: string) =>
  fetch(url, { cache: "no-store" }).then((r) => r.json());

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

type PhenologyApi = {
  farmId: string;
  sensor: string | null;
  bloomDate: string;
  baseTemp: number;
  cultivar: string;
  summary?: {
    totalGDD?: number;
    lastDate?: string;
    avgRecentDailyGDD?: number;
    horizonDays?: number;
  };
  phenology?: {
    currentPhase: { key: string; name: string; gddTarget: number } | null;
    nextPhase: { key: string; name: string; gddTarget: number } | null;
    progressToNextPct: number | null;
    milestones: Array<{
      key: string;
      name: string;
      gddTarget: number;
      reached: boolean;
      date: string | null;
      gddAtDate: number | null;
      remainingGDD: number;
      projectedDate: string | null;
    }>;
  };
  error?: string;
  details?: string;
};

const FIXED_GDD_BASE = 7.2; // ✅ requisito: base 7.2 en toda la app

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

function isValidISODate(d: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
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
 * Mapea fases “técnicos” (milestones por GDD) a tu timeline general.
 * Si la fase viene del endpoint (fruit_length_done / kernel_start / shell_hardening / harvest_est),
 * se ubica dentro de “Crecimiento/Maduración/Cosecha”.
 */
function stageFromMilestoneKey(key?: string | null): string | null {
  if (!key) return null;
  if (key === "fruit_length_done") return "Crecimiento";
  if (key === "kernel_start") return "Crecimiento";
  if (key === "shell_hardening") return "Maduración";
  if (key === "harvest_est") return "Cosecha";
  return null;
}

/**
 * Progreso continuo:
 * - Si aún estamos en etapas tempranas (reposo/pre-brotación/brotación): usar HF (chillHours vs target)
 * - Si hay endpoint de milestones: usar progreso estimado global a cosecha (GDD / GDD_harvest_target)
 * - Si no hay endpoint: fallback a tu regla anterior (GDD vs 900)
 */
function computeCampaignProgressPercent(
  data: AgronomyData,
  phenologyApi?: PhenologyApi
): number {
  const stageIdx = getCurrentStageIndex(
    String((data as any).phenologyStage || "")
  );
  const chillHours = safeNumber((data as any).chillHours, 0);
  const chillTarget = safeNumber((data as any).chillHoursTarget, 0);

  const gdd = safeNumber((data as any).gdd, 0);

  // Etapas 0-2: progreso por HF
  if (stageIdx <= 2) {
    if (chillTarget <= 0) return 0;
    return clamp((chillHours / chillTarget) * 100, 0, 100);
  }

  // Si tenemos milestones, definimos el 100% como “cosecha estimada” (última fase)
  const ms = phenologyApi?.phenology?.milestones ?? [];
  const harvestTarget =
    ms.length > 0 ? safeNumber(ms[ms.length - 1].gddTarget, 0) : 0;

  if (harvestTarget > 0) {
    return clamp((gdd / harvestTarget) * 100, 0, 100);
  }

  // Fallback: tu lógica antigua (900 como referencia)
  const gdd900 = safeNumber((data as any).gdd900Threshold, 900);
  const denom = gdd900 > 0 ? gdd900 : 900;
  return clamp((gdd / denom) * 100, 0, 100);
}

function getBloomDateFromData(data: AgronomyData): string | null {
  // Intentamos reutilizar lo que ya guardas en el frontend (selector “Inicio GDD”)
  const cand = String(
    (data as any).gddStartDate ||
      (data as any).gddStart ||
      (data as any).bloomDate ||
      ""
  );
  return cand && isValidISODate(cand) ? cand : null;
}

export function PhenologyPanel({
  data,
  variety,
  farmId,
  selectedSensor,
}: PhenologyPanelProps) {
  const currentStageIndex = getCurrentStageIndex(
    String((data as any).phenologyStage || "")
  );

  const chillHours = safeNumber((data as any).chillHours, 0);
  const chillTarget = safeNumber((data as any).chillHoursTarget, 0);

  const chillProgress =
    chillTarget > 0 ? clamp((chillHours / chillTarget) * 100, 0, 100) : 0;

  const gdd = safeNumber((data as any).gdd, 0);

  // ✅ FORZAMOS base 7.2 (evita que aparezca “base 10°C” aunque venga del backend)
  const gddBase = FIXED_GDD_BASE;

  // Si tu backend te da “hoy”, úsalo. Si no, no inventamos.
  const gddToday = (data as any).gddToday;
  const gddTodayNum = Number.isFinite(Number(gddToday)) ? Number(gddToday) : null;

  // ✅ bloomDate desde data (idealmente: el valor del selector de “Inicio GDD”)
  const rawBloomDate = useMemo(() => getBloomDateFromData(data), [data]);

  /**
   * ✅ Si bloomDate está en el futuro, NO llamamos al endpoint
   * y además mostramos GDD como “fuera de campaña” (0) para no confundir.
   */
  const bloomDate = useMemo(() => {
    if (!rawBloomDate) return null;
    const t = todayISO();
    if (rawBloomDate > t) return null; // futuro => no llamamos
    return rawBloomDate;
  }, [rawBloomDate]);

  const isGddSeasonActive = !!bloomDate;

  const bloomDateInfo = useMemo(() => {
    if (!rawBloomDate) {
      return "Configura el inicio GDD (plena floración) para activar estimaciones de hitos.";
    }
    const t = todayISO();
    if (rawBloomDate > t) {
      return `El inicio GDD está en el futuro (${rawBloomDate}). Las estimaciones de hitos se activarán cuando comience la campaña.`;
    }
    return null;
  }, [rawBloomDate]);

  const isSingleSensor =
    !!selectedSensor && selectedSensor !== "all" && selectedSensor !== "todos";

  // ✅ Llamada al endpoint de milestones SOLO si tenemos farmId + bloomDate válido (no futuro)
  const phenologyUrl = useMemo(() => {
    if (!farmId) return null;
    if (!bloomDate) return null;

    const p = new URLSearchParams();
    p.set("bloomDate", bloomDate);
    p.set("baseTemp", String(gddBase)); // ✅ siempre 7.2
    p.set("cultivar", String(variety || "kerman").toLowerCase());
    p.set("horizonDays", "14");
    if (isSingleSensor && selectedSensor) p.set("sensor", selectedSensor);

    return `/api/farms/${encodeURIComponent(
      farmId
    )}/phenology/milestones?${p.toString()}`;
  }, [farmId, bloomDate, gddBase, variety, isSingleSensor, selectedSensor]);

  const { data: phenologyApi } = useSWR<PhenologyApi>(phenologyUrl, fetcher, {
    refreshInterval: 60000,
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  // ✅ Si el endpoint trae fase actual, la usamos en el badge
  const phaseFromApi = phenologyApi?.phenology?.currentPhase?.name ?? null;
  const nextFromApi = phenologyApi?.phenology?.nextPhase ?? null;
  const progressToNextPct = phenologyApi?.phenology?.progressToNextPct ?? null;
  const milestones = phenologyApi?.phenology?.milestones ?? [];

  const apiStageOverride = stageFromMilestoneKey(
    phenologyApi?.phenology?.currentPhase?.key ?? null
  );

  const displayStage =
    apiStageOverride || phaseFromApi || String((data as any).phenologyStage || "—");

  const displayHelp = apiStageOverride
    ? "Estimación basada en GDD acumulados desde floración y hitos de desarrollo del fruto."
    : stageHelpText(String((data as any).phenologyStage || ""));

  const overallProgress = computeCampaignProgressPercent(data, phenologyApi);

  const lastUpdatedDate = parseToDate((data as any).lastUpdated);
  const lastUpdatedLabel = lastUpdatedDate
    ? lastUpdatedDate.toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  // Próxima fase: fecha real si ya se alcanzó, o proyectada si no
  const nextPhaseDateLabel = useMemo(() => {
    if (!nextFromApi) return null;
    const m = milestones.find((x) => x.key === nextFromApi.key);
    if (!m) return null;
    if (m.reached && m.date) return `✅ ${m.date}`;
    if (!m.reached && m.projectedDate) return `📅 ${m.projectedDate} (estimada)`;
    return null;
  }, [nextFromApi, milestones]);

  // Timeline: si estamos en etapas tempranas, usa la “stage” del backend; si hay milestone key, se ubica.
  const timelineStageIndex = useMemo(() => {
    if (apiStageOverride) return getCurrentStageIndex(apiStageOverride);
    return currentStageIndex;
  }, [apiStageOverride, currentStageIndex]);

  const shouldShowMilestonesBlock = !!phenologyApi?.phenology;

  // ✅ Si no ha empezado la campaña GDD, mostramos 0 para no liar
  const displayGdd = isGddSeasonActive ? gdd : 0;
  const displayGddTodayNum = isGddSeasonActive ? gddTodayNum : null;

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
              {displayStage}
            </Badge>
          </div>

          <p className="text-sm text-muted-foreground">{displayHelp}</p>

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

          {/* ✅ Mensaje cuando NO hay milestones aún */}
          {!shouldShowMilestonesBlock && (farmId || rawBloomDate) && (
            <div className="mt-3 rounded-md border border-border bg-background/40 p-2">
              <div className="flex items-start gap-2">
                <Flag className="h-3.5 w-3.5 mt-0.5 text-muted-foreground" />
                <div className="text-[11px] text-muted-foreground">
                  {bloomDateInfo ||
                    "Milestones no disponibles todavía. Cuando haya bloomDate válido y datos desde esa fecha, aparecerán aquí."}
                  {rawBloomDate ? (
                    <div className="mt-1 text-[10px] text-muted-foreground/70">
                      Inicio GDD detectado:{" "}
                      <span className="tabular-nums">{rawBloomDate}</span>
                    </div>
                  ) : null}
                </div>
              </div>

              {phenologyApi?.error ? (
                <p className="mt-2 text-[11px] text-red-400">
                  {phenologyApi.error}
                </p>
              ) : null}
            </div>
          )}

          {/* ✅ NUEVO: Próxima fase + progreso a la próxima */}
          {shouldShowMilestonesBlock && (
            <div className="mt-3 rounded-md border border-border bg-background/40 p-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-[180px]">
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Flag className="h-3 w-3" />
                    <span>Próxima fase</span>
                  </div>
                  <div className="text-xs text-foreground">
                    {nextFromApi ? nextFromApi.name : "—"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {nextPhaseDateLabel || ""}
                  </div>
                </div>

                <div className="min-w-[140px] text-right">
                  <div className="text-[11px] text-muted-foreground">
                    Progreso a la próxima
                  </div>
                  <div className="text-xs text-foreground">
                    {typeof progressToNextPct === "number"
                      ? `${progressToNextPct}%`
                      : "—"}
                  </div>
                </div>
              </div>

              {/* ✅ Mini tabla de hitos */}
              {milestones.length > 0 && (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[11px] text-muted-foreground">
                        <th className="py-1 text-left font-medium">Hito</th>
                        <th className="py-1 text-right font-medium">GDD</th>
                        <th className="py-1 text-right font-medium">Fecha</th>
                        <th className="py-1 text-right font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {milestones.map((m) => {
                        const date = m.reached ? m.date : m.projectedDate;
                        return (
                          <tr key={m.key} className="border-t border-border/60">
                            <td className="py-1 pr-2 text-left text-foreground">
                              {m.name}
                            </td>
                            <td className="py-1 text-right text-foreground tabular-nums">
                              {m.gddTarget}
                            </td>
                            <td className="py-1 text-right text-foreground tabular-nums">
                              {date ?? "—"}
                            </td>
                            <td className="py-1 text-right text-foreground">
                              {m.reached ? "✅" : "⏳"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="mt-1 text-[10px] text-muted-foreground/70">
                    * Fechas “estimadas” = proyección con media de GDD diarios
                    recientes.
                  </p>
                </div>
              )}

              {phenologyApi?.error && (
                <p className="mt-2 text-[11px] text-red-400">
                  {phenologyApi.error}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Stage Timeline (stepper) */}
        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-2">
            Progreso de la campaña
          </p>
          <div className="flex items-center gap-1">
            {phenologyStages.map((stage, index) => (
              <div
                key={stage.id}
                className={`flex-1 h-2 rounded-full transition-colors ${
                  index < timelineStageIndex
                    ? "bg-primary"
                    : index === timelineStageIndex
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
                {Math.round(displayGdd * 10) / 10}
              </span>
              <span className="text-xs text-muted-foreground">
                base {gddBase}°C
              </span>
            </div>

            {displayGddTodayNum !== null ? (
              <div className="flex items-center gap-1 mt-2">
                <TrendingUp className="h-3 w-3 text-primary" />
                <span className="text-xs text-primary">
                  +{displayGddTodayNum} hoy
                </span>
              </div>
            ) : null}

            {!isGddSeasonActive ? (
              <div className="mt-2 text-[11px] text-muted-foreground">
                Fuera de campaña GDD (hasta inicio de floración).
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