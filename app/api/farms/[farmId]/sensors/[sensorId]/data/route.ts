import { NextResponse } from "next/server";
import { getConnection, type FarmName, escapeId } from "@/lib/db";

type RouteParams = { farmId: string; sensorId: string };

function normalizeOrder(value: string | null): "ASC" | "DESC" {
  const v = (value || "").toLowerCase();
  return v === "desc" ? "DESC" : "ASC";
}

function normalizeLimit(value: string | null): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 2000;
  return Math.min(Math.floor(n), 10_000);
}

function pickDateColumn(columnNames: string[]): string | null {
  // Prioridad: tu caso real
  const priority = ["datetime", "timestamp", "date", "fecha", "time"];
  for (const p of priority) {
    const found = columnNames.find((c) => c.toLowerCase() === p);
    if (found) return found;
  }

  // Heurística general
  const found = columnNames.find((col) => {
    const c = col.toLowerCase();
    return (
      c.includes("datetime") ||
      c.includes("fecha") ||
      c.includes("date") ||
      c.includes("timestamp") ||
      c.includes("time")
    );
  });

  return found || null;
}

function parseMetrics(
  columnNames: string[],
  metric: string | null,
  metricsCsv: string | null
): string[] {
  // metrics=a,b,c tiene prioridad
  if (metricsCsv && metricsCsv.trim()) {
    const wanted = metricsCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const existing = wanted.filter((w) =>
      columnNames.some((c) => c.toLowerCase() === w.toLowerCase())
    );

    return existing.length ? existing : [];
  }

  // Compat: metric=temperature
  const m = (metric || "").trim();
  if (!m) return [];

  const found = columnNames.find((c) => c.toLowerCase() === m.toLowerCase());
  return found ? [found] : [];
}

