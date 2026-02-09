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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ farmId: string }> }
) {
  const { searchParams } = new URL(request.url);

  const year = searchParams.get("year")
    ? parseInt(searchParams.get("year")!, 10)
    : undefined;

  const sensorId = searchParams.get("sensor") || undefined;

  // ✅ SIEMPRE base 7 por defecto (y si viene param, lo respetamos)
  const baseTemp = searchParams.get("baseTemp")
    ? Number(searchParams.get("baseTemp"))
    : 7;

  const { farmId } = await params;
  if (!farms.includes(farmId as any)) {
    return NextResponse.json(
      { error: "Finca no válida", farmId, allowedFarms: farms },
      { status: 400 }
    );
  }

  const period = getGDDPeriod(year);
  const startDate = period.start.toISOString().split("T")[0];
  const endDate = period.end.toISOString().split("T")[0];

  let connection: any;

  try {
    const sensors = sensorId
      ? [sensorId]
      : await getSensorsForFarm(farmId as FarmName);

    connection = await getConnection(farmId as FarmName);

    const perSensorSeries: Array<Array<{ date: string; daily: number }>> = [];
    const results: Array<{ sensor: string; gdd: number; daysWithData: number }> = [];

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

        // GDD diario = max(0, ((tmin+tmax)/2 - base))
        const [rows] = await connection.query(
          `
          SELECT DATE(${escapeId(dateColumn)}) AS day,
                 MIN(${escapeId(tempColumn)}) AS tmin,
                 MAX(${escapeId(tempColumn)}) AS tmax
          FROM ${escapeId(sensor)}
          WHERE ${escapeId(dateColumn)} BETWEEN ? AND ?
          GROUP BY DATE(${escapeId(dateColumn)})
          ORDER BY day ASC
        `,
          [startDate, endDate]
        );

        const daily = (rows as Array<{ day: string; tmin: number; tmax: number }>).map(
          (r) => {
            const avg = (Number(r.tmin) + Number(r.tmax)) / 2;
            const d = Math.max(0, avg - baseTemp);
            return { date: String(r.day), daily: Math.round(d * 10) / 10 };
          }
        );

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

    // merge series (media diaria)
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

    const todayDate = new Date().toISOString().split("T")[0];
    const todayPoint = series.find((x) => x.date === todayDate);

    return NextResponse.json({
      farmId,
      period: { start: startDate, end: endDate },
      baseTemp,
      sensors: results.map((r) => ({
        sensor: r.sensor,
        gdd: r.gdd,
        period: { start: startDate, end: endDate },
        daysWithData: r.daysWithData,
      })),
      series: { daily: series },
      today: todayPoint ? { date: todayPoint.date, gdd: todayPoint.daily } : null,
      summary: {
        totalGDD,
        avgGDD,
        sensorCount: results.length,
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
