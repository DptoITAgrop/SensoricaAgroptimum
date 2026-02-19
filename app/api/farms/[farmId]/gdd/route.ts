import { NextResponse } from "next/server";
import {
  getConnection,
  getSensorsForFarm,
  getGDDPeriod,
  type FarmName,
  farms,
  escapeId,
} from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  const dt = new Date(`${dateISO}T00:00:00.000Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split("T")[0];
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ farmId: string }> }
) {
  const { searchParams } = new URL(request.url);

  const year = searchParams.get("year")
    ? parseInt(searchParams.get("year")!, 10)
    : undefined;

  const sensorId = searchParams.get("sensor") || undefined;

  // ✅ Base por defecto: 7.2 ºC (según email)
  //    Si viene por query, lo respetamos.
  const baseTempRaw = searchParams.get("baseTemp");
  const baseTemp = baseTempRaw !== null ? Number(baseTempRaw) : 7.2;

  if (!Number.isFinite(baseTemp)) {
    return NextResponse.json(
      { error: "Parámetro baseTemp inválido", baseTemp: baseTempRaw },
      { status: 400 }
    );
  }

  const { farmId } = await params;
  if (!farms.includes(farmId as any)) {
    return NextResponse.json(
      { error: "Finca no válida", farmId, allowedFarms: farms },
      { status: 400 }
    );
  }

  /**
   * ✅ Soporte de rango:
   * - por defecto: getGDDPeriod(year)
   * - custom: ?range=custom&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
   *   Importante: endDate inclusivo -> usamos endExclusive = endDate + 1 día
   */
  const range = searchParams.get("range") || "campaign";

  let startDate: string;
  let endDate: string;

  if (range === "custom") {
    const start = searchParams.get("startDate");
    const end = searchParams.get("endDate");

    if (!start || !end || !isValidISODate(start) || !isValidISODate(end)) {
      return NextResponse.json(
        {
          error:
            "Rango custom inválido. Usa ?range=custom&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD",
          received: { startDate: start, endDate: end },
        },
        { status: 400 }
      );
    }

    startDate = start;
    endDate = end;
  } else {
    const period = getGDDPeriod(year);
    startDate = period.start.toISOString().split("T")[0];
    endDate = period.end.toISOString().split("T")[0];
  }

  // ✅ endDate inclusivo: calculamos endExclusive = endDate + 1 día
  const endExclusive = addDaysISO(endDate, 1);

  let connection: any;

  try {
    const sensors = sensorId
      ? [sensorId]
      : await getSensorsForFarm(farmId as FarmName);

    connection = await getConnection(farmId as FarmName);

    const perSensorSeries: Array<Array<{ date: string; daily: number }>> = [];
    const results: Array<{ sensor: string; gdd: number; daysWithData: number }> =
      [];

    for (const sensor of sensors) {
      try {
        const [cols] = await connection.query(
          `SHOW COLUMNS FROM ${escapeId(sensor)}`
        );
        const columnNames = (cols as Array<{ Field: string }>).map(
          (c) => c.Field
        );

        const tempColumn =
          pickColumn(columnNames, ["temperature", "temperatura", "temp"]) || null;

        const dateColumn =
          pickColumn(columnNames, [
            "datetime",
            "fecha",
            "timestamp",
            "date",
            "time",
          ]) || null;

        if (!tempColumn || !dateColumn) continue;

        /**
         * ✅ FIX CLAVE:
         * En vez de BETWEEN startDate AND endDate (que suele excluir horas del último día),
         * usamos [startDate 00:00, endExclusive 00:00)
         */
        const [rows] = await connection.query(
          `
          SELECT DATE(${escapeId(dateColumn)}) AS day,
                 MIN(${escapeId(tempColumn)}) AS tmin,
                 MAX(${escapeId(tempColumn)}) AS tmax
          FROM ${escapeId(sensor)}
          WHERE ${escapeId(dateColumn)} >= ?
            AND ${escapeId(dateColumn)} < ?
          GROUP BY DATE(${escapeId(dateColumn)})
          ORDER BY day ASC
        `,
          [startDate, endExclusive]
        );

        const daily = (
          rows as Array<{ day: string; tmin: number; tmax: number }>
        ).map((r) => {
          const avg = (Number(r.tmin) + Number(r.tmax)) / 2;
          const d = Math.max(0, avg - baseTemp);
          return { date: String(r.day), daily: Math.round(d * 10) / 10 };
        });

        perSensorSeries.push(daily);

        const total = daily.reduce((s, d) => s + d.daily, 0);
        results.push({
          sensor,
          gdd: Math.round(total * 10) / 10,
          daysWithData: daily.length,
        });
      } catch (err) {
        console.error(`Error processing sensor ${sensor}:`, err);
      }
    }

    // merge series (media diaria entre sensores)
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
        daily: Math.round((v.sum / Math.max(1, v.count)) * 10) / 10,
      }));

    let cum = 0;
    const series = seriesDaily.map((d) => {
      cum = Math.round((cum + d.daily) * 10) / 10;
      return { ...d, cumulative: cum };
    });

    const totalGDD = series.length ? series[series.length - 1].cumulative : 0;

    const avgGDD =
      results.length > 0
        ? Math.round(
            (results.reduce((s, r) => s + r.gdd, 0) / results.length) * 10
          ) / 10
        : 0;

    // ✅ thresholds pedidos
    const thresholds = { gdd450: 450, gdd900: 900 };

    // ✅ milestones: primera fecha en la que cumulative >= threshold
    const hit450 = series.find((p) => p.cumulative >= thresholds.gdd450) || null;
    const hit900 = series.find((p) => p.cumulative >= thresholds.gdd900) || null;

    const milestones = {
      gdd450: hit450 ? { reached: true, date: hit450.date } : { reached: false, date: null },
      gdd900: hit900 ? { reached: true, date: hit900.date } : { reached: false, date: null },
    };

    // ✅ today: mejor “último punto disponible” que buscar el día real (suele no existir)
    const todayDate = new Date().toISOString().split("T")[0];
    const todayPoint =
      series.find((x) => x.date === todayDate) || (series.length ? series[series.length - 1] : null);

    const window450_900 =
      totalGDD >= thresholds.gdd450 && totalGDD < thresholds.gdd900;

    return NextResponse.json({
      farmId,
      period: { start: startDate, end: endDate },
      range,
      baseTemp,
      thresholds,
      milestones,
      sensors: results.map((r) => ({
        sensor: r.sensor,
        gdd: r.gdd,
        period: { start: startDate, end: endDate },
        daysWithData: r.daysWithData,
      })),
      series: { daily: series },
      today: todayPoint
        ? {
            date: todayPoint.date,
            gdd: todayPoint.daily,
            cumulative: todayPoint.cumulative,
          }
        : null,
      summary: {
        totalGDD,
        avgGDD,
        sensorCount: results.length,
        window450_900,
        remainingTo450: Math.max(0, Math.round((thresholds.gdd450 - totalGDD) * 10) / 10),
        remainingTo900: Math.max(0, Math.round((thresholds.gdd900 - totalGDD) * 10) / 10),
      },
    });
  } catch (error: any) {
    console.error("Error calculating GDD:", error);
    return NextResponse.json(
      { error: "Error al calcular GDD", details: String(error?.message ?? error) },
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
