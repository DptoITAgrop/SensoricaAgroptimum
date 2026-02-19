"use client";

import { useMemo, useState, useEffect } from "react";
import useSWR from "swr";
import {
  Area,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const CYAN = "#22d3ee";
const GREEN = "#4ade80";

const fetcher = (url: string) =>
  fetch(url, { cache: "no-store" }).then((r) => r.json());

type RangePreset = "7d" | "30d" | "6m" | "1y" | "custom";

type ChillApi = {
  farmId: string;
  period?: { start: string; end: string };
  queryRange?: { start: string; end: string };
  series?: {
    daily?: Array<{
      date: string; // YYYY-MM-DD
      dailyUnits: number;
      cumulative: number;
    }>;
  };
};

type GddApi = {
  farmId: string;
  baseTemp: number;
  period?: { start: string; end: string };
  queryRange?: { start: string; end: string };
  thresholds?: { gdd450: number; gdd900: number };
  milestones?: {
    gdd450?: { reached: boolean; date: string | null };
    gdd900?: { reached: boolean; date: string | null };
  };
  summary?: {
    totalGDD?: number;
    avgGDD?: number;
    sensorCount?: number;
    window450_900?: boolean;
    remainingTo450?: number;
    remainingTo900?: number;
  };
  series?: {
    daily?: Array<{
      date: string; // YYYY-MM-DD
      daily: number;
      cumulative: number;
    }>;
  };
};

interface AgronomyChartProps {
  farmId: string;
  selectedSensor?: string;
  rangePreset?: RangePreset; // UI-only (no afecta campañas)
}

function formatDayLabel(yyyyMmDd: string) {
  const d = new Date(`${yyyyMmDd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return yyyyMmDd;
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function clampYmdToToday(ymdStr: string) {
  const today = ymd(new Date());
  return ymdStr > today ? today : ymdStr;
}

function isValidISODate(d: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

/**
 * HF campaign: 1 Nov -> 1 Mar (clamped a hoy)
 * startYear: si hoy es antes de Nov => campaña empezó el año anterior
 */
function getHFCampaignRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const currentYear = now.getFullYear();
  const startYear = now.getMonth() < 10 ? currentYear - 1 : currentYear;

  const start = ymd(new Date(startYear, 10, 1)); // Nov 1
  const end = ymd(new Date(startYear + 1, 2, 1)); // Mar 1
  return { startDate: start, endDate: clampYmdToToday(end) };
}

/**
 * GDD campaign: 1 Abr -> 30 Sep (clamped a hoy)
 * Si hoy < 1 Abr => campaña no activa
 */
function getGDDCampaignRange(): {
  startDate: string;
  endDate: string;
  isActive: boolean;
} {
  const now = new Date();
  const y = now.getFullYear();
  const start = ymd(new Date(y, 3, 1)); // Apr 1
  const end = ymd(new Date(y, 8, 30)); // Sep 30
  const today = ymd(now);

  const isActive = today >= start; // solo activa si ya hemos llegado a abril
  return { startDate: start, endDate: clampYmdToToday(end), isActive };
}

function rangeLabelFromPreset(preset: RangePreset) {
  if (preset === "7d") return "Última semana";
  if (preset === "30d") return "Último mes";
  if (preset === "6m") return "Últimos 6 meses";
  if (preset === "1y") return "Último año";
  return "Rango personalizado";
}

function storageKey(farmId: string, selectedSensor?: string) {
  return `agro:gddStart:${farmId}:${selectedSensor || "all"}`;
}

/**
 * Por defecto, si no hay “plena floración”, usamos el inicio de campaña GDD.
 * (Esto luego lo ideal es persistirlo en BD por finca/variedad, pero como MVP funciona perfecto.)
 */
function defaultGddStart(gddCampaignStart: string) {
  return gddCampaignStart;
}

export function AgronomyChart({
  farmId,
  selectedSensor,
  rangePreset = "30d",
}: AgronomyChartProps) {
  const [activeTab, setActiveTab] = useState<"chill" | "gdd">("chill");
  const isSingleSensor = !!selectedSensor && selectedSensor !== "all";

  const hfCampaign = useMemo(() => getHFCampaignRange(), []);
  const gddCampaign = useMemo(() => getGDDCampaignRange(), []);

  // ✅ Fecha inicio GDD (plena floración)
  const [gddStartDate, setGddStartDate] = useState<string>(() =>
    defaultGddStart(gddCampaign.startDate)
  );

  // Cargar de localStorage cuando haya farmId
  useEffect(() => {
    if (!farmId) return;
    const key = storageKey(farmId, isSingleSensor ? selectedSensor : "all");
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;

    if (saved && isValidISODate(saved)) {
      setGddStartDate(saved);
    } else {
      // si no hay, ponemos inicio campaña
      setGddStartDate(defaultGddStart(gddCampaign.startDate));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmId, selectedSensor, isSingleSensor, gddCampaign.startDate]);

  // Guardar cambios
  useEffect(() => {
    if (!farmId) return;
    if (!gddStartDate || !isValidISODate(gddStartDate)) return;
    const key = storageKey(farmId, isSingleSensor ? selectedSensor : "all");
    window.localStorage.setItem(key, gddStartDate);
  }, [farmId, gddStartDate, selectedSensor, isSingleSensor]);

  const chillUrl = useMemo(() => {
    if (!farmId) return null;

    const p = new URLSearchParams();
    p.set("range", "custom");
    p.set("startDate", hfCampaign.startDate);
    p.set("endDate", hfCampaign.endDate);
    p.set("sampleMinutes", "10");
    if (isSingleSensor) p.set("sensor", selectedSensor!);

    return `/api/farms/${encodeURIComponent(farmId)}/chill-hours?${p.toString()}`;
  }, [
    farmId,
    hfCampaign.startDate,
    hfCampaign.endDate,
    isSingleSensor,
    selectedSensor,
  ]);

  const gddUrl = useMemo(() => {
    if (!farmId) return null;
    if (!gddCampaign.isActive) return null; // ✅ fuera de campaña => no llamamos

    // Clamp: no permitir inicio > fin
    const start =
      gddStartDate && isValidISODate(gddStartDate)
        ? gddStartDate
        : gddCampaign.startDate;

    const safeStart = start > gddCampaign.endDate ? gddCampaign.endDate : start;

    const p = new URLSearchParams();
    p.set("range", "custom");
    p.set("startDate", safeStart); // ✅ plena floración (inicio acumulación)
    p.set("endDate", gddCampaign.endDate);
    p.set("baseTemp", "7.2"); // ✅ base 7.2
    if (isSingleSensor) p.set("sensor", selectedSensor!);

    return `/api/farms/${encodeURIComponent(farmId)}/gdd?${p.toString()}`;
  }, [
    farmId,
    gddCampaign.isActive,
    gddCampaign.startDate,
    gddCampaign.endDate,
    gddStartDate,
    isSingleSensor,
    selectedSensor,
  ]);

  const { data: chillApi } = useSWR<ChillApi>(chillUrl, fetcher, {
    refreshInterval: 60000,
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  const { data: gddApi } = useSWR<GddApi>(gddUrl, fetcher, {
    refreshInterval: 60000,
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  const chillData = useMemo(() => {
    const rows = chillApi?.series?.daily ?? [];
    return rows
      .map((r) => ({
        dateRaw: r.date,
        daily: r.dailyUnits,
        accumulated: r.cumulative,
      }))
      .sort((a, b) => a.dateRaw.localeCompare(b.dateRaw));
  }, [chillApi]);

  const gddData = useMemo(() => {
    const rows = gddApi?.series?.daily ?? [];
    return rows
      .map((r) => ({
        dateRaw: r.date,
        daily: r.daily,
        accumulated: r.cumulative,
      }))
      .sort((a, b) => a.dateRaw.localeCompare(b.dateRaw));
  }, [gddApi]);

  const chillConfig = useMemo(
    () => ({
      daily: { label: "HF diarias", color: CYAN },
      accumulated: { label: "HF acumuladas", color: GREEN },
    }),
    []
  );

  const gddConfig = useMemo(
    () => ({
      daily: { label: "GDD diarios", color: GREEN },
      accumulated: { label: "GDD acumulado", color: CYAN },
    }),
    []
  );

  const hasChill = chillData.length > 0;
  const hasGdd = gddData.length > 0;

  const hfLabel = `HF: ${hfCampaign.startDate} → ${hfCampaign.endDate}`;

  const gddLabel = gddCampaign.isActive
    ? `GDD (base 7.2): ${gddStartDate || gddCampaign.startDate} → ${gddCampaign.endDate}`
    : `GDD: (fuera de campaña)`;

  const thresholds = {
    gdd450: gddApi?.thresholds?.gdd450 ?? 450,
    gdd900: gddApi?.thresholds?.gdd900 ?? 900,
  };

  const totalGdd =
    (hasGdd ? gddData[gddData.length - 1].accumulated : 0) ?? 0;

  const remainingTo450 = Math.max(0, Math.round((thresholds.gdd450 - totalGdd) * 10) / 10);
  const remainingTo900 = Math.max(0, Math.round((thresholds.gdd900 - totalGdd) * 10) / 10);

  const reached450 = totalGdd >= thresholds.gdd450;
  const reached900 = totalGdd >= thresholds.gdd900;

  const inWindow450_900 = totalGdd >= thresholds.gdd450 && totalGdd < thresholds.gdd900;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-foreground">
          Indicadores Agronómicos
        </CardTitle>

        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">{hfLabel}</p>
          <p className="text-xs text-muted-foreground">{gddLabel}</p>

          <p className="text-[10px] text-muted-foreground/70">
            (Selector UI: {rangeLabelFromPreset(rangePreset)} — no afecta campañas HF/GDD)
          </p>

          {/* ✅ Selector plena floración */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-muted-foreground">
              Inicio GDD (plena floración):
            </span>
            <input
              type="date"
              value={gddStartDate || ""}
              min={gddCampaign.startDate}
              max={gddCampaign.endDate}
              onChange={(e) => setGddStartDate(e.target.value)}
              className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground"
              disabled={!gddCampaign.isActive}
            />

            {gddCampaign.isActive && hasGdd && (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {reached450
                    ? `✅ 450 alcanzado${gddApi?.milestones?.gdd450?.date ? ` (${gddApi.milestones.gdd450.date})` : ""}`
                    : `⏳ faltan ${remainingTo450} para 450`}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {reached900
                    ? `✅ 900 alcanzado${gddApi?.milestones?.gdd900?.date ? ` (${gddApi.milestones.gdd900.date})` : ""}`
                    : `⏳ faltan ${remainingTo900} para 900`}
                </span>
                {inWindow450_900 && (
                  <span className="text-[11px] text-muted-foreground">
                    💧 Ventana 450–900 (restricción riego)
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="chill">Horas Frío (0–7.2°C)</TabsTrigger>
            <TabsTrigger value="gdd">Unidades Calor (GDD base 7.2)</TabsTrigger>
          </TabsList>

          <TabsContent value="chill">
            {!hasChill ? (
              <div className="h-[260px] w-full flex items-center justify-center text-sm text-muted-foreground">
                Sin datos de Horas Frío para la campaña / sensor seleccionado
              </div>
            ) : (
              <ChartContainer config={chillConfig} className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chillData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="accumulatedGradientChill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="5%" stopColor={GREEN} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={GREEN} stopOpacity={0} />
                      </linearGradient>
                    </defs>

                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.1)"
                    />

                    <XAxis
                      dataKey="dateRaw"
                      tickFormatter={formatDayLabel}
                      tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      interval={9}
                    />

                    <YAxis
                      yAxisId="left"
                      tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />

                    <ChartTooltip content={<ChartTooltipContent />} />

                    <ReferenceLine
                      yAxisId="right"
                      y={1000}
                      stroke="#facc15"
                      strokeDasharray="5 5"
                      label={{ value: "Objetivo", fill: "#facc15", fontSize: 10 }}
                    />

                    <Bar
                      yAxisId="left"
                      dataKey="daily"
                      fill={CYAN}
                      opacity={0.7}
                      radius={[2, 2, 0, 0]}
                      name="HF Diarias"
                    />
                    <Area
                      yAxisId="right"
                      type="monotone"
                      dataKey="accumulated"
                      stroke={GREEN}
                      strokeWidth={2}
                      fill="url(#accumulatedGradientChill)"
                      name="HF Acumuladas"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </TabsContent>

          <TabsContent value="gdd">
            {!gddCampaign.isActive ? (
              <div className="h-[260px] w-full flex items-center justify-center text-sm text-muted-foreground">
                Fuera de campaña GDD (1 Abr → 30 Sep)
              </div>
            ) : !hasGdd ? (
              <div className="h-[260px] w-full flex items-center justify-center text-sm text-muted-foreground">
                Sin datos GDD (base 7.2) para la campaña / sensor seleccionado
              </div>
            ) : (
              <ChartContainer config={gddConfig} className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={gddData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="accumulatedGradientGdd"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="5%" stopColor={CYAN} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={CYAN} stopOpacity={0} />
                      </linearGradient>
                    </defs>

                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.1)"
                    />

                    <XAxis
                      dataKey="dateRaw"
                      tickFormatter={formatDayLabel}
                      tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      interval={9}
                    />

                    <YAxis
                      yAxisId="left"
                      tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />

                    <ChartTooltip content={<ChartTooltipContent />} />

                    {/* ✅ Avisos GDD 450 / 900 */}
                    <ReferenceLine
                      yAxisId="right"
                      y={thresholds.gdd450}
                      stroke="#facc15"
                      strokeDasharray="5 5"
                      label={{
                        value: "450 GDD",
                        fill: "#facc15",
                        fontSize: 10,
                      }}
                    />
                    <ReferenceLine
                      yAxisId="right"
                      y={thresholds.gdd900}
                      stroke="#f97316"
                      strokeDasharray="5 5"
                      label={{
                        value: "900 GDD",
                        fill: "#f97316",
                        fontSize: 10,
                      }}
                    />

                    <Bar
                      yAxisId="left"
                      dataKey="daily"
                      fill={GREEN}
                      opacity={0.7}
                      radius={[2, 2, 0, 0]}
                      name="GDD Diarios"
                    />
                    <Area
                      yAxisId="right"
                      type="monotone"
                      dataKey="accumulated"
                      stroke={CYAN}
                      strokeWidth={2}
                      fill="url(#accumulatedGradientGdd)"
                      name="GDD Acumulado"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
