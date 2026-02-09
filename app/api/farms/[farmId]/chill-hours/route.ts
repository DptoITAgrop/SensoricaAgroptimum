import { NextResponse } from "next/server";
import {
  getConnection,
  getSensorsForFarm,
  getChillHoursPeriod,
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

/**
 * Utah units por "lectura" (asumiendo lectura equidistante).
 * Luego se multiplica por (sampleMinutes/60) para aproximar a horas/unidades por muestra.
 */
function utahUnitsSQL(tempExpr: string) {
  return `
    CASE
      WHEN ${tempExpr} < 1.4 THEN 0
      WHEN ${tempExpr} < 2.4 THEN 0.5
      WHEN ${tempExpr} < 9.1 THEN 1
      WHEN ${tempExpr} < 12.4 THEN 0.5
      WHEN ${tempExpr} < 15.9 THEN 0
      WHEN ${tempExpr} < 18.0 THEN -0.5
      ELSE -1
    END
  `;
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

  const sampleMinutes = searchParams.get("sampleMinutes")
    ? Math.max(1, Number(searchParams.get("sampleMinutes")))
    : 10;

  // ✅ NUEVO: por defecto NO dejamos negativos (para que "horas frío" no sea absurdo)
  // Si algún día quieres ver Utah “real”, podrás llamar con ?allowNegative=1
  const allowNegative =
    searchParams.get("allowNegative") === "1" ||
    searchParams.get("allowNegative") === "true";

  const { farmId } = await params;
  if (!farms.includes(farmId as any)) {
    return NextResponse.json(
      { error: "Finca no válida", farmId, allowedFarms: farms },
      { status: 400 }
    );
  }

  const period = getChillHoursPeriod(year);
  const startDate = period.start.toISOString().split("T")[0];
  const endDate = period.end.toISOString().split("T")[0];

  const hoursPerSample = sampleMinutes / 60;

  let connection: any;

  try {
    const sensors = sensorId
      ? [sensorId]
      : await getSensorsForFarm(farmId as FarmName);

    connection = await getConnection(farmId as FarmName);

    const perSensorSeries: Array<Array<{ date: string; dailyUnits: number }>> = [];

    const results: Array<{
      sensor: string;
      chillUnits: number;
      period: { start: string; end: string };
      dataPoints: number;
    }> = [];

    for (const sensor of sensors) {
      try {
        const [cols] = await connection.query(
          `SHOW COLUMNS FROM ${escapeId(sensor)}`
        );
        const columnNames = (cols as Array<{ Field: string }>).map((c) => c.Field);

        const tempColumn =
          pickColumn(columnNames, ["temperature", "temperatura", "temp"]) || null;
        const dateColumn =
          pickColumn(columnNames, ["datetime", "fecha", "timestamp", "date", "time"]) ||
          null;

        if (!tempColumn || !dateColumn) continue;

        const tempExpr = `${escapeId(tempColumn)}`;
        const dateExpr = `${escapeId(dateColumn)}`;

        const [rows] = await connection.query(
          `
          SELECT DATE(${dateExpr}) AS day,
                 SUM((${utahUnitsSQL(tempExpr)}) * ?) AS units,
                 COUNT(*) AS n
          FROM ${escapeId(sensor)}
          WHERE ${dateExpr} BETWEEN ? AND ?
          GROUP BY DATE(${dateExpr})
          ORDER BY day ASC
        `,
          [hoursPerSample, startDate, endDate]
        );

        // ✅ clamp a 0 si no permitimos negativos
        const daily = (rows as Array<{ day: string; units: number; n: number }>).map(
          (r) => {
            const raw = Math.round(Number(r.units) * 10) / 10;
            const safe = allowNegative ? raw : Math.max(0, raw);
            return {
              date: String(r.day),
              dailyUnits: safe,
            };
          }
        );

        perSensorSeries.push(daily);

        const totalUnits = daily.reduce((s, d) => s + d.dailyUnits, 0);

        const [totalRows] = await connection.query(
          `SELECT COUNT(*) as total
           FROM ${escapeId(sensor)}
           WHERE ${escapeId(dateColumn)} BETWEEN ? AND ?`,
          [startDate, endDate]
        );

        results.push({
          sensor,
          chillUnits: Math.round(totalUnits * 10) / 10,
          period: { start: startDate, end: endDate },
          dataPoints: (totalRows as Array<{ total: number }>)[0]?.total || 0,
        });
      } catch (err) {
        console.error(`Error processing sensor ${sensor}:`, err);
      }
    }

    // ---- merge series (media por día si hay varios sensores)
    const merged = new Map<string, { sum: number; count: number }>();

    for (const serie of perSensorSeries) {
      for (const p of serie) {
        const key = p.date;
        const cur = merged.get(key) || { sum: 0, count: 0 };
        cur.sum += p.dailyUnits;
        cur.count += 1;
        merged.set(key, cur);
      }
    }

    const seriesDaily = Array.from(merged.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({
        date,
        dailyUnits: Math.round((v.sum / Math.max(1, v.count)) * 10) / 10,
      }));

    // ✅ acumulado nunca baja (ya que dailyUnits ya está clamped si allowNegative=false)
    let cum = 0;
    const series = seriesDaily.map((d) => {
      cum = Math.round((cum + d.dailyUnits) * 10) / 10;
      return { ...d, cumulative: cum };
    });

    const totalChillUnits = series.length ? series[series.length - 1].cumulative : 0;

    const avgChillUnits =
      results.length > 0
        ? Math.round(
            (results.reduce((s, r) => s + (r.chillUnits || 0), 0) / results.length) * 10
          ) / 10
        : 0;

    const todayDate = new Date().toISOString().split("T")[0];
    const todayPoint = series.find((x) => x.date === todayDate);

    return NextResponse.json({
      farmId,
      period: { start: startDate, end: endDate },
      sensors: results.map((r) => ({
        sensor: r.sensor,
        chillHours: r.chillUnits,
        chillUnits: r.chillUnits,
        period: r.period,
        dataPoints: r.dataPoints,
      })),
      series: { daily: series },
      today: todayPoint ? { date: todayPoint.date, units: todayPoint.dailyUnits } : null,
      summary: {
        totalChillUnits,
        avgChillUnits,
        sensorCount: results.length,
        totalChillHours: totalChillUnits,
        avgChillHours: avgChillUnits,
      },
      sampling: { sampleMinutes, hoursPerSample },
      model: "UTAH",
      allowNegative,
    });
  } catch (error: any) {
    console.error("Error calculating chill hours (UTAH):", error);
    return NextResponse.json(
      { error: "Error al calcular HF (UTAH)", details: String(error?.message ?? error) },
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
