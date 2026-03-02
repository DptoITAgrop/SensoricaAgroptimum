"use client";

import { useMemo } from "react";
import {
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

  cc?: number | string | null;
  pmp?: number | string | null;
}

const TEAL = "#2dd4bf";
const AMBER = "#fbbf24";
const RED = "#ef4444";
const GREEN = "#22c55e";

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
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && !v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function safeLabel(v: number | null | undefined) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "";
  return Math.abs(v - Math.round(v)) > 1e-9 ? v.toFixed(2) : String(v);
}

export function SoilChart({
  data,
  rangeLabel = "Últimos 30 días",
  isLoading,
  error,
  cc = null,
  pmp = null,
}: SoilChartProps) {
  const ccN = useMemo(() => toNum(cc), [cc]);
  const pmpN = useMemo(() => toNum(pmp), [pmp]);

  const chartConfig = useMemo(
    () => ({
      soilMoisture: { label: "Humedad suelo (%)", color: TEAL },
      conductivity: { label: "CE (µS/cm)", color: AMBER },
    }),
    []
  );

  const formattedData = useMemo(() => {
    const rows = Array.isArray(data) ? data : [];
    return rows
      .map((d: AnyRow) => {
        const dt = pickTimestamp(d);
        if (!dt) return null;

        const soilMoisture =
          toNum(d.soilMoisture) ??
          toNum(d.soil_moisture) ??
          toNum(d.humidity) ??
          toNum(d.humedad) ??
          toNum(d.moisture);

        const conductivity =
          toNum(d.conductivity) ?? toNum(d.ec) ?? toNum(d.conductividad);

        return {
          _ts: dt.toISOString(),
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

  const rightMax = useMemo(() => {
    const vals = formattedData
      .map((r) => r.conductivity)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (!vals.length) return 100;
    const max = Math.max(...vals);
    return Math.max(100, Math.ceil(max * 1.15));
  }, [formattedData]);

  const leftDomain = useMemo(() => {
    const vals = formattedData
      .map((r) => r.soilMoisture)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

    const refVals = [ccN, pmpN].filter(
      (v): v is number => typeof v === "number" && Number.isFinite(v)
    );

    const all = [...vals, ...refVals];
    if (!all.length) return [0, 100] as [number, number];

    const min = Math.min(...all);
    const max = Math.max(...all);

    const span = Math.max(1, max - min);
    const pad = span * 0.12;

    const lo = Math.max(0, Math.floor((min - pad) * 100) / 100);
    const hi = Math.ceil((max + pad) * 100) / 100;

    return [lo, hi] as [number, number];
  }, [formattedData, ccN, pmpN]);

  const showCC = typeof ccN === "number" && Number.isFinite(ccN);
  const showPMP = typeof pmpN === "number" && Number.isFinite(pmpN);

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
                margin={{ top: 12, right: 18, left: -10, bottom: 0 }}
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

                {/* ✅ IMPORTANTE: yAxisId="left" */}
                <YAxis
                  yAxisId="left"
                  tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  domain={leftDomain}
                />

                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, rightMax]}
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

                {/* ✅ Primero las series */}
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="soilMoisture"
                  stroke={TEAL}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  name="Humedad suelo (%)"
                />

                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="conductivity"
                  stroke={AMBER}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  name="CE (µS/cm)"
                />

                {/* ✅ Y luego las líneas, en FRONT */}
                {showCC && (
                  <ReferenceLine
                    yAxisId="left"
                    y={ccN as number}
                    stroke={GREEN}
                    strokeWidth={3}
                    strokeDasharray="6 4"
                    ifOverflow="extendDomain"
                    isFront
                  />
                )}

                {showPMP && (
                  <ReferenceLine
                    yAxisId="left"
                    y={pmpN as number}
                    stroke={RED}
                    strokeWidth={3}
                    strokeDasharray="6 4"
                    ifOverflow="extendDomain"
                    isFront
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}

        {/* Leyenda */}
        <div className="flex items-center justify-center gap-6 mt-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5" style={{ backgroundColor: TEAL }} />
            <span className="text-xs text-muted-foreground">Humedad suelo (%)</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5" style={{ backgroundColor: AMBER }} />
            <span className="text-xs text-muted-foreground">CE (µS/cm)</span>
          </div>

          {showCC && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-0.5" style={{ backgroundColor: GREEN }} />
              <span className="text-xs text-muted-foreground">
                CC ({safeLabel(ccN)})
              </span>
            </div>
          )}

          {showPMP && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-0.5" style={{ backgroundColor: RED }} />
              <span className="text-xs text-muted-foreground">
                PMP ({safeLabel(pmpN)})
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}