// app/api/farms/[farmId]/chill-hours/route.ts
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

type Mode = "delta" | "fixed";

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

function ymd(d: Date) {
  return d.toISOString().split("T")[0];
}

function clampEndToToday(endYmd: string) {
  const today = ymd(new Date());
  return endYmd > today ? today : endYmd;
}

/**
 * Sensores de suelo/EC: heurística por columnas.
 */
function isSoilSensorByColumns(columnNames: string[]) {
  const lower = columnNames.map((c) => c.toLowerCase());
  const soilSignals = [
    "conductivity",
    "conductividad",
    "ec",
    "ece",
    "soil",
    "soil_moisture",
    "soilmoisture",
    "vwc",
    "smtc",
    "moisture",
    "humedad_suelo",
    "water_content",
  ];
  return soilSignals.some((sig) => lower.some((c) => c === sig || c.includes(sig)));
}

/**
 * ✅ EXCEPCIONES:
 * ENV (CSV):
 *   HF_ALLOWED_SOIL_SENSORS="Parcela 4.2,Otro Sensor"
 */
function getAllowedSoilSensorsAllowlist(): string[] {
  const raw = process.env.HF_ALLOWED_SOIL_SENSORS;
  if (raw && raw.trim()) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return ["Parcela 4.2"]; // default
}

function isAllowedSoilSensor(sensorName: string) {
  const allowlist = getAllowedSoilSensorsAllowlist();
  const s = String(sensorName).trim().toLowerCase();
  return allowlist.some((a) => a.trim().toLowerCase() === s);
}

/**
 * Expresión SQL para fecha:
 * - Si parece epoch en segundos/ms: FROM_UNIXTIME
 * - Si es DATETIME: col
 *
 * Nota: FROM_UNIXTIME depende del time_zone de la sesión MySQL.
 * Si tu DATETIME está en hora local, y el server también, será consistente.
 * Si guardas UTC en DATETIME pero el server está en local, habría que ajustar.
 */
function buildDateExpr(dateColEscaped: string, dateColName: string) {
  const n = dateColName.toLowerCase();
  const looksEpochByName =
    n === "timestamp" || n.includes("epoch") || n.includes("unix");

  if (looksEpochByName) {
    return `CASE
      WHEN ${dateColEscaped} > 1000000000000 THEN FROM_UNIXTIME(${dateColEscaped}/1000)
      WHEN ${dateColEscaped} > 1000000000 THEN FROM_UNIXTIME(${dateColEscaped})
      ELSE ${dateColEscaped}
    END`;
  }

  return `${dateColEscaped}`;
}

/**
 * ✅ HF por tiempo real entre lecturas (DELTA):
 * - Sumamos SOLO el delta de tiempo real (segundos) cuando T está en [0, 7.2].
 * - No se cuentan valores negativos.
 * - Capamos el delta máximo para no inflar por gaps.
 * - Si delta es NULL (primera fila), cuenta 0.
 *
 * Además, contabilizamos:
 * - cappedGaps: número de veces que el delta supera el cap (para auditoría)
 * - countedPoints: número de intervalos que aportan >0 segundos (para auditoría)
 */
function deltaSecondsContributionSQL(maxGapSeconds: number) {
  return `
    CASE
      WHEN temp >= 0 AND temp <= 7.2 THEN
        LEAST(GREATEST(COALESCE(delta_s, 0), 0), ${maxGapSeconds})
      ELSE 0
    END
  `;
}

function wasCappedSQL(maxGapSeconds: number) {
  return `
    CASE
      WHEN temp >= 0 AND temp <= 7.2 AND COALESCE(delta_s, 0) > ${maxGapSeconds} THEN 1
      ELSE 0
    END
  `;
}

function countedIntervalSQL() {
  return `
    CASE
      WHEN temp >= 0 AND temp <= 7.2 AND COALESCE(delta_s, 0) > 0 THEN 1
      ELSE 0
    END
  `;
}

/**
 * ✅ HF por muestras fijas (FIXED):
 * - Cada fila con T en [0, 7.2] suma hoursPerSample.
 * - Útil para comparar si “asumimos” frecuencia fija (ej 10 min).
 */
