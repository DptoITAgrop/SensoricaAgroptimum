"use client";

import { useMemo } from "react";
import useSWR from "swr";

export type TimeSeriesPoint = {
  date: string; // datetime ISO o string
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

  // Rango rápido
  preset?: RangePreset;

  // Custom range (MySQL DATETIME string o YYYY-MM-DD)
  startDate?: string;
  endDate?: string;

  order?: "asc" | "desc";
  metrics?: string[];

  // “Tiempo real”
  refreshIntervalMs?: number; // ej 15000
  limit?: number; // ej 5000
};

type ApiResponse = {
  farmId: string;
  sensorId: string;
  columns: string[];
  data: Array<Record<string, any>>;
  dateColumn: string | null;
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

    return resp.data
      .map((row) => {
        const d = row[dateCol];
        const dateStr =
          d instanceof Date
            ? d.toISOString()
            : typeof d === "string"
            ? d
            : d
            ? String(d)
            : "";

        const temperature = toNumberOrNull(row.temperature);
        const humidity = toNumberOrNull(row.humidity);
        const conductivity = toNumberOrNull(row.conductivity);

        return {
          date: dateStr,
          temperature,
          humidity,
          soilMoisture: humidity,
          conductivity,
        };
      })
      .filter((p) => !!p.date)
      .reverse(); // porque el endpoint suele venir DESC; esto lo deja consistente si te llega desc
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
