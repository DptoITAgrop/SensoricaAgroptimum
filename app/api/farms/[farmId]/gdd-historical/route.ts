// app/api/nasa-power/gdd-historical/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NASA_DAILY_POINT = "https://power.larc.nasa.gov/api/temporal/daily/point";

function isNumberLike(v: any) {
  const n = Number(v);
  return Number.isFinite(n);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function isoToYmdParts(iso: string) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
}

function ymdToIso(y: number, mo: number, d: number) {
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

function ymdToYYYYMMDD(y: number, mo: number, d: number) {
  return `${y}${pad2(mo)}${pad2(d)}`;
}

function addDaysUTC(iso: string, days: number) {
  const p = isoToYmdParts(iso);
  if (!p) return iso;
  const dt = new Date(Date.UTC(p.y, p.mo - 1, p.d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return ymdToIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function cmpIso(a: string, b: string) {
  return a.localeCompare(b);
}

function monthDay(iso: string) {
  const p = isoToYmdParts(iso);
  if (!p) return null;
  return { mo: p.mo, d: p.d };
}

function buildSeasonDates(startIso: string, endIso: string) {
  const out: string[] = [];
  let cur = startIso;
  while (cmpIso(cur, endIso) <= 0) {
    out.push(cur);
    cur = addDaysUTC(cur, 1);
    if (out.length > 420) break; // safety
  }
  return out;
}

function quantileSorted(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const a = sorted[base] ?? sorted[0];
  const b = sorted[base + 1] ?? sorted[sorted.length - 1];
  return a + (b - a) * rest;
}

async function fetchNasaDailyT2M(params: {
  lat: number;
  lon: number;
  startYYYYMMDD: string;
  endYYYYMMDD: string;
}) {
  const url = new URL(NASA_DAILY_POINT);
  url.searchParams.set("parameters", "T2M");
  url.searchParams.set("community", "ag");
  url.searchParams.set("latitude", String(params.lat));
  url.searchParams.set("longitude", String(params.lon));
  url.searchParams.set("start", params.startYYYYMMDD);
  url.searchParams.set("end", params.endYYYYMMDD);
  url.searchParams.set("format", "JSON");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false as const,
      status: res.status,
      statusText: res.statusText,
      url: url.toString(),
      details: text?.slice(0, 800) || null,
    };
  }

  const json = await res.json();
  return { ok: true as const, url: url.toString(), json };
}

function toYYYYMMDD(iso: string) {
  const p = isoToYmdParts(iso);
  if (!p) return null;
  return ymdToYYYYMMDD(p.y, p.mo, p.d);
}

function safeParseYear(v: string | null) {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const y = Math.trunc(n);
  if (y < 1900 || y > 2200) return null;
  return y;
}

function safeT2M(v: any) {
  const n = Number(v);
  // NASA a veces usa missing/sentinels. Si no es un número razonable, lo tratamos como missing.
  if (!Number.isFinite(n)) return null;
  if (n < -80 || n > 80) return null; // guardarraíl
  return n;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const latRaw = searchParams.get("lat");
  const lonRaw = searchParams.get("lon");
  const yearsRaw = searchParams.get("years") || "10";
  const baseTempRaw = searchParams.get("baseTemp") || "7.2";

  // campaña (ISO) — viene del front (o defaults)
  const startDate = searchParams.get("startDate") || "2026-04-01";
  const endDate = searchParams.get("endDate") || "2026-09-30";

  // año de campaña a visualizar (si no viene, año actual)
  const now = new Date();
  const defaultCampaignYear = now.getFullYear();
  const campaignYear =
    safeParseYear(searchParams.get("campaignYear")) ?? defaultCampaignYear;

  if (!latRaw || !lonRaw) {
    return NextResponse.json(
      { error: "lat y lon son obligatorios" },
      { status: 400 }
    );
  }
  if (!isNumberLike(latRaw) || !isNumberLike(lonRaw)) {
    return NextResponse.json(
      { error: "lat/lon inválidos", received: { latRaw, lonRaw } },
      { status: 400 }
    );
  }

  const lat = clamp(Number(latRaw), -90, 90);
  const lon = clamp(Number(lonRaw), -180, 180);

  const years = Math.max(1, Math.min(30, Number(yearsRaw) || 10));
  const baseTemp = Number(baseTempRaw);
  if (!Number.isFinite(baseTemp)) {
    return NextResponse.json({ error: "baseTemp inválido" }, { status: 400 });
  }

  const sParts = isoToYmdParts(startDate);
  const eParts = isoToYmdParts(endDate);
  if (!sParts || !eParts) {
    return NextResponse.json(
      {
        error: "startDate/endDate deben ser ISO YYYY-MM-DD",
        received: { startDate, endDate },
      },
      { status: 400 }
    );
  }

  // Solo mes/día para alinear (ancla 2000)
  const startMD0 = monthDay(startDate)!;
  let endMD0 = monthDay(endDate)!;

  // FIX campaña GDD típica: si endDate < startDate y start=04-01, forzamos 09-30
  const endBeforeStart = cmpIso(endDate, startDate) < 0;
  const startLooksLikeGdd = startMD0.mo === 4 && startMD0.d === 1;
  if (endBeforeStart && startLooksLikeGdd) {
    endMD0 = { mo: 9, d: 30 };
  }

  const crossesYear =
    endMD0.mo < startMD0.mo || (endMD0.mo === startMD0.mo && endMD0.d < startMD0.d);

  const anchorYear = 2000;
  const anchorStart = `${anchorYear}-${pad2(startMD0.mo)}-${pad2(startMD0.d)}`;
  const anchorEnd = crossesYear
    ? `${anchorYear + 1}-${pad2(endMD0.mo)}-${pad2(endMD0.d)}`
    : `${anchorYear}-${pad2(endMD0.mo)}-${pad2(endMD0.d)}`;

  const anchorDates = buildSeasonDates(anchorStart, anchorEnd);

  // =========================
  // Años históricos para media
  // (anteriores a campaignYear)
  // =========================
  const histYears: number[] = [];
  for (let i = 1; i <= years; i++) histYears.push(campaignYear - i);

  // =========================
  // Rango TOTAL a pedir a NASA
  // 1 sola llamada:
  // desde (campaignYear - years) seasonStart
  // hasta campaignYear seasonEnd
  // =========================
  const earliestYear = campaignYear - years;
  const latestYear = campaignYear;

  const earliestStartIso = `${earliestYear}-${pad2(startMD0.mo)}-${pad2(startMD0.d)}`;
  const latestEndIso = crossesYear
    ? `${latestYear + 1}-${pad2(endMD0.mo)}-${pad2(endMD0.d)}`
    : `${latestYear}-${pad2(endMD0.mo)}-${pad2(endMD0.d)}`;

  const earliestStartYYYYMMDD = toYYYYMMDD(earliestStartIso);
  const latestEndYYYYMMDD = toYYYYMMDD(latestEndIso);

  if (!earliestStartYYYYMMDD || !latestEndYYYYMMDD) {
    return NextResponse.json(
      {
        error: "Rango global inválido",
        received: { earliestStartIso, latestEndIso },
      },
      { status: 400 }
    );
  }

  const global = await fetchNasaDailyT2M({
    lat,
    lon,
    startYYYYMMDD: earliestStartYYYYMMDD,
    endYYYYMMDD: latestEndYYYYMMDD,
  });

  if (!global.ok) {
    return NextResponse.json(
      {
        error: "NASA POWER respondió con error (global)",
        status: global.status,
        statusText: global.statusText,
        url: global.url,
        details: global.details,
      },
      { status: 502 }
    );
  }

  const t2mByDate = global.json?.properties?.parameter?.T2M ?? {};

  // helper: dailyGDD para una fecha real YYYY-MM-DD
  function dailyGddForIso(iso: string) {
    const p = isoToYmdParts(iso);
    if (!p) return 0;
    const key = ymdToYYYYMMDD(p.y, p.mo, p.d);
    const t2m = safeT2M(t2mByDate[key]);
    if (t2m === null) return 0;
    const d = Math.max(0, t2m - baseTemp);
    return Math.round(d * 10) / 10;
  }

  // =========================
  // 1) Hist: acumulados por año
  // =========================
  const histCumByDay: number[][] = [];

  for (const y of histYears) {
    let cum = 0;
    const cumArr: number[] = [];

    for (const anchorIso of anchorDates) {
      const aY = Number(anchorIso.slice(0, 4));
      const mo = Number(anchorIso.slice(5, 7));
      const d = Number(anchorIso.slice(8, 10));
      const realY = aY === anchorYear ? y : y + 1;

      const isoReal = `${realY}-${pad2(mo)}-${pad2(d)}`;
      const daily = dailyGddForIso(isoReal);
      cum = Math.round((cum + daily) * 10) / 10;
      cumArr.push(cum);
    }

    histCumByDay.push(cumArr);
  }

  // Media histórica (cumulative) por día
  const historicAvg: number[] = anchorDates.map((_, idx) => {
    let sum = 0;
    let n = 0;
    for (const arr of histCumByDay) {
      const v = arr[idx];
      if (Number.isFinite(v)) {
        sum += v;
        n++;
      }
    }
    return n ? Math.round((sum / n) * 10) / 10 : 0;
  });

  // Percentiles P25/P75 (cumulative) por día
  const historicP25: number[] = anchorDates.map((_, idx) => {
    const vals = histCumByDay
      .map((arr) => arr[idx])
      .filter((v) => Number.isFinite(v)) as number[];
    vals.sort((a, b) => a - b);
    return Math.round(quantileSorted(vals, 0.25) * 10) / 10;
  });

  const historicP75: number[] = anchorDates.map((_, idx) => {
    const vals = histCumByDay
      .map((arr) => arr[idx])
      .filter((v) => Number.isFinite(v)) as number[];
    vals.sort((a, b) => a - b);
    return Math.round(quantileSorted(vals, 0.75) * 10) / 10;
  });

  // =========================
  // 2) Campaña seleccionada (campaignYear): acumulado
  // =========================
  const campaignCumByAnchorDate = new Map<string, number>();
  {
    let cum = 0;
    for (const anchorIso of anchorDates) {
      const aY = Number(anchorIso.slice(0, 4));
      const mo = Number(anchorIso.slice(5, 7));
      const d = Number(anchorIso.slice(8, 10));
      const realY = aY === anchorYear ? campaignYear : campaignYear + 1;
      const isoReal = `${realY}-${pad2(mo)}-${pad2(d)}`;

      const daily = dailyGddForIso(isoReal);
      cum = Math.round((cum + daily) * 10) / 10;
      campaignCumByAnchorDate.set(anchorIso, cum);
    }
  }

  // Rango real de campaña seleccionada
  const campStartIso = `${campaignYear}-${pad2(startMD0.mo)}-${pad2(startMD0.d)}`;
  const campEndIso = crossesYear
    ? `${campaignYear + 1}-${pad2(endMD0.mo)}-${pad2(endMD0.d)}`
    : `${campaignYear}-${pad2(endMD0.mo)}-${pad2(endMD0.d)}`;

  // =========================
  // OUTPUT
  // - date ancla 2000 para no romper tu parseo
  // - md para eje/tooltip sin enseñar 2000
  // - isoCampaign para tooltips (fecha real)
  // - current (alias) + campaign (nuevo)
  // =========================
  const series = anchorDates.map((date, i) => {
    const mo = Number(date.slice(5, 7));
    const d = Number(date.slice(8, 10));
    const isAnchor2000 = Number(date.slice(0, 4)) === anchorYear;
    const realY = isAnchor2000 ? campaignYear : campaignYear + 1;
    const isoCampaign = `${realY}-${pad2(mo)}-${pad2(d)}`;

    const camp = campaignCumByAnchorDate.get(date) ?? null;

    return {
      date, // "2000-04-01"...
      md: date.slice(5), // "04-01"
      isoCampaign, // "2018-04-01"...
      historicAvg: historicAvg[i] ?? null,
      historicP25: historicP25[i] ?? null,
      historicP75: historicP75[i] ?? null,
      campaign: camp, // nuevo
      current: camp, // alias para tu front actual (currentCumulative)
    };
  });

  return NextResponse.json({
    meta: {
      source: "NASA_POWER",
      latitude: lat,
      longitude: lon,
      baseTemp,
      years,
      campaignYear,
      histYears,
      season: { startDate: anchorStart, endDate: anchorEnd }, // ancla
      campaignSeason: { startDate: campStartIso, endDate: campEndIso }, // real
      globalFetch: {
        startDate: earliestStartIso,
        endDate: latestEndIso,
      },
    },
    series,
  });
}