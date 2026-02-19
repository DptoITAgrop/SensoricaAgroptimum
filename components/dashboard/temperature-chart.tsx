"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
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

type AnyRow = Record<string, any>;

interface TemperatureChartProps {
  data: AnyRow[];
  rangeLabel?: string;
  isLoading?: boolean;
  error?: any;
}

const GREEN = "#4ade80";
const BLUE = "#60a5fa";
const ORANGE = "#f97316";

function pickEpochMs(row: AnyRow): number | null {
  // ✅ prioridad: ts (ms) si viene del hook/backend
  const tsRaw = row?.ts;
  if (tsRaw !== undefined && tsRaw !== null && tsRaw !== "") {
    const ts = typeof tsRaw === "number" ? tsRaw : Number(tsRaw);
    if (Number.isFinite(ts) && ts > 0) return ts;
  }

  const raw =
    row?.date ??
    row?.datetime ??
    row?.timestamp ??
    row?.time ??
    row?.fecha ??
    row?.created_at ??
    row?.createdAt;

  if (!raw) return null;

  // epoch string
  if (typeof raw === "string" && /^\d{13}$/.test(raw.trim())) {
    const ts = Number(raw.trim());
    if (Number.isFinite(ts) && ts > 0) return ts;
  }

  const d = raw instanceof Date ? raw : new Date(raw);
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

function pickNumber(row: AnyRow, keys: string[]): number | null {
  for (const k of keys) {
    const v = row?.[k];
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function formatTick(ts: number) {
  // formato compacto para el eje X
  return new Date(ts).toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TemperatureChart({
  data,
  rangeLabel = "Últimos 30 días",
  isLoading,
  error,
}: TemperatureChartProps) {
  const chartConfig = useMemo(
    () => ({
      temperature: { label: "Temperatura", color: GREEN },
      humidity: { label: "Humedad", color: BLUE },
    }),
    []
  );

  const formattedData = useMemo(() => {
    const rows = Array.isArray(data) ? data : [];

    const mapped = rows
      .map((row) => {
        const ts = pickEpochMs(row);
        if (!ts) return null;

        const temperature = pickNumber(row, ["temperature", "temp", "temperatura"]);
        const humidity = pickNumber(row, ["humidity", "hum", "humedad"]);

        return {
          ts, // ✅ eje X
          // ISO solo para tooltip (si quieres)
          _iso: new Date(ts).toISOString(),
          temperature,
          humidity,
        };
      })
      .filter(Boolean) as Array<{
      ts: number;
      _iso: string;
      temperature: number | null;
      humidity: number | null;
    }>;

    // ✅ SIEMPRE: antiguo -> reciente
    mapped.sort((a, b) => a.ts - b.ts);

    return mapped;
  }, [data]);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-foreground">
          Temperatura y Humedad
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
              <AreaChart
                data={formattedData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={GREEN} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={GREEN} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="humGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={BLUE} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={BLUE} stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />

                <XAxis
                  dataKey="ts"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(v) => formatTick(Number(v))}
                  tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={18}
                />

                <YAxis
                  tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />

                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_, payload) => {
                        const p = payload?.[0]?.payload;
                        if (!p?.ts) return "";
                        return new Date(p.ts).toLocaleString("es-ES");
                      }}
                    />
                  }
                />

                <ReferenceLine
                  y={0}
                  stroke={ORANGE}
                  strokeDasharray="5 5"
                  label={{ value: "Helada", fill: ORANGE, fontSize: 10 }}
                />

                {/* ✅ tipo "stepAfter" para que sea escalera como Nespra */}
                <Area
                  type="stepAfter"
                  dataKey="temperature"
                  stroke={GREEN}
                  strokeWidth={2}
                  fill="url(#tempGradient)"
                  name="Temperatura (°C)"
                  connectNulls
                  isAnimationActive={false}
                />
                <Area
                  type="stepAfter"
                  dataKey="humidity"
                  stroke={BLUE}
                  strokeWidth={2}
                  fill="url(#humGradient)"
                  name="Humedad (%)"
                  connectNulls
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}

        <div className="flex items-center justify-center gap-6 mt-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: GREEN }} />
            <span className="text-xs text-muted-foreground">Temperatura</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: BLUE }} />
            <span className="text-xs text-muted-foreground">Humedad</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
