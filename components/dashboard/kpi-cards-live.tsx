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
   * IMPORTANTE:
   * - Este preset es útil para GRÁFICAS.
   * - Para KPIs HF/GDD NO lo usamos: KPIs = campaña completa (backend).
   */
  rangePreset?: RangePreset;
}

type ChillSensorRow = {
  sensor: string;
  chillHours: number;
  period?: { start: string; end: string };
  dataPoints?: number;

  // si tu endpoint lo devuelve (suelo, missing cols, etc)
  skippedReason?: string;

  // ✅ para decidir HF "aplica o no aplica"
  isSoilSensor?: boolean;
  includedByException?: boolean;
};

interface ChillHoursResponse {
  farmId: string;
  period: { start: string; end: string };
  sensors: ChillSensorRow[];
  summary: {
    totalChillHours: number;
    avgChillHours: number;
    sensorCount: number; // sensores válidos (sin skipped)
  };
  series?: any;
  seriesAvg?: any;
}

type GDDSensorRow = {
  sensor: string;
  gdd: number;
  period?: { start: string; end: string };
  daysWithData?: number;
  skippedReason?: string;
};

interface GDDResponse {
  farmId: string;
  period: { start: string; end: string };
  baseTemp: number;
  sensors: GDDSensorRow[];
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

function clampPercent(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

export function KPICardsLive({ farmId, selectedSensor }: KPICardsLiveProps) {
  const isSingleSensor = !!selectedSensor && selectedSensor !== "all";

  // ✅ KPIs HF/GDD: SOLO sensor param (NO startDate/endDate; campaña completa backend)
  const kpiParams = useMemo(() => {
    const p = new URLSearchParams();
    if (isSingleSensor) p.set("sensor", selectedSensor!);
    return p;
  }, [isSingleSensor, selectedSensor]);

  const chillUrl = useMemo(() => {
    const base = `/api/farms/${encodeURIComponent(farmId)}/chill-hours`;
    const qs = kpiParams.toString();
    return qs ? `${base}?${qs}` : base;
  }, [farmId, kpiParams]);

  const gddUrl = useMemo(() => {
    const base = `/api/farms/${encodeURIComponent(farmId)}/gdd`;
    const qs = kpiParams.toString();
    return qs ? `${base}?${qs}` : base;
  }, [farmId, kpiParams]);

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

    const base = `/api/farms/${encodeURIComponent(
      farmId
    )}/sensors/${encodeURIComponent(selectedSensor!)}/data`;

    const p = new URLSearchParams();
    p.set("order", "desc");
    p.set("limit", "1");
    // pedimos más métricas por si es suelo
    p.set("metrics", "temperature,humidity,soilMoisture,conductivity");

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

  // Preferimos soilMoisture si existe, si no caemos a humidity (compat)
  const latestSoilMoisture =
    latestRow && latestRow.soilMoisture !== undefined
      ? toNumberOrNull(latestRow.soilMoisture)
      : latestHumidity;

  const latestConductivity = latestRow ? toNumberOrNull(latestRow.conductivity) : null;

  // ---- HF (Horas Frío) ----
  const chillHoursTarget = 1000;

  const chillSensorRow = useMemo(() => {
    if (!isSingleSensor) return null;
    const list = chillData?.sensors || [];
    return list.find((s) => s.sensor === selectedSensor) || null;
  }, [isSingleSensor, chillData, selectedSensor]);

  const selectedIsSoilForHF = useMemo(() => {
    if (!isSingleSensor) return false;

    const isSoil = !!chillSensorRow?.isSoilSensor;
    const allowed = !!chillSensorRow?.includedByException;

    return isSoil && !allowed;
  }, [isSingleSensor, chillSensorRow]);

  const chillHoursValue = useMemo(() => {
    if (isSingleSensor) {
      if (!chillSensorRow) return null;

      if (chillSensorRow.skippedReason) return null;
      if (selectedIsSoilForHF) return null;

      return toNumberOrNull(chillSensorRow.chillHours);
    }

    // En modo ALL, el KPI principal muestra TOTAL FINCA.
    return toNumberOrNull(chillData?.summary?.totalChillHours);
  }, [isSingleSensor, chillSensorRow, selectedIsSoilForHF, chillData]);

  const chillProgress =
    chillHoursValue !== null && chillHoursTarget > 0
      ? clampPercent((chillHoursValue / chillHoursTarget) * 100)
      : null;

  const chillRangeLabel = chillData?.period
    ? formatShortRange(chillData.period.start, chillData.period.end)
    : "Campaña";

  // ---- GDD ----
  const gddSensorRow = useMemo(() => {
    if (!isSingleSensor) return null;
    const list = gddData?.sensors || [];
    return list.find((s) => s.sensor === selectedSensor) || null;
  }, [isSingleSensor, gddData, selectedSensor]);

  const gddValue = useMemo(() => {
    if (isSingleSensor) {
      if (!gddSensorRow) return null;
      if (gddSensorRow.skippedReason) return null;
      return toNumberOrNull(gddSensorRow.gdd);
    }
    return toNumberOrNull(gddData?.summary?.totalGDD);
  }, [isSingleSensor, gddSensorRow, gddData]);

  const gddRangeLabel = gddData?.period
    ? formatShortRange(gddData.period.start, gddData.period.end)
    : "Campaña";

  const frostRisk = latestTemperature !== null && latestTemperature < 5;

  const chillSensorsCount =
    chillData?.summary?.sensorCount ?? (chillData?.sensors?.length ?? 0);

  const gddSensorsCount = gddData?.summary?.sensorCount ?? (gddData?.sensors?.length ?? 0);

  // ✅ Ranking HF por sensor (solo en modo ALL)
  const chillPerSensorTotals = useMemo(() => {
    if (isSingleSensor) return [];

    const list = chillData?.sensors ?? [];
    const valid = list.filter((s) => {
      if (s.skippedReason) return false;
      // si es suelo y no está permitido, no aplica
      if (s.isSoilSensor && !s.includedByException) return false;
      return Number.isFinite(Number(s.chillHours));
    });

    return valid
      .map((s) => ({
        sensor: s.sensor,
        chillHours: Number(s.chillHours),
        includedByException: !!s.includedByException,
      }))
      .sort((a, b) => b.chillHours - a.chillHours);
  }, [isSingleSensor, chillData]);

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

                {selectedIsSoilForHF && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    No aplica (suelo)
                  </Badge>
                )}

                {isSingleSensor && chillSensorRow?.includedByException && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    Excepción
                  </Badge>
                )}

