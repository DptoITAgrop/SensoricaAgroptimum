"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type HeatmapCell = {
  day: number; // 0..6 (Lun..Dom)
  hour: number; // 0..23
  value: number | null;
};

type LegacyHeatmapInput =
  | Array<HeatmapCell>
  | Array<{ day: string | number; hour: string | number; value: number | null }>;

type TimeSeriesLike = Array<{
  date: string | Date;
  temperature?: number | null;
}>;

interface HeatmapChartProps {
  data: any; // lo hacemos flexible a propósito
  title?: string;
  subtitle?: string;
}

const DAYS_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeNumber(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseDate(d: any): Date | null {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function isLegacyHeatmap(data: any): data is LegacyHeatmapInput {
  return Array.isArray(data) && data.length > 0 && ("hour" in data[0]) && ("day" in data[0]);
}

function isTimeSeries(data: any): data is TimeSeriesLike {
  return Array.isArray(data) && (data.length === 0 || ("date" in data[0]));
}

function buildHeatmapFromSeries(series: TimeSeriesLike): HeatmapCell[] {
  // matriz 7x24 con acumulador
  const sum: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const cnt: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));

  for (const row of series) {
    const dt = parseDate(row?.date);
    if (!dt) continue;

    const temp = safeNumber(row?.temperature);
    if (temp === null) continue;

    // JS: 0=Dom..6=Sáb. Nosotros queremos 0=Lun..6=Dom
    const jsDay = dt.getDay();
    const day = (jsDay + 6) % 7;

    const hour = dt.getHours();
    sum[day][hour] += temp;
    cnt[day][hour] += 1;
  }

  const cells: HeatmapCell[] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const value = cnt[d][h] > 0 ? sum[d][h] / cnt[d][h] : null;
      cells.push({ day: d, hour: h, value: value === null ? null : Math.round(value * 10) / 10 });
    }
  }
  return cells;
}

function colorForValue(value: number | null, min: number, max: number) {
  if (value === null) return "rgba(255,255,255,0.04)";
  if (max <= min) return "rgba(96,165,250,0.35)";

  const t = (value - min) / (max - min);
  const tt = clamp(t, 0, 1);

  // degradado simple azul->verde->naranja (sin librerías)
  // 0: azul, 0.6: verde, 1: naranja
  if (tt < 0.6) {
    const k = tt / 0.6;
    // azul(96,165,250) -> verde(74,222,128)
    const r = Math.round(96 + (74 - 96) * k);
    const g = Math.round(165 + (222 - 165) * k);
    const b = Math.round(250 + (128 - 250) * k);
    return `rgba(${r},${g},${b},0.45)`;
  } else {
    const k = (tt - 0.6) / 0.4;
    // verde(74,222,128) -> naranja(249,115,22)
    const r = Math.round(74 + (249 - 74) * k);
    const g = Math.round(222 + (115 - 222) * k);
    const b = Math.round(128 + (22 - 128) * k);
    return `rgba(${r},${g},${b},0.5)`;
  }
}

export function HeatmapChart({
  data,
  title = "Mapa de Calor",
  subtitle = "Promedio por hora y día",
}: HeatmapChartProps) {
  const cells: HeatmapCell[] = useMemo(() => {
    if (!data) return [];

    // Si ya viene heatmap “legacy”
    if (isLegacyHeatmap(data)) {
      return (data as any[])
        .map((c) => {
          const dayRaw = c.day;
          const hourRaw = c.hour;
          const valueRaw = c.value;

          const dayNum = Number(dayRaw);
          const hourNum = Number(hourRaw);
          const valueNum = valueRaw === null ? null : safeNumber(valueRaw);

          if (!Number.isFinite(dayNum) || !Number.isFinite(hourNum)) return null;

          return {
            day: clamp(dayNum, 0, 6),
            hour: clamp(hourNum, 0, 23),
            value: valueNum,
          } as HeatmapCell;
        })
        .filter(Boolean) as HeatmapCell[];
    }

    // Si viene timeSeries (lo que estamos pasando ahora)
    if (isTimeSeries(data)) {
      return buildHeatmapFromSeries(data as TimeSeriesLike);
    }

    return [];
  }, [data]);

  const { min, max } = useMemo(() => {
    let minV = Number.POSITIVE_INFINITY;
    let maxV = Number.NEGATIVE_INFINITY;
    for (const c of cells) {
      if (c.value === null) continue;
      if (c.value < minV) minV = c.value;
      if (c.value > maxV) maxV = c.value;
    }
    if (!Number.isFinite(minV) || !Number.isFinite(maxV)) return { min: 0, max: 0 };
    return { min: minV, max: maxV };
  }, [cells]);

  // Index rápido day-hour
  const matrix = useMemo(() => {
    const m: (number | null)[][] = Array.from({ length: 7 }, () => Array(24).fill(null));
    for (const c of cells) m[c.day][c.hour] = c.value;
    return m;
  }, [cells]);

  const hasAnyValue = useMemo(() => cells.some((c) => c.value !== null), [cells]);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-foreground">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>

      <CardContent>
        {!hasAnyValue ? (
          <div className="h-[280px] w-full flex items-center justify-center">
            <p className="text-sm text-muted-foreground">
              No hay datos suficientes para generar el mapa de calor.
            </p>
          </div>
        ) : (
          <div className="w-full">
            {/* Leyenda */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground">Bajo</span>
              <span className="text-xs text-muted-foreground">
                {min.toFixed(1)}°C — {max.toFixed(1)}°C
              </span>
              <span className="text-xs text-muted-foreground">Alto</span>
            </div>

            {/* Grid: 7 filas (días) x 24 columnas (horas) */}
            <div className="overflow-x-auto">
              <div className="min-w-[720px]">
                {/* Cabecera horas */}
                <div className="grid" style={{ gridTemplateColumns: "56px repeat(24, 1fr)" }}>
                  <div />
                  {Array.from({ length: 24 }).map((_, h) => (
                    <div
                      key={h}
                      className="text-[10px] text-muted-foreground text-center pb-2"
                    >
                      {h.toString().padStart(2, "0")}
                    </div>
                  ))}
                </div>

                {/* Filas */}
                <div className="space-y-1">
                  {Array.from({ length: 7 }).map((_, d) => (
                    <div
                      key={d}
                      className="grid gap-1"
                      style={{ gridTemplateColumns: "56px repeat(24, 1fr)" }}
                    >
                      <div className="text-xs text-muted-foreground flex items-center">
                        {DAYS_ES[d]}
                      </div>

                      {Array.from({ length: 24 }).map((_, h) => {
                        const v = matrix[d][h];
                        const bg = colorForValue(v, min, max);
                        return (
                          <div
                            key={`${d}-${h}`}
                            title={`${DAYS_ES[d]} ${h
                              .toString()
                              .padStart(2, "0")}:00 → ${v === null ? "—" : `${v.toFixed(1)}°C`}`}
                            className="h-6 rounded-sm border border-border/40"
                            style={{ background: bg }}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground mt-3">
              * Valor = temperatura media por hora (si hay lecturas cada 10 min, se promedia).
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
