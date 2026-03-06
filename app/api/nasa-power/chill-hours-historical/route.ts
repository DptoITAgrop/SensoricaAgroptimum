// app/api/nasa-power/chill-hours-historical/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ✅ NASA POWER - DAILY POINT (mucho más estable que HOURLY para rangos largos)
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

function toYYYYMMDD(iso: string) {
  const p = isoToYmdParts(iso);
  if (!p) return null;
  return ymdToYYYYMMDD(p.y, p.mo, p.d);
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

function safeParseYear(v: string | null) {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const y = Math.trunc(n);
  if (y < 1900 || y > 2200) return null;
  return y;
}

function safeTemp(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < -80 || n > 80) return null;
  return n;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/**
 * ✅ Horas dentro de un rango [low..high] usando SINGLE-SINE (estimación diaria)
 *
 * Asumimos temperatura diaria como seno con:
 * - media = (Tmax + Tmin)/2
 * - amplitud = (Tmax - Tmin)/2
 * La fracción de tiempo donde T está entre low..high es:
 *   frac = (asin(v) - asin(u)) / π
 * donde u=(low-mean)/amp, v=(high-mean)/amp, clamp [-1..1]
 */
function hoursInBandSingleSine(tmin: number, tmax: number, low: number, high: number) {
  const a = Math.min(low, high);
  const b = Math.max(low, high);

  const mn = Math.min(tmin, tmax);
  const mx = Math.max(tmin, tmax);

  // si el rango no intersecta con [Tmin..Tmax]
  if (b <= mn) return 0;
  if (a >= mx) return 0;

  // si cubre todo el rango diario
  if (a <= mn && b >= mx) return 24;

  const mean = (mx + mn) / 2;
  const amp = (mx - mn) / 2;

  // sin variación
  if (amp <= 1e-9) {
    const t = mean;
    return t >= a && t <= b ? 24 : 0;
  }

  const uRaw = (a - mean) / amp;
  const vRaw = (b - mean) / amp;

  const u = clamp(uRaw, -1, 1);
  const v = clamp(vRaw, -1, 1);

  const asinU = Math.asin(u);
  const asinV = Math.asin(v);

  const frac = (asinV - asinU) / Math.PI; // 0..1
  const hours = frac * 24;

  // guardarraíl final
  return Math.max(0, Math.min(24, hours));
}

async function fetchNasaDailyMinMax(params: {
  lat: number;
  lon: number;
  startYYYYMMDD: string;
  endYYYYMMDD: string;
}) {
  const url = new URL(NASA_DAILY_POINT);

  // ✅ para HF: necesitamos min/max diarios
  url.searchParams.set("parameters", "T2M_MIN,T2M_MAX");
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
      details: text?.slice(0, 1200) || null,
    };
  }

  const json = await res.json();
  return { ok: true as const, url: url.toString(), json };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const latRaw = searchParams.get("lat");
    const lonRaw = searchParams.get("lon");
    const yearsRaw = searchParams.get("years") || "10";

    // campaña HF típica: 1 Nov -> 1 Mar (cruza año)
    const startDate = searchParams.get("startDate") || "2025-11-01";
    const endDate = searchParams.get("endDate") || "2026-03-01";

    // campaña a visualizar
    const now = new Date();
    const defaultCampaignYear = now.getFullYear();
    const campaignYear = safeParseYear(searchParams.get("campaignYear")) ?? defaultCampaignYear;

    // umbrales HF
    const minTempRaw = searchParams.get("minTemp") ?? "0";
    const maxTempRaw = searchParams.get("maxTemp") ?? "7.2";

    if (!latRaw || !lonRaw) {
      return NextResponse.json({ error: "lat y lon son obligatorios" }, { status: 400 });
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

    const minTemp = Number(minTempRaw);
    const maxTemp = Number(maxTempRaw);
    if (!Number.isFinite(minTemp) || !Number.isFinite(maxTemp) || minTemp > maxTemp) {
      return NextResponse.json(
        { error: "minTemp/maxTemp inválidos", received: { minTempRaw, maxTempRaw } },
        { status: 400 }
      );
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
    const endMD0 = monthDay(endDate)!;

    const crossesYear =
      endMD0.mo < startMD0.mo || (endMD0.mo === startMD0.mo && endMD0.d < startMD0.d);

    const anchorYear = 2000;
    const anchorStart = `${anchorYear}-${pad2(startMD0.mo)}-${pad2(startMD0.d)}`;
    const anchorEnd = crossesYear
      ? `${anchorYear + 1}-${pad2(endMD0.mo)}-${pad2(endMD0.d)}`
      : `${anchorYear}-${pad2(endMD0.mo)}-${pad2(endMD0.d)}`;

    const anchorDates = buildSeasonDates(anchorStart, anchorEnd);

    // Años históricos (anteriores a campaignYear)
    const histYears: number[] = [];
    for (let i = 1; i <= years; i++) histYears.push(campaignYear - i);

    // Rango global a pedir a NASA:
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
        { error: "Rango global inválido", received: { earliestStartIso, latestEndIso } },
        { status: 400 }
      );
    }

    // ✅ 1 llamada global DAILY (ligera)
    const global = await fetchNasaDailyMinMax({
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

    const tminByDate: Record<string, any> =
      global.json?.properties?.parameter?.T2M_MIN ?? {};
    const tmaxByDate: Record<string, any> =
      global.json?.properties?.parameter?.T2M_MAX ?? {};

    // ✅ Precalculamos HF diaria estimada por día ISO
    const hfByIsoDay = new Map<string, number>();

    for (const key of Object.keys(tminByDate)) {
      // DAILY keys: YYYYMMDD
      if (!/^\d{8}$/.test(key)) continue;

      const y = Number(key.slice(0, 4));
      const mo = Number(key.slice(4, 6));
      const d = Number(key.slice(6, 8));
      const isoDay = `${y}-${pad2(mo)}-${pad2(d)}`;

      const tmin = safeTemp(tminByDate[key]);
      const tmax = safeTemp(tmaxByDate[key]);

      if (tmin === null || tmax === null) continue;

      const hours = hoursInBandSingleSine(tmin, tmax, minTemp, maxTemp);
      hfByIsoDay.set(isoDay, round1(hours));
    }

    function dailyChillHoursForIso(iso: string) {
      const v = hfByIsoDay.get(iso) || 0;
      return Math.max(0, Math.min(24, v));
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

        const daily = dailyChillHoursForIso(isoReal);
        cum = round1(cum + daily);
        cumArr.push(cum);
      }

      histCumByDay.push(cumArr);
    }

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
      return n ? round1(sum / n) : 0;
    });

    const historicP25: number[] = anchorDates.map((_, idx) => {
      const vals = histCumByDay
        .map((arr) => arr[idx])
        .filter((v) => Number.isFinite(v)) as number[];
      vals.sort((a, b) => a - b);
      return round1(quantileSorted(vals, 0.25));
    });

    const historicP75: number[] = anchorDates.map((_, idx) => {
      const vals = histCumByDay
        .map((arr) => arr[idx])
        .filter((v) => Number.isFinite(v)) as number[];
      vals.sort((a, b) => a - b);
      return round1(quantileSorted(vals, 0.75));
    });

    // =========================
    // 2) Campaña seleccionada: acumulado
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

        const daily = dailyChillHoursForIso(isoReal);
        cum = round1(cum + daily);
        campaignCumByAnchorDate.set(anchorIso, cum);
      }
    }

    const campStartIso = `${campaignYear}-${pad2(startMD0.mo)}-${pad2(startMD0.d)}`;
    const campEndIso = crossesYear
      ? `${campaignYear + 1}-${pad2(endMD0.mo)}-${pad2(endMD0.d)}`
      : `${campaignYear}-${pad2(endMD0.mo)}-${pad2(endMD0.d)}`;

    // =========================
    // OUTPUT (igual patrón que GDD histórico)
    // =========================
    const series = anchorDates.map((date, i) => {
      const mo = Number(date.slice(5, 7));
      const d = Number(date.slice(8, 10));
      const isAnchor2000 = Number(date.slice(0, 4)) === anchorYear;
      const realY = isAnchor2000 ? campaignYear : campaignYear + 1;
      const isoCampaign = `${realY}-${pad2(mo)}-${pad2(d)}`;

      const camp = campaignCumByAnchorDate.get(date) ?? null;

      return {
        date, // ancla: "2000-11-01"...
        md: date.slice(5), // "11-01"
        isoCampaign,
        historicAvg: historicAvg[i] ?? null,
        historicP25: historicP25[i] ?? null,
        historicP75: historicP75[i] ?? null,
        campaign: camp,
        current: camp, // alias
      };
    });

    return NextResponse.json({
      meta: {
        source: "NASA_POWER",
        temporal: "daily",
        latitude: lat,
        longitude: lon,
        years,
        campaignYear,
        histYears,
        chillRange: { minTemp, maxTemp },
        season: { startDate: anchorStart, endDate: anchorEnd }, // ancla
        campaignSeason: { startDate: campStartIso, endDate: campEndIso }, // real
        globalFetch: {
          startDate: earliestStartIso,
          endDate: latestEndIso,
        },
        model: "HF_single_sine_daily_minmax",
        note:
          "HF histórico estimado con NASA DAILY (T2M_MIN/T2M_MAX) usando modelo single-sine para calcular horas dentro de [minTemp..maxTemp]. Mucho más estable que HOURLY para rangos largos.",
        nasaUrl: global.url,
      },
      series,
    });
  } catch (error: any) {
    console.error("Error NASA HF historical:", error);
    return NextResponse.json(
      {
        error: "Error calculando histórico NASA (HF)",
        details: String(error?.message ?? error),
      },
      { status: 500 }
    );
  }
}