                {!isSingleSensor && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    Total finca
                  </Badge>
                )}
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
              ) : selectedIsSoilForHF ? (
                <>
                  <p className="text-3xl font-bold text-foreground mt-1">—</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Este sensor es de suelo (EC) y no computa HF
                  </p>
                </>
              ) : (
                <>
                  <p className="text-3xl font-bold text-foreground mt-1">
                    {chillHoursValue === null ? "—" : chillHoursValue.toFixed(1)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    de {chillHoursTarget} objetivo
                  </p>
                </>
              )}

              {!chillLoading &&
                !chillError &&
                isSingleSensor &&
                chillSensorRow?.skippedReason && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Sin HF: {chillSensorRow.skippedReason}
                  </p>
                )}
            </div>

            <div className="p-2 rounded-lg bg-chart-2/20">
              <Thermometer className="h-5 w-5 text-chart-2" />
            </div>
          </div>

          {!chillLoading && !chillError && !selectedIsSoilForHF && (
            <div className="mt-3">
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-chart-2 rounded-full transition-all duration-500"
                  style={{ width: `${chillProgress ?? 0}%` }}
                />
              </div>

              <p className="text-xs text-chart-2 mt-1 font-medium">
                {chillProgress === null ? "—" : `${chillProgress.toFixed(1)}% completado`}
              </p>
            </div>
          )}

          {chillSensorsCount > 0 && (
            <p className="text-[10px] text-muted-foreground mt-2">
              {chillSensorsCount} sensor(es) válidos analizados
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

                {!isSingleSensor && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    Total finca
                  </Badge>
                )}
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
                  <p className="text-3xl font-bold text-foreground mt-1">
                    {gddValue === null ? "—" : gddValue.toFixed(1)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Base: {(gddData?.baseTemp ?? 7.2).toFixed(1)}°C
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

          {gddSensorsCount > 0 && (
            <p className="text-[10px] text-muted-foreground mt-2">
              {gddSensorsCount} sensor(es) válidos analizados
            </p>
          )}
        </CardContent>
      </Card>

      {/* Temperatura Actual */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Temperatura
              </p>

              {!isSingleSensor ? (
                <>
                  <p className="text-3xl font-bold text-foreground mt-1">—</p>
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
                    {latestTemperature === null ? "—" : `${latestTemperature.toFixed(1)}°C`}
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
              frostRisk ? (
                <>
                  <TrendingDown className="h-4 w-4 text-destructive" />
                  <span className="text-xs text-destructive font-medium">Riesgo helada</span>
                </>
              ) : (
                <>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">
                    Última lectura OK
                  </span>
                </>
              )
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

      {/* Humedad Suelo */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Humedad Suelo
              </p>

              {!isSingleSensor ? (
                <>
                  <p className="text-3xl font-bold text-foreground mt-1">—</p>
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
                    {latestSoilMoisture === null ? "—" : `${latestSoilMoisture.toFixed(2)}%`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {latestConductivity === null
                      ? "Conductividad: —"
                      : `Conductividad: ${latestConductivity.toFixed(2)} dS/m`}
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
                    latestSoilMoisture === null
                      ? "0%"
                      : `${clampPercent(latestSoilMoisture)}%`,
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ✅ NUEVO: Totales HF por sensor (solo modo ALL) */}
      {!isSingleSensor && (
        <Card className="bg-card border-border lg:col-span-4">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Thermometer className="h-4 w-4 text-chart-2" />
                <p className="text-sm font-semibold text-foreground">Horas Frío por sensor</p>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {chillRangeLabel}
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground">
                {chillPerSensorTotals.length} sensores con HF
              </span>
            </div>

            {chillLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Cargando...</span>
              </div>
            ) : chillError ? (
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-sm text-destructive">Error</span>
              </div>
            ) : chillPerSensorTotals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay sensores válidos con HF.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {chillPerSensorTotals.map((s) => {
                  const pct = clampPercent((s.chillHours / chillHoursTarget) * 100);
                  return (
                    <div
                      key={s.sensor}
                      className="rounded-lg border border-border bg-secondary/40 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground truncate">{s.sensor}</p>
                          <p className="text-lg font-bold text-foreground">
                            {s.chillHours.toFixed(1)}
                          </p>
                        </div>
                        {s.includedByException && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            Excepción
                          </Badge>
                        )}
                      </div>

                      <div className="mt-2">
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-chart-2 rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-chart-2 mt-1 font-medium">
                          {pct.toFixed(1)}% de {chillHoursTarget}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