function fixedContributionSQL(hoursPerSample: number) {
  // hoursPerSample se inyecta como literal seguro (número) desde TS
  return `
    CASE
      WHEN temp >= 0 AND temp <= 7.2 THEN ${hoursPerSample}
      ELSE 0
    END
  `;
}

function safeInt(raw: string | null, fallback: number, min: number, max: number) {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function safeMode(raw: string | null): Mode {
  const v = (raw || "").toLowerCase();
  return v === "fixed" ? "fixed" : "delta";
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function safeSampleMinutes(raw: string | null) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 10;
  return Math.max(1, Math.min(60, Math.trunc(n)));
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

  /**
   * ✅ range:
   * Por defecto CAMPAÑA COMPLETA (1 Nov -> 1 Mar).
   * startDate/endDate solo si ?range=custom
   */
  const rangeMode = (searchParams.get("range") || "campaign").toLowerCase();
  const allowCustomRange = rangeMode === "custom";

  const startDateParam = allowCustomRange ? searchParams.get("startDate") || undefined : undefined;
  const endDateParam = allowCustomRange ? searchParams.get("endDate") || undefined : undefined;

  /**
   * ✅ Modo:
   * - delta (default): suma deltas reales entre lecturas
   * - fixed: suma por muestra (requiere sampleMinutes, default 10)
   */
  const mode: Mode = safeMode(searchParams.get("mode"));

  /**
   * ✅ cap del hueco máximo entre lecturas (minutos) para delta
   * default 60 min
   */
  const maxGapMinutes = safeInt(searchParams.get("maxGapMinutes"), 60, 5, 240);
  const maxGapSeconds = maxGapMinutes * 60;

  /**
   * ✅ fixed sampling (si mode=fixed)
   */
  const sampleMinutes = safeSampleMinutes(searchParams.get("sampleMinutes"));
  const hoursPerSample = sampleMinutes / 60;

  const { farmId } = await params;
  if (!farms.includes(farmId as any)) {
    return NextResponse.json(
      { error: "Finca no válida", farmId, allowedFarms: farms },
      { status: 400 }
    );
  }

  // Campaña: 1 Nov -> 1 Mar
  const period = getChillHoursPeriod(year);
  const campaignStart = ymd(period.start);
  const campaignEnd = ymd(period.end);
  const campaignEndClamped = clampEndToToday(campaignEnd);

  // Si custom, clamp dentro de campaña; si no, campaña completa
  const startDate = allowCustomRange
    ? startDateParam && startDateParam >= campaignStart
      ? startDateParam
      : campaignStart
    : campaignStart;

  const endDate = allowCustomRange
    ? endDateParam && endDateParam <= campaignEndClamped
      ? endDateParam
      : campaignEndClamped
    : campaignEndClamped;

  /**
   * ✅ Rango [start 00:00:00, end+1día 00:00:00)
   */
  const rangeStart = `${startDate} 00:00:00`;

  let connection: any;

  try {
    const sensors = sensorId ? [sensorId] : await getSensorsForFarm(farmId as FarmName);
    connection = await getConnection(farmId as FarmName);

    const perSensorSeries: Array<Array<{ date: string; dailyUnits: number }>> = [];

    const results: Array<{
      sensor: string;
      chillHours: number;
      period: { start: string; end: string };
      dataPoints: number;

      // auditoría
      countedPoints: number;
      cappedGaps?: number;   // solo delta
      totalSeconds?: number; // solo delta

      skippedReason?: string;
      isSoilSensor?: boolean;
      includedByException?: boolean;

      mode: Mode;
      maxGapMinutes?: number;
      sampleMinutes?: number;
    }> = [];

    for (const sensor of sensors) {
      try {
        const tableEscaped = escapeId(sensor);

        const [cols] = await connection.query(`SHOW COLUMNS FROM ${tableEscaped}`);
        const columnNames = (cols as Array<{ Field: string }>).map((c) => c.Field);

        const soilByCols = isSoilSensorByColumns(columnNames);
        const allowedSoil = soilByCols && isAllowedSoilSensor(sensor);

        // ✅ excluir suelo/EC salvo allowlist
        if (soilByCols && !allowedSoil) {
          results.push({
            sensor,
            chillHours: 0,
            period: { start: campaignStart, end: campaignEndClamped },
            dataPoints: 0,
            countedPoints: 0,
            skippedReason: "sensor_soil_or_conductivity",
            isSoilSensor: true,
            includedByException: false,
            mode,
            maxGapMinutes,
            sampleMinutes,
          });
          continue;
        }

        const tempColumn =
          pickColumn(columnNames, ["temperature", "temperatura", "temp"]) || null;

        const dateColumn =
          pickColumn(columnNames, ["datetime", "fecha", "timestamp", "date", "time"]) || null;

        if (!tempColumn || !dateColumn) {
          results.push({
            sensor,
            chillHours: 0,
            period: { start: campaignStart, end: campaignEndClamped },
            dataPoints: 0,
            countedPoints: 0,
            skippedReason: "missing_temp_or_date",
            isSoilSensor: soilByCols,
            includedByException: allowedSoil,
            mode,
            maxGapMinutes,
            sampleMinutes,
          });
          continue;
        }

        const tempColEscaped = escapeId(tempColumn);
        const dateColEscaped = escapeId(dateColumn);
        const dateExpr = buildDateExpr(dateColEscaped, dateColumn);

        /**
         * ✅ Importante:
         * Calculamos dt una vez y luego usamos LAG(dt) para evitar recalcular el CASE.
         */
        let rows: any[] = [];

        if (mode === "fixed") {
          // FIXED: cada fila en rango suma hoursPerSample si temp ∈ [0..7.2]
          const [q] = await connection.query(
            `
            SELECT
              DATE(dt) AS day,
              SUM(${fixedContributionSQL(hoursPerSample)}) AS hours,
              SUM(CASE WHEN temp >= 0 AND temp <= 7.2 THEN 1 ELSE 0 END) AS countedPoints,
              COUNT(*) AS n
            FROM (
              SELECT
                ${dateExpr} AS dt,
                ${tempColEscaped} AS temp
              FROM ${tableEscaped}
              WHERE ${dateExpr} >= ? AND ${dateExpr} < DATE_ADD(?, INTERVAL 1 DAY)
            ) t
            GROUP BY DATE(dt)
            ORDER BY day ASC
            `,
            [rangeStart, endDate]
          );
          rows = q as any[];
        } else {
          // DELTA: suma deltas reales capados
          const [q] = await connection.query(
            `
            SELECT
              DATE(dt) AS day,
              SUM(${deltaSecondsContributionSQL(maxGapSeconds)}) AS totalSeconds,
              SUM(${countedIntervalSQL()}) AS countedPoints,
              SUM(${wasCappedSQL(maxGapSeconds)}) AS cappedGaps,
              COUNT(*) AS n
            FROM (
              SELECT
                dt,
                temp,
                TIMESTAMPDIFF(
                  SECOND,
                  LAG(dt) OVER (ORDER BY dt),
                  dt
                ) AS delta_s
              FROM (
                SELECT
                  ${dateExpr} AS dt,
                  ${tempColEscaped} AS temp
                FROM ${tableEscaped}
                WHERE ${dateExpr} >= ? AND ${dateExpr} < DATE_ADD(?, INTERVAL 1 DAY)
              ) base
            ) t
            GROUP BY DATE(dt)
            ORDER BY day ASC
            `,
            [rangeStart, endDate]
          );
          rows = q as any[];
        }

        const daily = rows.map((r: any) => {
          const day = String(r.day);
          let hours = 0;

          if (mode === "fixed") {
            const raw = Number(r.hours);
            hours = Number.isFinite(raw) ? raw : 0;
          } else {
            const sec = Number(r.totalSeconds);
            const safeSec = Number.isFinite(sec) ? sec : 0;
            hours = safeSec / 3600;
          }

          // seguridad: 0..24 por día
          const safe = Math.max(0, Math.min(24, hours));
          return { date: day, dailyUnits: round1(safe) };
        });

        perSensorSeries.push(daily);

        const totalHours = round1(daily.reduce((s, d) => s + d.dailyUnits, 0));

        const [totalRows] = await connection.query(
          `
          SELECT COUNT(*) as total
          FROM ${tableEscaped}
          WHERE ${dateExpr} >= ? AND ${dateExpr} < DATE_ADD(?, INTERVAL 1 DAY)
          `,
          [rangeStart, endDate]
        );

        const totalDataPoints = (totalRows as Array<{ total: number }>)[0]?.total || 0;

        // auditoría total por sensor
        const countedPoints = rows.reduce((acc: number, r: any) => acc + (Number(r.countedPoints) || 0), 0);
        const cappedGaps = mode === "delta"
          ? rows.reduce((acc: number, r: any) => acc + (Number(r.cappedGaps) || 0), 0)
          : undefined;

        const totalSeconds = mode === "delta"
          ? rows.reduce((acc: number, r: any) => acc + (Number(r.totalSeconds) || 0), 0)
          : undefined;

        results.push({
          sensor,
          chillHours: totalHours,
          period: { start: campaignStart, end: campaignEndClamped },
          dataPoints: totalDataPoints,

          countedPoints,
          cappedGaps,
          totalSeconds,

          isSoilSensor: soilByCols,
          includedByException: allowedSoil,
          mode,
          maxGapMinutes,
          sampleMinutes,
        });
      } catch (err) {
        console.error(`Error processing sensor ${sensor}:`, err);
        results.push({
          sensor,
          chillHours: 0,
          period: { start: campaignStart, end: campaignEndClamped },
          dataPoints: 0,
          countedPoints: 0,
          skippedReason: "error_processing_sensor",
          mode,
          maxGapMinutes,
          sampleMinutes,
        });
      }
    }

    // ---- merge series (TOTAL FINCA)
    const mergedSum = new Map<string, { sum: number; count: number }>();

    for (const serie of perSensorSeries) {
      for (const p of serie) {
        const cur = mergedSum.get(p.date) || { sum: 0, count: 0 };
        cur.sum += p.dailyUnits;
        cur.count += 1;
        mergedSum.set(p.date, cur);
      }
    }

    const seriesDailySum = Array.from(mergedSum.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({
        date,
        dailyUnits: round1(v.sum),
      }));

    let cumSum = 0;
    const seriesSum = seriesDailySum.map((d) => {
      cumSum = round1(cumSum + d.dailyUnits);
      return { ...d, cumulative: cumSum };
    });

    const totalChillHours = seriesSum.length ? seriesSum[seriesSum.length - 1].cumulative : 0;

    const validSensors = results.filter((r) => !r.skippedReason && Number.isFinite(r.chillHours));

    const avgChillHours =
      validSensors.length > 0
        ? round1(validSensors.reduce((s, r) => s + (r.chillHours || 0), 0) / validSensors.length)
        : 0;

    return NextResponse.json({
      farmId,
      period: { start: campaignStart, end: campaignEndClamped },
      queryRange: { start: startDate, end: endDate },
      sensors: results,

      // ✅ TOTAL FINCA (suma de diarios)
      series: { daily: seriesSum },

      summary: {
        totalChillHours,
        avgChillHours,
        sensorCount: validSensors.length,
      },

      sampling: {
        mode,
        // delta
        maxGapMinutes: mode === "delta" ? maxGapMinutes : undefined,
        // fixed
        sampleMinutes: mode === "fixed" ? sampleMinutes : undefined,
        hoursPerSample: mode === "fixed" ? hoursPerSample : undefined,
        note:
          mode === "delta"
            ? "HF suma deltas reales entre lecturas cuando T∈[0,7.2]. Primer punto delta=0. Deltas capados para evitar inflado por gaps."
            : "HF suma por muestra fija: cada fila con T∈[0,7.2] suma sampleMinutes/60 horas. Útil para comparar si se asume frecuencia fija.",
      },

      model: mode === "delta" ? "HF_0_7_2_delta" : "HF_0_7_2_fixed",
      rules: {
        excluded: "soil_or_conductivity",
        allowedSoilSensors: getAllowedSoilSensorsAllowlist(),
        window: "campaign_1_nov_to_1_mar",
        clampToToday: true,
        rangeMode: allowCustomRange ? "custom" : "campaign",
        dateFilter: "[start 00:00:00, end+1day 00:00:00)",
        ...(mode === "delta" ? { deltaCap: `cap_delta<=${maxGapMinutes}min` } : {}),
      },
    });
  } catch (error: any) {
    console.error("Error calculating chill hours (HF 0..7.2):", error);
    return NextResponse.json(
      {
        error: "Error al calcular Horas Frío (0..7.2)",
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
