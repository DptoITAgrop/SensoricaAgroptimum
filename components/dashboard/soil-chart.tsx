"use client";

import { useMemo } from "react";
import {
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { TimeSeriesData } from "@/lib/types";

interface SoilChartProps {
  data: TimeSeriesData[];
  rangeLabel?: string;
  isLoading?: boolean;
  error?: any;
}

const TEAL = "#2dd4bf";
const AMBER = "#fbbf24";
const RED = "#ef4444";

type AnyRow = Record<string, any>;

function pickTimestamp(row: AnyRow): Date | null {
  const raw =
    row?.date ??
    row?.datetime ??
    row?.timestamp ??
    row?.time ??
    row?.fecha ??
    row?.created_at ??
    row?.createdAt ??
    row?.ts;

  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

function toNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normaliza conductividad a dS/m de forma segura:
 * - Si viene muy alta (ej 15040) asumimos µS/cm -> 15.04 dS/m (dividir entre 1000)
 * - Si viene en rango humano (0..200) asumimos ya mS/cm ~ dS/m y lo dejamos
 */
function normalizeConductivityToDSm(raw: any): number | null {
  const v = toNum(raw);
  if (v === null) return null;

  // Heurística bastante típica con sensores:
  // 10000-50000 = µS/cm (10-50 dS/m)
  if (v > 5000) return Math.round((v / 1000) * 100) / 100;

  // ya “pequeño”: lo tomamos como dS/m (o mS/cm equivalente)
  return Math.round(v * 100) / 100;
}

export function SoilChart({
  data,
  rangeLabel = "Últimos 30 días",
  isLoading,
  error,
}: SoilChartProps) {
  const chartConfig = useMemo(
    () => ({
      soilMoisture: { label: "Humedad Suelo", color: TEAL },
      conductivity: { label: "Conductividad", color: AMBER },
    }),
    []
  );

  const formattedData = useMemo(() => {
    const rows = Array.isArray(data) ? data : [];
    return rows
      .map((d: AnyRow) => {
        const dt = pickTimestamp(d);
        if (!dt) return null;

        // Humedad suelo: en tu BD es "humidity" pero tu mock usa "soilMoisture"
        const soilMoisture =
          toNum(d.soilMoisture) ??
          toNum(d.soil_moisture) ??
          toNum(d.humidity) ??
          toNum(d.humedad) ??
          toNum(d.moisture);

        const conductivity =
          normalizeConductivityToDSm(d.conductivity) ??
          normalizeConductivityToDSm(d.ec) ??
          normalizeConductivityToDSm(d.conductividad);

        return {
          _ts: dt.toISOString(),
          // para que no salga Invalid Date y se vea bien en rangos cortos/largos:
          date: dt.toLocaleString("es-ES", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          }),
          soilMoisture,
          conductivity,
        };
      })
      .filter(Boolean) as Array<{
      _ts: string;
      date: string;
      soilMoisture: number | null;
      conductivity: number | null;
    }>;
  }, [data]);

  // Para que el eje derecho no se vaya a Marte:
  const conductivityMax = useMemo(() => {
    const vals = formattedData
      .map((r) => r.conductivity)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (vals.length === 0) return 10;
    const max = Math.max(...vals);
    // margen visual
    return Math.max(5, Math.ceil(max * 1.2));
  }, [formattedData]);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-foreground">
          Suelo: Humedad y Conductividad
        </CardTitle>
        <p className="text-xs text-muted-foreground">{rangeLabel}</p>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="h-[280px] w-full flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Cargando…</p>
          </div>
        ) : error ? (
          <div className="h-[280px] w-full flex items-center justify-center">
            <p className="text-sm text-destructive">Error cargando datos</p>
          </div>
        ) : formattedData.length === 0 ? (
          <div className="h-[280px] w-full flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Sin datos</p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={formattedData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.1)"
                />

                <XAxis
                  dataKey="date"
                  tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={18}
                />

                <YAxis
                  yAxisId="left"
                  tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 100]}
                />

                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, conductivityMax]}
                />

                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_, payload) => {
                        const p = payload?.[0]?.payload as any;
                        if (!p?._ts) return "";
                        return new Date(p._ts).toLocaleString("es-ES");
                      }}
                    />
                  }
                />

                {/* Ejemplo de umbral (ajústalo a tu criterio): 4 dS/m */}
                <ReferenceLine
                  yAxisId="right"
                  y={4}
                  stroke={RED}
                  strokeDasharray="5 5"
                  label={{ value: "Alerta", fill: RED, fontSize: 10 }}
                />

                <Bar
                  yAxisId="left"
                  dataKey="soilMoisture"
                  fill={TEAL}
                  opacity={0.7}
                  radius={[4, 4, 0, 0]}
                  name="Humedad Suelo (%)"
                />

                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="conductivity"
                  stroke={AMBER}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  name="Conductividad (dS/m)"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}

        <div className="flex items-center justify-center gap-6 mt-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: TEAL }} />
            <span className="text-xs text-muted-foreground">Humedad Suelo</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5" style={{ backgroundColor: AMBER }} />
            <span className="text-xs text-muted-foreground">Conductividad (dS/m)</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
