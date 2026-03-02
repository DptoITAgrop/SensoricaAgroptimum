// app/api/farms/[farmId]/phenology/milestones/route.ts
import { NextResponse } from "next/server";
import {
  getConnection,
  getSensorsForFarm,
  type FarmName,
  farms,
  escapeId,
} from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// --------------------
// Helpers
// --------------------
function pickColumn(columns: string[], candidates: string[]) {
  const lower = columns.map((c) => c.toLowerCase());
  for (const cand of candidates) {
    const idx = lower.findIndex(
      (c) => c === cand.toLowerCase() || c.includes(cand.toLowerCase())
    );
    if (idx >= 0) return columns[idx];
  }
  return null;
}

function isValidISODate(d: string) {
  // YYYY-MM-DD
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

function addDaysISO(dateISO: string, days: number) {
  // dateISO debe ser YYYY-MM-DD
  if (!isValidISODate(dateISO)) {
    throw new Error(`addDaysISO: dateISO inválido: ${dateISO}`);
  }
  const dt = new Date(`${dateISO}T00:00:00.000Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split("T")[0];
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function safeNumber(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// --------------------
// Phenology models (MVP configurable)
// --------------------
type Phase = { key: string; name: string; gddTarget: number };

// ⚠️ IMPORTANTE: estos GDD objetivo son “MVP placeholder”.
// Están para que el sistema funcione YA y se puedan calibrar con campo.
// En cuanto tengáis valores validados para Antequera, se actualizan aquí o en BD.
const PISTACHIO_PHASES: Record<string, Phase[]> = {
  kerman: [
    { key: "fruit_length_done", name: "Fin crecimiento longitud fruto", gddTarget: 650 },
    { key: "kernel_start", name: "Inicio desarrollo semilla (kernel)", gddTarget: 900 },
    { key: "shell_hardening", name: "Endurecimiento cáscara", gddTarget: 1200 },
    { key: "harvest_est", name: "Cosecha estimada", gddTarget: 1800 },
  ],
};

// --------------------
// GET
// --------------------
export async function GET(
  request: Request,
  { params }: { params: Promise<{ farmId: string }> }
) {
  const { searchParams } = new URL(request.url);
  const { farmId } = await params;

  if (!farms.includes(farmId as any)) {
    return NextResponse.json(
      { error: "Finca no válida", farmId, allowedFarms: farms },
      { status: 400 }
    );
  }

  const bloomDate = searchParams.get("bloomDate");
  if (!bloomDate || !isValidISODate(bloomDate)) {
    return NextResponse.json(
      {
        error:
          "bloomDate es obligatorio y debe ser YYYY-MM-DD. Ej: ?bloomDate=2026-04-01",
        received: { bloomDate },
      },
      { status: 400 }
    );
  }

  const sensorId = searchParams.get("sensor") || undefined;
  const cultivar = (searchParams.get("cultivar") || "kerman").toLowerCase();

  // Base típica en tool UCANR: 7.5°C. Si quieres mantener 7.2 como default global, cámbialo aquí.
  const baseTempRaw = searchParams.get("baseTemp");
  const baseTemp = baseTempRaw !== null ? Number(baseTempRaw) : 7.2;

  if (!Number.isFinite(baseTemp)) {
    return NextResponse.json(
      { error: "Parámetro baseTemp inválido", baseTemp: baseTempRaw },
      { status: 400 }
    );
  }

  const horizonDaysRaw = searchParams.get("horizonDays");
  const horizonDays = horizonDaysRaw ? parseInt(horizonDaysRaw, 10) : 14;
  if (!Number.isFinite(horizonDays) || horizonDays <= 0 || horizonDays > 60) {
    return NextResponse.json(
      {
        error: "horizonDays inválido (1..60)",
        received: { horizonDays: horizonDaysRaw },
      },
      { status: 400 }
    );
  }

  const phases: Phase[] = PISTACHIO_PHASES[cultivar] || PISTACHIO_PHASES["kerman"];

  // Para incluir el día completo de hoy, hacemos endExclusive = mañana
  const todayISO = new Date().toISOString().split("T")[0];
  const endExclusive = addDaysISO(todayISO, 1);

  let connection: any;

  try {
    const sensors = sensorId ? [sensorId] : await getSensorsForFarm(farmId as FarmName);
    connection = await getConnection(farmId as FarmName);

    // 1) Serie diaria por sensor
    const perSensorSeries: Array<Array<{ date: string; daily: number }>> = [];
    const perSensorMeta: Array<{ sensor: string; daysWithData: number }> = [];

    for (const sensor of sensors) {
      try {
        const [cols] = await connection.query(`SHOW COLUMNS FROM ${escapeId(sensor)}`);
        const columnNames = (cols as Array<{ Field: string }>).map((c) => c.Field);

        const tempColumn =
          pickColumn(columnNames, ["temperature", "temperatura", "temp"]) || null;

        const dateColumn =
          pickColumn(columnNames, ["datetime", "fecha", "timestamp", "date", "time"]) ||
          null;

        if (!tempColumn || !dateColumn) continue;

        // ✅ FIX: forzar day a 'YYYY-MM-DD' SIEMPRE (evita Date JS / formatos raros)
        const [rows] = await connection.query(
          `
          SELECT DATE_FORMAT(${escapeId(dateColumn)}, '%Y-%m-%d') AS day,
                 MIN(${escapeId(tempColumn)}) AS tmin,
                 MAX(${escapeId(tempColumn)}) AS tmax
          FROM ${escapeId(sensor)}
          WHERE ${escapeId(dateColumn)} >= ?
            AND ${escapeId(dateColumn)} < ?
          GROUP BY DATE_FORMAT(${escapeId(dateColumn)}, '%Y-%m-%d')
          ORDER BY day ASC
        `,
          [bloomDate, endExclusive]
        );

        const daily = (rows as Array<{ day: any; tmin: any; tmax: any }>)
          .map((r) => {
            const day = String(r.day);
            if (!isValidISODate(day)) return null;

            const tmin = safeNumber(r.tmin);
            const tmax = safeNumber(r.tmax);
            if (tmin === null || tmax === null) return null;

            const avg = (tmin + tmax) / 2;
            const gdd = Math.max(0, avg - baseTemp);
            return { date: day, daily: round1(gdd) };
          })
          .filter(Boolean) as Array<{ date: string; daily: number }>;

        if (!daily.length) continue;

        perSensorSeries.push(daily);
        perSensorMeta.push({ sensor, daysWithData: daily.length });
      } catch (err) {
        console.error(`Error processing sensor ${sensor}:`, err);
      }
    }

    if (!perSensorSeries.length) {
      return NextResponse.json(
        {
          farmId,
          error: "No se encontraron sensores/columnas válidas para calcular GDD",
          hint:
            "Comprueba que las tablas tengan columnas datetime + temperature (o temperatura).",
          bloomDate,
          baseTemp,
          sensor: sensorId ?? null,
        },
        { status: 404 }
      );
    }

    // 2) Merge (media diaria entre sensores)
    const merged = new Map<string, { sum: number; count: number }>();
    for (const serie of perSensorSeries) {
      for (const p of serie) {
        const cur = merged.get(p.date) || { sum: 0, count: 0 };
        cur.sum += p.daily;
        cur.count += 1;
        merged.set(p.date, cur);
      }
    }

    const seriesDaily = Array.from(merged.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({
        date,
        daily: round1(v.sum / Math.max(1, v.count)),
      }));

    // 3) Cumulative
    let cum = 0;
    const series = seriesDaily.map((d) => {
      cum = round1(cum + d.daily);
      return { ...d, cumulative: cum };
    });

    const totalGDD = series.length ? series[series.length - 1].cumulative : 0;
    const lastDate = series.length ? series[series.length - 1].date : bloomDate;

    // ✅ Guardia extra (por si algo raro se cuela)
    if (!isValidISODate(lastDate)) {
      throw new Error(`lastDate no es ISO YYYY-MM-DD: ${lastDate}`);
    }

    // 4) Avg GDD recent window for projections
    const recent = series.slice(Math.max(0, series.length - horizonDays));
    const avgRecent =
      recent.length > 0
        ? round1(recent.reduce((s, x) => s + x.daily, 0) / recent.length)
        : 0;

    // 5) Milestones
    const milestones = phases.map((ph) => {
      const hit = series.find((p) => p.cumulative >= ph.gddTarget) || null;

      if (hit) {
        return {
          ...ph,
          reached: true,
          date: hit.date,
          gddAtDate: hit.cumulative,
          remainingGDD: 0,
          projectedDate: null as string | null,
        };
      }

      const remaining = round1(Math.max(0, ph.gddTarget - totalGDD));

      // Proyección simple: remaining / avgRecent
      let projectedDate: string | null = null;
      if (avgRecent > 0 && remaining > 0) {
        const daysNeeded = Math.ceil(remaining / avgRecent);
        projectedDate = addDaysISO(lastDate, daysNeeded);
      }

      return {
        ...ph,
        reached: false,
        date: null as string | null,
        gddAtDate: null as number | null,
        remainingGDD: remaining,
        projectedDate,
      };
    });

    // 6) Current / next phase
    const reachedCount = milestones.filter((m) => m.reached).length;
    const currentPhaseIndex = Math.max(0, Math.min(reachedCount, phases.length) - 1);

    const currentPhase =
      reachedCount === 0
        ? null
        : {
            key: phases[currentPhaseIndex].key,
            name: phases[currentPhaseIndex].name,
            gddTarget: phases[currentPhaseIndex].gddTarget,
          };

    const nextPhase =
      reachedCount < phases.length
        ? {
            key: phases[reachedCount].key,
            name: phases[reachedCount].name,
            gddTarget: phases[reachedCount].gddTarget,
          }
        : null;

    // % progreso hacia la siguiente fase
    let progressToNextPct: number | null = null;
    if (nextPhase) {
      const prevTarget = reachedCount > 0 ? phases[reachedCount - 1].gddTarget : 0;
      const span = Math.max(1, nextPhase.gddTarget - prevTarget);
      const within = Math.min(span, Math.max(0, totalGDD - prevTarget));
      progressToNextPct = Math.round((within / span) * 100);
    }

    return NextResponse.json({
      farmId,
      sensor: sensorId ?? null,
      bloomDate,
      baseTemp,
      cultivar,
      phases,
      series: { daily: series },
      summary: {
        totalGDD,
        lastDate,
        avgRecentDailyGDD: avgRecent,
        horizonDays,
        sensorCount: perSensorMeta.length,
        sensors: perSensorMeta,
      },
      phenology: {
        currentPhase,
        nextPhase,
        progressToNextPct,
        milestones,
      },
    });
  } catch (error: any) {
    console.error("Error calculating phenology milestones:", error);
    return NextResponse.json(
      {
        error: "Error al calcular hitos fenológicos",
        details: String(error?.message ?? error),
      },
      { status: 500 }
    );
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch {}
    }
  }
}