/**
 * Sensores de suelo/EC: heurística por columnas.
 * Si tiene señales típicas de suelo, lo marcamos como "soil".
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
 * Busca una columna existente por candidatos (case-insensitive, exact o includes)
 */
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
  { params }: { params: Promise<RouteParams> | RouteParams }
) {
  const { searchParams } = new URL(request.url);

  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const metric = searchParams.get("metric") || "temperature";
  const metrics = searchParams.get("metrics"); // csv: temperature,humidity,conductivity
  const order = normalizeOrder(searchParams.get("order")); // asc|desc
  const limit = normalizeLimit(searchParams.get("limit"));

  const { farmId, sensorId } = await (params as any);

  let connection: any;
  try {
    connection = await getConnection(farmId as FarmName);

    // Columnas (estructura real)
    const [columns] = await connection.query(
      `SHOW COLUMNS FROM ${escapeId(sensorId)}`
    );

    const columnNames = (columns as Array<{ Field: string }>).map(
      (col) => col.Field
    );

    const dateColumn = pickDateColumn(columnNames);

    // ---- Clasificación del sensor (soil vs ambient)
    const soilByCols = isSoilSensorByColumns(columnNames);
    const sensorType: "soil" | "ambient" = soilByCols ? "soil" : "ambient";

    // ---- Decide qué columnas devolver
    // 1) Si viene metrics explícito: respetamos
    let metricCols = parseMetrics(columnNames, metric, metrics);

    // 2) Si NO viene metrics y no ha encontrado nada: defaults por tipo
    if (!metrics && metricCols.length === 0) {
      const temp = pickColumn(columnNames, ["temperature", "temperatura", "temp"]);

      if (sensorType === "ambient") {
        const hum = pickColumn(columnNames, ["humidity", "humedad", "rh"]);
        metricCols = [temp, hum].filter(Boolean) as string[];
      } else {
        const soilMoist = pickColumn(columnNames, [
          "soilMoisture",
          "soil_moisture",
          "humedad_suelo",
          "moisture",
          "water_content",
          "vwc",
        ]);
        const cond = pickColumn(columnNames, [
          "conductivity",
          "conductividad",
          "ec",
          "ece",
        ]);
        metricCols = [temp, soilMoist, cond].filter(Boolean) as string[];
      }
    }

    // Si aún así nada, intentamos los "clásicos" que existan
    if (metricCols.length === 0 && !metrics) {
      const defaults = ["temperature", "humidity", "soilMoisture", "conductivity"];
      metricCols = defaults
        .map((d) => columnNames.find((c) => c.toLowerCase() === d.toLowerCase()))
        .filter(Boolean) as string[];
    }

    // ---- SELECT
    // ✅ devolvemos también ts (epoch ms) en UTC si es posible
    // Nota: CONVERT_TZ requiere tablas de zona horaria cargadas; si falla, hacemos fallback.
    const selectParts: string[] = [];

    if (dateColumn) {
      const dc = escapeId(dateColumn);
      selectParts.push(dc);

      // Intento UTC: UNIX_TIMESTAMP(CONVERT_TZ(dt, @@session.time_zone, '+00:00')) * 1000
      // Fallback: UNIX_TIMESTAMP(dt) * 1000
      selectParts.push(`
        (
          CASE
            WHEN CONVERT_TZ(${dc}, @@session.time_zone, '+00:00') IS NULL
              THEN (UNIX_TIMESTAMP(${dc}) * 1000)
            ELSE (UNIX_TIMESTAMP(CONVERT_TZ(${dc}, @@session.time_zone, '+00:00')) * 1000)
          END
        ) AS ts
      `);
    }

    for (const c of metricCols) selectParts.push(escapeId(c));

    const selectClause =
      selectParts.length > 0
        ? `SELECT ${selectParts
            .map((s) => s.trim())
            // evita duplicados
            .filter((v, i, arr) => arr.indexOf(v) === i)
            .join(", ")}`
        : "SELECT *";

    let query = `${selectClause} FROM ${escapeId(sensorId)}`;
    const queryParams: Array<string> = [];

    // WHERE por rango (soporta start solo, end solo, o ambos)
    if (dateColumn && startDate && endDate) {
      query += ` WHERE ${escapeId(dateColumn)} BETWEEN ? AND ?`;
      queryParams.push(startDate, endDate);
    } else if (dateColumn && startDate && !endDate) {
      query += ` WHERE ${escapeId(dateColumn)} >= ?`;
      queryParams.push(startDate);
    } else if (dateColumn && !startDate && endDate) {
      query += ` WHERE ${escapeId(dateColumn)} <= ?`;
      queryParams.push(endDate);
    }

    // ORDER
    if (dateColumn) {
      query += ` ORDER BY ${escapeId(dateColumn)} ${order}`;
    }

    // LIMIT
    query += ` LIMIT ${limit}`;

    const [rows] = await connection.query(query, queryParams);

    // Info de TZ de sesión/servidor para auditoría
    let serverTimeZone: any = null;
    try {
      const [tzRows] = await connection.query(
        `SELECT @@session.time_zone AS session_tz, @@global.time_zone AS global_tz`
      );
      serverTimeZone = (tzRows as any[])?.[0] ?? null;
    } catch {
      // noop
    }

    // métricas “disponibles” útiles para UI
    const availableMetrics = {
      hasTemperature: !!pickColumn(columnNames, ["temperature", "temperatura", "temp"]),
      hasHumidity: !!pickColumn(columnNames, ["humidity", "humedad", "rh"]),
      hasSoilMoisture: !!pickColumn(columnNames, [
        "soilMoisture",
        "soil_moisture",
        "humedad_suelo",
        "moisture",
        "water_content",
        "vwc",
      ]),
      hasConductivity: !!pickColumn(columnNames, ["conductivity", "conductividad", "ec", "ece"]),
    };

    return NextResponse.json({
      farmId,
      sensorId,
      sensorType, // ✅ soil | ambient
      columns: columnNames,
      data: rows,
      dateColumn,
      // para el front: usa ts como x-axis
      hasTs: !!dateColumn,
      selectedMetrics: metricCols,
      availableMetrics,
      order: order.toLowerCase(),
      limit,
      serverTimeZone,
    });
  } catch (error) {
    console.error("Error fetching sensor data:", error);
    return NextResponse.json(
      { error: "Error al obtener datos del sensor", details: String(error) },
      { status: 500 }
    );
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch {
        // noop
      }
    }
  }
}
