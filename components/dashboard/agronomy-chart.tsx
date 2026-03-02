"use client";

import { useMemo, useState, useEffect } from "react";
import useSWR from "swr";
import {
  Area,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const CYAN = "#22d3ee";
const GREEN = "#4ade80";

/** ✅ fetcher robusto: no rompe si el server devuelve HTML/404 */
const fetcher = async (url: string) => {
  const r = await fetch(url, { cache: "no-store" });
  const ct = r.headers.get("content-type") || "";
  const text = await r.text().catch(() => "");

  if (!r.ok) {
    return {
      error: `HTTP ${r.status} (${r.statusText})`,
      details: text.slice(0, 500) || null,
      url,
    };
  }

  if (!ct.toLowerCase().includes("application/json")) {
    return {
      error: "Respuesta no JSON",
      details: text.slice(0, 500) || null,
      url,
    };
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      error: "JSON inválido",
      details: text.slice(0, 500) || null,
      url,
    };
  }
};

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
  error?: string;
  details?: string;
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
  error?: string;
  details?: string;
};

type PhenologyApi = {
  farmId: string;
  sensor: string | null;
  bloomDate: string;
  baseTemp: number;
  cultivar: string;
  series?: {
    daily?: Array<{
      date: string;
      daily: number;
      cumulative: number;
    }>;
  };
  summary?: {
    totalGDD?: number;
    lastDate?: string;
    avgRecentDailyGDD?: number;
    horizonDays?: number;
    sensorCount?: number;
  };
  phenology?: {
    currentPhase: { key: string; name: string; gddTarget: number } | null;
    nextPhase: { key: string; name: string; gddTarget: number } | null;
    progressToNextPct: number | null;
    milestones: Array<{
      key: string;
      name: string;
      gddTarget: number;
      reached: boolean;
      date: string | null;
      gddAtDate: number | null;
      remainingGDD: number;
      projectedDate: string | null;
    }>;
  };
  error?: string;
  details?: string;
};

/**
 * ✅ NUEVO contrato NASA histórico:
 * meta: { latitude, longitude, years, baseTemp, campaignYear, histYears, ... }
 * series: [{ date(2000-..), md, isoCampaign, historicAvg, historicP25, historicP75, campaign }]
 */
type FarmGddHistoricalApi = {
  meta?: {
    source: string;
    latitude: number;
    longitude: number;
    years: number;
    baseTemp: number;
    campaignYear?: number;
    histYears?: number[];
    season?: { startDate: string; endDate: string }; // ancla
    campaignSeason?: { startDate: string; endDate: string }; // real
  };
  series?: Array<{
    date: string; // "2000-04-01" ...
    md?: string; // "04-01"
    isoCampaign?: string; // "2024-04-01"
    historicAvg: number | null;
    historicP25?: number | null;
    historicP75?: number | null;
    campaign?: number | null; // acumulado campaña seleccionada
  }>;
  error?: string;
  details?: string;
  url?: string;
};

interface AgronomyChartProps {
  farmId: string;
  selectedSensor?: string;
  rangePreset?: RangePreset;

  defaultLat?: number | null;
  defaultLng?: number | null;
}

