"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Thermometer,
  Droplets,
  Leaf,
  Zap,
  TrendingUp,
  TrendingDown,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import useSWR from "swr";

type RangePreset = "7d" | "30d" | "6m" | "1y";

interface KPICardsLiveProps {
  farmId: string;
  selectedSensor?: string; // nombre real de la tabla (puede tener espacios)

  /**
   * Opcional: si lo pasas desde el Dashboard, los KPIs HF/GDD
   * pueden recalcularse por rango (si el backend lo soporta).
   * Si NO lo pasas, se usa el rango de campaña por defecto del backend.
   */
  rangePreset?: RangePreset;
}

interface ChillHoursResponse {
  farmId: string;
  period: { start: string; end: string };
  sensors: Array<{
    sensor: string;
    chillHours: number;
    period: { start: string; end: string };
    dataPoints: number;
  }>;
  summary: {
    totalChillHours: number;
    avgChillHours: number;
    sensorCount: number;
  };
}

interface GDDResponse {
  farmId: string;
  period: { start: string; end: string };
  baseTemp: number;
  sensors: Array<{
    sensor: string;
    gdd: number;
    period: { start: string; end: string };
    daysWithData: number;
  }>;
  summary: {
    totalGDD: number;
    avgGDD: number;
    sensorCount: number;
  };
}

interface SensorDataResponse {
  farmId: string;
  sensorId: string;
  columns: string[];
  data: Array<Record<string, any>>;
  dateColumn: string | null;
  selectedMetrics?: string[];
  order?: string;
  limit?: number;
}

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || res.statusText);
  }
  return res.json();
};

function toNumberOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseYYYYMMDDToDate(yyyyMmDd: string): Date | null {
  if (!yyyyMmDd) return null;
  const d = new Date(`${yyyyMmDd}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatShortRange(start: string, end: string) {
  const s = parseYYYYMMDDToDate(start);
  const e = parseYYYYMMDDToDate(end);

  if (!s || !e) return `${start} - ${end}`;

  const fmt = (d: Date) =>
    d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });

  return `${fmt(s)} - ${fmt(e)}`;
}

/**
 * Convierte un preset a startDate/endDate (YYYY-MM-DD) usando hora local.
 * NOTA: esto solo sirve si tu backend acepta startDate/endDate.
 */
function presetToDates(preset: RangePreset): { startDate: string; endDate: string } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // hoy (00:00 local)

  const start = new Date(end);
  if (preset === "7d") start.setDate(start.getDate() - 7);
  else if (preset === "30d") start.setDate(start.getDate() - 30);
  else if (preset === "6m") start.setMonth(start.getMonth() - 6);
  else start.setFullYear(start.getFullYear() - 1);

  const toYMD = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  return { startDate: toYMD(start), endDate: toYMD(end) };
}

export function KPICardsLive({ farmId, selectedSensor, rangePreset }: KPICardsLiveProps) {
  const isSingleSensor = !!selectedSensor && selectedSensor !== "all";

  const params = useMemo(() => {
    const p = new URLSearchParams();

    if (isSingleSensor) {
      p.set("sensor", selectedSensor!);
    }

    // Si quieres que el selector temporal afecte a KPIs, activamos startDate/endDate.
    // Esto NO rompe nada aunque el backend no lo use: simplemente lo ignorará.
    if (rangePreset) {
      const { startDate, endDate } = presetToDates(rangePreset);
      p.set("startDate", startDate);
      p.set("endDate", endDate);
    }

    return p;
  }, [isSingleSensor, selectedSensor, rangePreset]);

  const chillUrl = useMemo(() => {
    const base = `/api/farms/${encodeURIComponent(farmId)}/chill-hours`;
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }, [farmId, params]);

  const gddUrl = useMemo(() => {
    const base = `/api/farms/${encodeURIComponent(farmId)}/gdd`;
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }, [farmId, params]);

  const {
    data: chillData,
    error: chillError,
    isLoading: chillLoading,
  } = useSWR<ChillHoursResponse>(chillUrl, fetcher, { refreshInterval: 60000 });

  const {
    data: gddData,
    error: gddError,
    isLoading: gddLoading,
  } = useSWR<GDDResponse>(gddUrl, fetcher, { refreshInterval: 60000 });

  // ✅ Última lectura del sensor seleccionado (para KPIs "en vivo")
  const latestUrl = useMemo(() => {
    if (!isSingleSensor) return null;
    const base = `/api/farms/${encodeURIComponent(farmId)}/sensors/${encodeURIComponent(
      selectedSensor!
    )}/data`;

    const p = new URLSearchParams();
    p.set("order", "desc");
    p.set("limit", "1");
    p.set("metrics", "temperature,humidity,conductivity");

    return `${base}?${p.toString()}`;
  }, [farmId, selectedSensor, isSingleSensor]);

  const {
    data: latestData,
    error: latestError,
    isLoading: latestLoading,
  } = useSWR<SensorDataResponse>(latestUrl, fetcher, { refreshInterval: 60000 });

  const latestRow = latestData?.data?.[0];

  const latestTemperature = latestRow ? toNumberOrNull(latestRow.temperature) : null;
  const latestHumidity = latestRow ? toNumberOrNull(latestRow.humidity) : null;
  const latestConductivity = latestRow ? toNumberOrNull(latestRow.conductivity) : null;

  const chillHoursTarget = 1000;

  // Si hay un solo sensor: normalmente quieres ese valor. Si no: media.
  // (Tu API devuelve avg..., lo mantenemos.)
  const chillHours = chillData?.summary?.avgChillHours ?? 0;
  const chillProgress = (chillHours / chillHoursTarget) * 100;

  const gdd = gddData?.summary?.avgGDD ?? 0;

  const chillRangeLabel = chillData?.period
    ? formatShortRange(chillData.period.start, chillData.period.end)
    : "Campaña";

  const gddRangeLabel = gddData?.period
    ? formatShortRange(gddData.period.start, gddData.period.end)
    : "Campaña";

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Horas Frío */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Horas Frío
                </p>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {chillRangeLabel}
                </Badge>
              </div>

              {chillLoading ? (
                <div className="flex items-center gap-2 mt-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Cargando...</span>
                </div>
              ) : chillError ? (
                <div className="flex items-center gap-2 mt-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span className="text-sm text-destructive">Error</span>
                </div>
              ) : (
                <>
                  <p className="text-3xl font-bold text-foreground mt-1">{chillHours}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    de {chillHoursTarget} objetivo
                  </p>
                </>
              )}
            </div>

            <div className="p-2 rounded-lg bg-chart-2/20">
              <Thermometer className="h-5 w-5 text-chart-2" />
            </div>
          </div>

          {!chillLoading && !chillError && (
            <div className="mt-3">
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-chart-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(chillProgress, 100)}%` }}
                />
              </div>
              <p className="text-xs text-chart-2 mt-1 font-medium">
                {chillProgress.toFixed(1)}% completado
              </p>
            </div>
          )}

          {chillData?.sensors && chillData.sensors.length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-2">
              {chillData.sensors.length} sensor(es) analizados
            </p>
          )}
        </CardContent>
      </Card>

      {/* GDD */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  GDD Acumulados
                </p>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {gddRangeLabel}
                </Badge>
              </div>

              {gddLoading ? (
                <div className="flex items-center gap-2 mt-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Cargando...</span>
                </div>
              ) : gddError ? (
                <div className="flex items-center gap-2 mt-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span className="text-sm text-destructive">Error</span>
                </div>
              ) : (
                <>
                  <p className="text-3xl font-bold text-foreground mt-1">{gdd}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Base: {gddData?.baseTemp || 10}°C
                  </p>
                </>
              )}
            </div>

            <div className="p-2 rounded-lg bg-primary/20">
              <Leaf className="h-5 w-5 text-primary" />
            </div>
          </div>

          {!gddLoading && !gddError && (
            <div className="mt-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-xs text-primary font-medium">Período vegetativo</span>
            </div>
          )}

          {gddData?.sensors && gddData.sensors.length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-2">
              {gddData.sensors.length} sensor(es) analizados
            </p>
          )}
        </CardContent>
      </Card>

      {/* Temperatura Actual - REAL */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Temperatura
              </p>

              {!isSingleSensor ? (
                <>
                  <p className="text-3xl font-bold text-foreground mt-1">--°C</p>
                  <p className="text-xs text-muted-foreground mt-1">Selecciona un sensor</p>
                </>
              ) : latestLoading ? (
                <div className="flex items-center gap-2 mt-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Cargando...</span>
                </div>
              ) : latestError ? (
                <div className="flex items-center gap-2 mt-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span className="text-sm text-destructive">Error</span>
                </div>
              ) : (
                <>
                  <p className="text-3xl font-bold text-foreground mt-1">
                    {latestTemperature === null ? "--°C" : `${latestTemperature.toFixed(1)}°C`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{selectedSensor}</p>
                </>
              )}
            </div>

            <div className="p-2 rounded-lg bg-accent/20">
              <Zap className="h-5 w-5 text-accent" />
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            {isSingleSensor && latestRow ? (
              <>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">
                  Última lectura OK
                </span>
              </>
            ) : (
              <>
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">
                  Sin datos en tiempo real
                </span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Humedad Suelo - REAL */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Humedad Suelo
              </p>

              {!isSingleSensor ? (
                <>
                  <p className="text-3xl font-bold text-foreground mt-1">--%</p>
                  <p className="text-xs text-muted-foreground mt-1">Selecciona un sensor</p>
                </>
              ) : latestLoading ? (
                <div className="flex items-center gap-2 mt-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Cargando...</span>
                </div>
              ) : latestError ? (
                <div className="flex items-center gap-2 mt-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span className="text-sm text-destructive">Error</span>
                </div>
              ) : (
                <>
                  <p className="text-3xl font-bold text-foreground mt-1">
                    {latestHumidity === null ? "--%" : `${latestHumidity.toFixed(2)}%`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {latestConductivity === null
                      ? "Conductividad: —"
                      : `Conductividad: ${latestConductivity}`}
                  </p>
                </>
              )}
            </div>

            <div className="p-2 rounded-lg bg-chart-5/20">
              <Droplets className="h-5 w-5 text-chart-5" />
            </div>
          </div>

          <div className="mt-3">
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-chart-5/60 rounded-full transition-all duration-500"
                style={{
                  width:
                    latestHumidity === null
                      ? "0%"
                      : `${Math.max(0, Math.min(100, latestHumidity))}%`,
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
