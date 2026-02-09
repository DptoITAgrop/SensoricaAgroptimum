"use client";

import { useMemo, useState } from "react";
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

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type ChillApi = {
  farmId: string;
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
  selectedSensor?: string; // id de tabla
}

function formatDayLabel(yyyyMmDd: string) {
  const d = new Date(`${yyyyMmDd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return yyyyMmDd;
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

export function AgronomyChart({ farmId, selectedSensor }: AgronomyChartProps) {
  const [activeTab, setActiveTab] = useState<"chill" | "gdd">("chill");

  const sensorParam =
    selectedSensor && selectedSensor !== "all"
      ? `&sensor=${encodeURIComponent(selectedSensor)}`
      : "";

  // HF UTAH (refresco cada 60s)
  const { data: chillApi } = useSWR<ChillApi>(
    farmId
      ? `/api/farms/${farmId}/chill-hours?sampleMinutes=10${sensorParam}`
      : null,
    fetcher,
    { refreshInterval: 60000 }
  );

  // GDD base 7 (refresco cada 60s)
  const { data: gddApi } = useSWR<GddApi>(
    farmId ? `/api/farms/${farmId}/gdd?baseTemp=7${sensorParam}` : null,
    fetcher,
    { refreshInterval: 60000 }
  );

  // Normalizamos para el chart y ORDENAMOS por dateRaw asc (antiguo -> reciente)
  const chillData = useMemo(() => {
    const rows = chillApi?.series?.daily ?? [];
    return rows
      .map((r) => ({
        dateRaw: r.date, // YYYY-MM-DD
        daily: r.dailyUnits,
        accumulated: r.cumulative,
      }))
      .sort((a, b) => a.dateRaw.localeCompare(b.dateRaw));
  }, [chillApi]);

  const gddData = useMemo(() => {
    const rows = gddApi?.series?.daily ?? [];
    return rows
      .map((r) => ({
        dateRaw: r.date, // YYYY-MM-DD
        daily: r.daily,
        accumulated: r.cumulative,
      }))
      .sort((a, b) => a.dateRaw.localeCompare(b.dateRaw));
  }, [gddApi]);

  const chillConfig = useMemo(
    () => ({
      daily: { label: "UTAH diarias", color: CYAN },
      accumulated: { label: "UTAH acumulado", color: GREEN },
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

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-foreground">
          Indicadores Agronómicos
        </CardTitle>
        <p className="text-xs text-muted-foreground">Campaña actual</p>
      </CardHeader>

      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="chill">Horas Frío (UTAH)</TabsTrigger>
            <TabsTrigger value="gdd">Unidades Calor (GDD base 7)</TabsTrigger>
          </TabsList>

          {/* ---- CHILL UTAH ---- */}
          <TabsContent value="chill">
            {!hasChill ? (
              <div className="h-[260px] w-full flex items-center justify-center text-sm text-muted-foreground">
                Sin datos UTAH para el periodo/sensor seleccionado
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

                    {/* ✅ X ordenado por dateRaw (YYYY-MM-DD) y label bonito */}
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
                      name="UTAH Diarias"
                    />
                    <Area
                      yAxisId="right"
                      type="monotone"
                      dataKey="accumulated"
                      stroke={GREEN}
                      strokeWidth={2}
                      fill="url(#accumulatedGradientChill)"
                      name="UTAH Acumulado"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </TabsContent>

          {/* ---- GDD base 7 ---- */}
          <TabsContent value="gdd">
            {!hasGdd ? (
              <div className="h-[260px] w-full flex items-center justify-center text-sm text-muted-foreground">
                Sin datos GDD (base 7) para el periodo/sensor seleccionado
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

                    {/* ✅ X ordenado por dateRaw (YYYY-MM-DD) y label bonito */}
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