/** label "01 abr" etc desde ISO */
function formatDayLabel(yyyyMmDd: string) {
  const d = new Date(`${yyyyMmDd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return yyyyMmDd;
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

/** label "01 abr" desde "MM-DD" */
function formatDayLabelFromMd(md: string) {
  // md = "04-01"
  const fake = `2000-${md}`;
  return formatDayLabel(fake);
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

function getHFCampaignRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const currentYear = now.getFullYear();
  const startYear = now.getMonth() < 10 ? currentYear - 1 : currentYear;

  const start = ymd(new Date(startYear, 10, 1)); // Nov 1
  const end = ymd(new Date(startYear + 1, 2, 1)); // Mar 1
  return { startDate: start, endDate: clampYmdToToday(end) };
}

/**
 * ✅ GDD campaign:
 * - startDate: 1 Abr del año actual
 * - endDateRaw: 30 Sep del año actual (SIN clamp)
 * - endDate: clamp a hoy (para cálculos "campaña actual" / parcial)
 */
function getGDDCampaignRange(): {
  startDate: string;
  endDate: string; // clamped a hoy
  endDateRaw: string; // 30 Sep
  isActive: boolean; // hoy dentro de [start, endRaw]
} {
  const now = new Date();
  const y = now.getFullYear();
  const start = ymd(new Date(y, 3, 1)); // Apr 1
  const endRaw = ymd(new Date(y, 8, 30)); // Sep 30
  const today = ymd(now);

  const isActive = today >= start && today <= endRaw;
  return {
    startDate: start,
    endDateRaw: endRaw,
    endDate: clampYmdToToday(endRaw),
    isActive,
  };
}

function rangeLabelFromPreset(preset: RangePreset) {
  if (preset === "7d") return "Última semana";
  if (preset === "30d") return "Último mes";
  if (preset === "6m") return "Últimos 6 meses";
  if (preset === "1y") return "Último año";
  return "Rango personalizado";
}

function storageKeyGddStart(farmId: string, selectedSensor?: string) {
  return `agro:gddStart:${farmId}:${selectedSensor || "all"}`;
}

function storageKeyNasaCoords(farmId: string) {
  return `agro:nasaCoords:${farmId}`;
}

function storageKeyNasaCampaignYear(farmId: string) {
  return `agro:nasaCampaignYear:${farmId}`;
}

function defaultGddStart(gddCampaignStart: string) {
  return gddCampaignStart;
}

function inferCultivarFromSensor(selectedSensor?: string) {
  const s = (selectedSensor || "").toLowerCase();
  const m = s.match(/\(([^)]+)\)/);
  if (m?.[1]) return m[1].trim();
  return "kerman";
}

function isFiniteNumber(n: any) {
  return typeof n === "number" && Number.isFinite(n);
}

function currentYear() {
  return new Date().getFullYear();
}

export function AgronomyChart({
  farmId,
  selectedSensor,
  rangePreset = "30d",
  defaultLat = null,
  defaultLng = null,
}: AgronomyChartProps) {
  const [activeTab, setActiveTab] = useState<"chill" | "gdd">("chill");
  const isSingleSensor = !!selectedSensor && selectedSensor !== "all";

  const hfCampaign = useMemo(() => getHFCampaignRange(), []);
  const gddCampaign = useMemo(() => getGDDCampaignRange(), []);

  const [gddStartDate, setGddStartDate] = useState<string>(() =>
    defaultGddStart(gddCampaign.startDate)
  );

  const [latInput, setLatInput] = useState<string>("");
  const [lngInput, setLngInput] = useState<string>("");

  const [histYears, setHistYears] = useState<10 | 20>(10);

  // ✅ NUEVO: selector de año de campaña para NASA
  const [nasaCampaignYear, setNasaCampaignYear] = useState<number>(() => currentYear());

  // =========================
  // Persistencia localStorage
  // =========================
  useEffect(() => {
    if (!farmId) return;
    const key = storageKeyGddStart(farmId, isSingleSensor ? selectedSensor : "all");
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;

    if (saved && isValidISODate(saved)) setGddStartDate(saved);
    else setGddStartDate(defaultGddStart(gddCampaign.startDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmId, selectedSensor, isSingleSensor, gddCampaign.startDate]);

  useEffect(() => {
    if (!farmId) return;
    if (!gddStartDate || !isValidISODate(gddStartDate)) return;
    const key = storageKeyGddStart(farmId, isSingleSensor ? selectedSensor : "all");
    window.localStorage.setItem(key, gddStartDate);
  }, [farmId, gddStartDate, selectedSensor, isSingleSensor]);

  useEffect(() => {
    if (!farmId) return;

    const key = storageKeyNasaCoords(farmId);
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;

    if (saved) {
      try {
        const obj = JSON.parse(saved);
        const lat = Number(obj?.lat);
        const lng = Number(obj?.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          setLatInput(String(lat));
          setLngInput(String(lng));
          return;
        }
      } catch {}
    }

    setLatInput(isFiniteNumber(defaultLat) ? String(defaultLat) : "");
    setLngInput(isFiniteNumber(defaultLng) ? String(defaultLng) : "");
  }, [farmId, defaultLat, defaultLng]);

  useEffect(() => {
    if (!farmId) return;
    const key = storageKeyNasaCampaignYear(farmId);
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    const y = Number(saved);
    if (Number.isFinite(y) && y > 1900 && y < 2200) setNasaCampaignYear(y);
    else setNasaCampaignYear(currentYear());
  }, [farmId]);

  useEffect(() => {
    if (!farmId) return;
    const key = storageKeyNasaCampaignYear(farmId);
    window.localStorage.setItem(key, String(nasaCampaignYear));
  }, [farmId, nasaCampaignYear]);

  function saveCoordsOverride(lat: number, lng: number) {
    const key = storageKeyNasaCoords(farmId);
    window.localStorage.setItem(key, JSON.stringify({ lat, lng }));
  }

  function clearCoordsOverride() {
    const key = storageKeyNasaCoords(farmId);
    window.localStorage.removeItem(key);
    setLatInput(isFiniteNumber(defaultLat) ? String(defaultLat) : "");
    setLngInput(isFiniteNumber(defaultLng) ? String(defaultLng) : "");
  }

  const coords = useMemo(() => {
    const lat = Number(latInput);
    const lng = Number(lngInput);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng, ok: true as const };
    return { lat: null, lng: null, ok: false as const };
  }, [latInput, lngInput]);

  // ==========
  // URLs APIs
  // ==========
  const chillUrl = useMemo(() => {
    if (!farmId) return null;

    const p = new URLSearchParams();
    p.set("range", "custom");
    p.set("startDate", hfCampaign.startDate);
    p.set("endDate", hfCampaign.endDate);
    p.set("sampleMinutes", "10");
    if (isSingleSensor) p.set("sensor", selectedSensor!);

    return `/api/farms/${encodeURIComponent(farmId)}/chill-hours?${p.toString()}`;
  }, [farmId, hfCampaign.startDate, hfCampaign.endDate, isSingleSensor, selectedSensor]);

  const gddUrl = useMemo(() => {
    if (!farmId) return null;
    if (!gddCampaign.isActive) return null;

    const start =
      gddStartDate && isValidISODate(gddStartDate) ? gddStartDate : gddCampaign.startDate;

    const safeStart = start > gddCampaign.endDate ? gddCampaign.endDate : start;

    const p = new URLSearchParams();
    p.set("range", "custom");
    p.set("startDate", safeStart);
    p.set("endDate", gddCampaign.endDate);
    p.set("baseTemp", "7.2");
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

  const phenologyUrl = useMemo(() => {
    if (!farmId) return null;
    if (!gddCampaign.isActive) return null;
    if (!gddStartDate || !isValidISODate(gddStartDate)) return null;

    const start =
      gddStartDate && isValidISODate(gddStartDate) ? gddStartDate : gddCampaign.startDate;

    const safeStart = start > gddCampaign.endDate ? gddCampaign.endDate : start;

    const p = new URLSearchParams();
    p.set("bloomDate", safeStart);
    p.set("baseTemp", "7.2");
    p.set("cultivar", inferCultivarFromSensor(selectedSensor));
    p.set("horizonDays", "14");
    if (isSingleSensor) p.set("sensor", selectedSensor!);

    return `/api/farms/${encodeURIComponent(farmId)}/phenology/milestones?${p.toString()}`;
  }, [
    farmId,
    gddCampaign.isActive,
    gddCampaign.startDate,
    gddCampaign.endDate,
    gddStartDate,
    isSingleSensor,
    selectedSensor,
  ]);

  /**
   * ✅ NASA histórico
   * - Siempre campaña GDD completa (Abr -> Sep): startDate / endDateRaw
   * - Añadimos campaignYear (selector)
   *
   * IMPORTANTE:
   * Si tu endpoint es DIRECTO a NASA: cambia "/api/farms/.../gdd-historical"
   * por "/api/nasa-power/gdd-historical" y listo.
   */
  const nasaHistUrl = useMemo(() => {
    if (!farmId) return null;
    if (!coords.ok) return null;

    const p = new URLSearchParams();
    p.set("lat", String(coords.lat));
    p.set("lon", String(coords.lng));
    p.set("years", String(histYears));
    p.set("baseTemp", "7.2");

    // campaña base (Abr -> Sep) para alinear
    p.set("startDate", gddCampaign.startDate);
    p.set("endDate", gddCampaign.endDateRaw);

    // ✅ año de campaña a mostrar
    p.set("campaignYear", String(nasaCampaignYear));

    return `/api/farms/${encodeURIComponent(farmId)}/gdd-historical?${p.toString()}`;
    // return `/api/nasa-power/gdd-historical?${p.toString()}`;
  }, [
    farmId,
    coords.ok,
    coords.lat,
    coords.lng,
    histYears,
    gddCampaign.startDate,
    gddCampaign.endDateRaw,
    nasaCampaignYear,
  ]);

  // ==========
  // SWR
  // ==========
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

  const { data: phenologyApi } = useSWR<PhenologyApi>(phenologyUrl, fetcher, {
    refreshInterval: 60000,
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  const { data: nasaHistApi, isLoading: nasaHistLoading } = useSWR<FarmGddHistoricalApi>(
    nasaHistUrl,
    fetcher,
    {
      refreshInterval: 6 * 60 * 60 * 1000,
      revalidateOnFocus: false,
      keepPreviousData: true,
    }
  );

  // ==========
  // Data maps
  // ==========
  const chillData = useMemo(() => {
    const rows = chillApi?.series?.daily ?? [];
    return rows
      .map((r) => ({ dateRaw: r.date, daily: r.dailyUnits, accumulated: r.cumulative }))
      .sort((a, b) => a.dateRaw.localeCompare(b.dateRaw));
  }, [chillApi]);

  const gddData = useMemo(() => {
    const rows = gddApi?.series?.daily ?? [];
    return rows
      .map((r) => ({ dateRaw: r.date, daily: r.daily, accumulated: r.cumulative }))
      .sort((a, b) => a.dateRaw.localeCompare(b.dateRaw));
  }, [gddApi]);

  /**
   * ✅ Adaptar NASA:
   * - xKey = md (no enseñamos 2000)
   * - campaignCumulative = r.campaign
   * - avgCumulative = r.historicAvg
   * - p25/p75 banda
   * - tooltipDate = isoCampaign (fecha real del año elegido)
   */
  const nasaHistChartData = useMemo(() => {
    const rows = nasaHistApi?.series;
    if (!Array.isArray(rows)) return [];

    return rows.map((r) => ({
      x: r.md || r.date.slice(5), // "04-01"
      tooltipDate: r.isoCampaign || r.date, // "2024-04-01" si viene
      avgCumulative: r.historicAvg ?? null,
      campaignCumulative: r.campaign ?? null,
      p25: r.historicP25 ?? null,
      p75: r.historicP75 ?? null,
    }));
  }, [nasaHistApi]);

  // ==========
  // Configs
  // ==========
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

  const histConfig = useMemo(
    () => ({
      avgCumulative: { label: `Media ${histYears} años (NASA)`, color: CYAN },
      campaignCumulative: { label: `Campaña ${nasaCampaignYear} (NASA)`, color: GREEN },
      p25: { label: "P25 histórico", color: CYAN },
      p75: { label: "P75 histórico", color: CYAN },
    }),
    [histYears, nasaCampaignYear]
  );

  // ==========
  // Labels / derived
  // ==========
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

  const totalGdd = (hasGdd ? gddData[gddData.length - 1].accumulated : 0) ?? 0;

  const remainingTo450 = Math.max(0, Math.round((thresholds.gdd450 - totalGdd) * 10) / 10);
  const remainingTo900 = Math.max(0, Math.round((thresholds.gdd900 - totalGdd) * 10) / 10);

  const reached450 = totalGdd >= thresholds.gdd450;
  const reached900 = totalGdd >= thresholds.gdd900;

  const inWindow450_900 = totalGdd >= thresholds.gdd450 && totalGdd < thresholds.gdd900;

  const phenology = phenologyApi?.phenology;
  const milestones = phenology?.milestones ?? [];
  const currentPhase = phenology?.currentPhase ?? null;
  const nextPhase = phenology?.nextPhase ?? null;
  const progressToNextPct = phenology?.progressToNextPct ?? null;

  // selector años campaña (últimos 25)
  const campaignYearOptions = useMemo(() => {
    const y = currentYear();
    const out: number[] = [];
    for (let i = 0; i < 25; i++) out.push(y - i);
    return out;
  }, []);

  // ==========
  // Render
  // ==========
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

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-muted-foreground">
              Inicio GDD (plena floración):
            </span>
            <input
              type="date"
              value={gddStartDate || ""}
              min={gddCampaign.startDate}
              max={gddCampaign.endDateRaw}
              onChange={(e) => setGddStartDate(e.target.value)}
              className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground"
              disabled={!gddCampaign.isActive}
            />

            {gddCampaign.isActive && hasGdd && (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {reached450
                    ? `✅ 450 alcanzado${
                        gddApi?.milestones?.gdd450?.date
                          ? ` (${gddApi.milestones.gdd450.date})`
                          : ""
                      }`
                    : `⏳ faltan ${remainingTo450} para 450`}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {reached900
                    ? `✅ 900 alcanzado${
                        gddApi?.milestones?.gdd900?.date
                          ? ` (${gddApi.milestones.gdd900.date})`
                          : ""
                      }`
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

          <div className="mt-3 rounded-md border border-border bg-background/40 p-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-muted-foreground">
                Coordenadas para histórico (NASA POWER):
              </span>

              <input
                inputMode="decimal"
                placeholder="Lat"
                value={latInput}
                onChange={(e) => setLatInput(e.target.value)}
                className="h-7 w-[120px] rounded-md border border-border bg-background px-2 text-xs text-foreground"
              />
              <input
                inputMode="decimal"
                placeholder="Lng"
                value={lngInput}
                onChange={(e) => setLngInput(e.target.value)}
                className="h-7 w-[120px] rounded-md border border-border bg-background px-2 text-xs text-foreground"
              />

              <button
                type="button"
                onClick={() => {
                  const lat = Number(latInput);
                  const lng = Number(lngInput);
                  if (Number.isFinite(lat) && Number.isFinite(lng)) saveCoordsOverride(lat, lng);
                }}
                className="h-7 rounded-md border border-border bg-secondary px-2 text-xs text-foreground"
              >
                Guardar
              </button>

              <button
                type="button"
                onClick={clearCoordsOverride}
                className="h-7 rounded-md border border-border bg-secondary px-2 text-xs text-foreground"
              >
                Usar coords por defecto
              </button>

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Histórico:</span>
                <select
                  value={histYears}
                  onChange={(e) => setHistYears((Number(e.target.value) as any) || 10)}
                  className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                >
                  <option value={10}>10 años</option>
                  <option value={20}>20 años</option>
                </select>

                {/* ✅ NUEVO selector de campaña */}
                <span className="ml-2 text-[11px] text-muted-foreground">Campaña:</span>
                <select
                  value={nasaCampaignYear}
                  onChange={(e) => setNasaCampaignYear(Number(e.target.value))}
                  className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                >
                  {campaignYearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {!coords.ok && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Introduce lat/lng para ver el histórico (o usa “coords por defecto”).
              </p>
            )}
          </div>

          {gddCampaign.isActive && phenologyUrl && (
            <div className="mt-3 rounded-md border border-border bg-background/40 p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-[11px] text-muted-foreground">
                    Estado fenológico (estimado por GDD)
                  </span>
                  <span className="text-xs text-foreground">
                    {currentPhase
                      ? `Fase actual: ${currentPhase.name}`
                      : "Fase actual: (pendiente de datos / aún sin hitos)"}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-[11px] text-muted-foreground">Próxima fase</span>
                  <div className="text-xs text-foreground">{nextPhase ? nextPhase.name : "—"}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {(() => {
                      if (!nextPhase || !milestones.length) return "";
                      const m = milestones.find((x) => x.key === nextPhase.key);
                      if (!m) return "";
                      if (m.reached && m.date) return `✅ ${m.date}`;
                      if (!m.reached && m.projectedDate) return `📅 ${m.projectedDate} (estimada)`;
                      return "";
                    })()}
                  </div>
                </div>

                <div className="min-w-[120px]">
                  <span className="text-[11px] text-muted-foreground">Progreso a la próxima</span>
                  <div className="text-xs text-foreground">
                    {typeof progressToNextPct === "number" ? `${progressToNextPct}%` : "—"}
                  </div>
                </div>
              </div>

              {milestones.length > 0 && (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[11px] text-muted-foreground">
                        <th className="py-1 text-left font-medium">Fase</th>
                        <th className="py-1 text-right font-medium">GDD</th>
                        <th className="py-1 text-right font-medium">Fecha</th>
                        <th className="py-1 text-right font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {milestones.map((m) => {
                        const date = m.reached ? m.date : m.projectedDate || null;
                        return (
                          <tr key={m.key} className="border-t border-border/60">
                            <td className="py-1 pr-2 text-left text-foreground">{m.name}</td>
                            <td className="py-1 text-right text-foreground tabular-nums">{m.gddTarget}</td>
                            <td className="py-1 text-right text-foreground tabular-nums">{date ?? "—"}</td>
                            <td className="py-1 text-right text-foreground">{m.reached ? "✅ Alcanzada" : "⏳ Pendiente"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <p className="mt-1 text-[10px] text-muted-foreground/70">
                    * Las fechas “estimadas” se proyectan con la media de GDD diarios recientes.
                  </p>
                </div>
              )}

              {phenologyApi?.error && (
                <p className="mt-2 text-[11px] text-red-400">{phenologyApi.error}</p>
              )}
            </div>
          )}
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
                  <ComposedChart data={chillData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="accumulatedGradientChill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={GREEN} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={GREEN} stopOpacity={0} />
                      </linearGradient>
                    </defs>

                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />

                    <XAxis
                      dataKey="dateRaw"
                      tickFormatter={formatDayLabel}
                      tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      interval={9}
                    />

                    <YAxis yAxisId="left" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} tickLine={false} axisLine={false} />

                    <ChartTooltip content={<ChartTooltipContent />} />

                    <ReferenceLine
                      yAxisId="right"
                      y={1000}
                      stroke="#facc15"
                      strokeDasharray="5 5"
                      label={{ value: "Objetivo", fill: "#facc15", fontSize: 10 }}
                    />

                    <Bar yAxisId="left" dataKey="daily" fill={CYAN} opacity={0.7} radius={[2, 2, 0, 0]} name="HF Diarias" />
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
                  <ComposedChart data={gddData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="accumulatedGradientGdd" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CYAN} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={CYAN} stopOpacity={0} />
                      </linearGradient>
                    </defs>

                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />

                    <XAxis
                      dataKey="dateRaw"
                      tickFormatter={formatDayLabel}
                      tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      interval={9}
                    />

                    <YAxis yAxisId="left" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} tickLine={false} axisLine={false} />

                    <ChartTooltip content={<ChartTooltipContent />} />

                    <ReferenceLine
                      yAxisId="right"
                      y={thresholds.gdd450}
                      stroke="#facc15"
                      strokeDasharray="5 5"
                      label={{ value: "450 GDD", fill: "#facc15", fontSize: 10 }}
                    />
                    <ReferenceLine
                      yAxisId="right"
                      y={thresholds.gdd900}
                      stroke="#f97316"
                      strokeDasharray="5 5"
                      label={{ value: "900 GDD", fill: "#f97316", fontSize: 10 }}
                    />

                    <Bar yAxisId="left" dataKey="daily" fill={GREEN} opacity={0.7} radius={[2, 2, 0, 0]} name="GDD Diarios" />
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

            {/* ✅ Histórico NASA */}
            <div className="mt-4">
              {!coords.ok ? (
                <div className="h-[220px] w-full flex items-center justify-center text-sm text-muted-foreground">
                  Introduce coordenadas para ver el histórico NASA.
                </div>
              ) : nasaHistApi?.error ? (
                <div className="h-[220px] w-full flex flex-col items-center justify-center text-sm">
                  <p className="text-red-400 font-medium">Error cargando histórico NASA</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {nasaHistApi.error} {nasaHistApi.details ? `— ${nasaHistApi.details}` : ""}
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 mt-2">
                    Revisa Network → {nasaHistUrl || "(sin url)"} para ver el payload.
                  </p>
                </div>
              ) : nasaHistLoading ? (
                <div className="h-[220px] w-full flex items-center justify-center text-sm text-muted-foreground">
                  Cargando histórico NASA…
                </div>
              ) : nasaHistChartData.length === 0 ? (
                <div className="h-[220px] w-full flex items-center justify-center text-sm text-muted-foreground">
                  Sin datos de histórico NASA para estas coordenadas / campaña.
                </div>
              ) : (
                <ChartContainer config={histConfig} className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={nasaHistChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />

                      {/* ✅ EJE X sin “2000”: usamos md */}
                      <XAxis
                        dataKey="x"
                        tickFormatter={(md: string) => formatDayLabelFromMd(md)}
                        tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        interval={9}
                      />

                      <YAxis tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }} tickLine={false} axisLine={false} />

                      {/* ✅ Tooltip mostrando fecha REAL del año elegido */}
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            labelFormatter={(x: any, payload: any) => {
                              const p0 = Array.isArray(payload) && payload[0]?.payload ? payload[0].payload : null;
                              const iso = p0?.tooltipDate;
                              if (typeof iso === "string") return formatDayLabel(iso);
                              if (typeof x === "string") return formatDayLabelFromMd(x);
                              return String(x ?? "");
                            }}
                          />
                        }
                      />

                      {/* ✅ Banda P25–P75 (histórico) */}
                      <Area
                        type="monotone"
                        dataKey="p75"
                        stroke="transparent"
                        fill={CYAN}
                        fillOpacity={0.12}
                        name="Rango histórico (P25–P75)"
                        activeDot={false}
                        dot={false}
                        baseLine={(dataPoint: any) => dataPoint.p25}
                      />

                      <Line
                        type="monotone"
                        dataKey="avgCumulative"
                        stroke={CYAN}
                        strokeWidth={2}
                        dot={false}
                        name={`Media ${histYears} años (NASA)`}
                      />

                      <Line
                        type="monotone"
                        dataKey="campaignCumulative"
                        stroke={GREEN}
                        strokeWidth={2}
                        dot={false}
                        name={`Campaña ${nasaCampaignYear} (NASA)`}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </ChartContainer>
              )}

              {coords.ok &&
                nasaHistApi?.meta &&
                (() => {
                  const lat = Number((nasaHistApi as any)?.meta?.latitude ?? (nasaHistApi as any)?.meta?.lat);
                  const lon = Number((nasaHistApi as any)?.meta?.longitude ?? (nasaHistApi as any)?.meta?.lon);
                  const years = (nasaHistApi as any)?.meta?.years;
                  const baseTemp = (nasaHistApi as any)?.meta?.baseTemp;
                  const campaignYearMeta = (nasaHistApi as any)?.meta?.campaignYear ?? nasaCampaignYear;

                  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

                  return (
                    <p className="mt-1 text-[10px] text-muted-foreground/70">
                      NASA POWER · ({lat.toFixed(4)}, {lon.toFixed(4)}) · base {baseTemp} · hist {years} años · campaña {campaignYearMeta}
                    </p>
                  );
                })()}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}