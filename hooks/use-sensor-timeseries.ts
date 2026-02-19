"use client";

import { useMemo } from "react";
import useSWR from "swr";

export type TimeSeriesPoint = {
  date: string; // ISO string (solo para mostrar/tooltips si quieres)
  ts?: number; // epoch ms (RECOMENDADO para el eje X)
  temperature?: number | null;
  humidity?: number | null;
  soilMoisture?: number | null;
  conductivity?: number | null;
  precipitation?: number | null;
};

type RangePreset = "7d" | "30d" | "6m" | "1y" | "custom";

type UseSensorTimeSeriesArgs = {
  farmId?: string;
  sensorId?: string;

  preset?: RangePreset;

  startDate?: string;
  endDate?: string;

  order?: "asc" | "desc";
  metrics?: string[];

  refreshIntervalMs?: number;
  limit?: number;
};

type ApiResponse = {
  farmId: string;
  sensorId: string;
  columns: string[];
  data: Array<Record<string, any>>;
  dateColumn: string | null;
  hasTs?: boolean; // del backend corregido
  order?: string; // "asc" | "desc" opcional
};

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

function toMysqlDateTime(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

function calcPresetRange(preset: RangePreset) {
  const end = new Date();
  const start = new Date(end);

  if (preset === "7d") start.setDate(end.getDate() - 7);
  if (preset === "30d") start.setDate(end.getDate() - 30);
  if (preset === "6m") start.setMonth(end.getMonth() - 6);
  if (preset === "1y") start.setFullYear(end.getFullYear() - 1);

  return { startDate: toMysqlDateTime(start), endDate: toMysqlDateTime(end) };
}

function safeToIsoString(value: any): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();

  // Si viene como número o string numérico epoch:
  if (typeof value === "number") return new Date(value).toISOString();
  if (typeof value === "string") {
    const s = value.trim();
    // epoch string
    if (/^\d{13}$/.test(s)) return new Date(Number(s)).toISOString();
    // si ya parece ISO o datetime, lo devolvemos tal cual (para no romper)
    return s;
  }

  return String(value);
}

export function useSensorTimeSeries({
  farmId,
  sensorId,
  preset = "30d",
  startDate,
  endDate,
  order = "asc",
  metrics,
  refreshIntervalMs = 15000,
  limit = 5000,
}: UseSensorTimeSeriesArgs) {
  const range = useMemo(() => {
    if (preset === "custom") {
      return {
        startDate: startDate || "",
        endDate: endDate || "",
      };
    }
    return calcPresetRange(preset);
  }, [preset, startDate, endDate]);

  const url = useMemo(() => {
    if (!farmId || !sensorId) return null;

    const params = new URLSearchParams();
    if (range.startDate && range.endDate) {
      params.set("startDate", range.startDate);
      params.set("endDate", range.endDate);
    }
    params.set("order", order);
    params.set("limit", String(limit));
    if (metrics?.length) params.set("metrics", metrics.join(","));

    return `/api/farms/${encodeURIComponent(farmId)}/sensors/${encodeURIComponent(
      sensorId
    )}/data?${params.toString()}`;
  }, [farmId, sensorId, range.startDate, range.endDate, order, limit, metrics]);

  const { data: resp, error, isLoading } = useSWR<ApiResponse>(url, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: refreshIntervalMs,
    keepPreviousData: true,
  });

  const points: TimeSeriesPoint[] = useMemo(() => {
    if (!resp?.data?.length) return [];

    const dateCol = resp.dateColumn || "datetime";

    const mapped = resp.data
      .map((row) => {
        // ✅ preferimos ts si viene del backend
        const tsRaw = row.ts;
        const ts = typeof tsRaw === "number" ? tsRaw : Number(tsRaw);
        const hasValidTs = Number.isFinite(ts) && ts > 0;

        const dateStr = hasValidTs ? new Date(ts).toISOString() : safeToIsoString(row[dateCol]);

        const temperature = toNumberOrNull(row.temperature);
        const humidity = toNumberOrNull(row.humidity);
        const conductivity = toNumberOrNull(row.conductivity);

        return {
          date: dateStr,
          ts: hasValidTs ? ts : undefined,
          temperature,
          humidity,
          soilMoisture: humidity,
          conductivity,
        };
      })
      .filter((p) => !!p.date || (p.ts && Number.isFinite(p.ts)));

    // ✅ Orden final SIEMPRE: antiguo -> reciente
    mapped.sort((a, b) => {
      const ax = a.ts ?? Date.parse(a.date);
      const bx = b.ts ?? Date.parse(b.date);
      return ax - bx;
    });

    return mapped;
  }, [resp]);

  return {
    data: points,
    columns: resp?.columns || [],
    dateColumn: resp?.dateColumn || null,
    loading: isLoading,
    error: error ? String((error as any).message || error) : null,
    range,
    url,
  };
}
