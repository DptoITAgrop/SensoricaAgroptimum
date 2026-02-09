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

    // Decide qué columnas devolver (si no se especifica, devolvemos *)
    const metricCols = parseMetrics(columnNames, metric, metrics);

    // SELECT
    const selectClause =
      metricCols.length > 0 || dateColumn
        ? `SELECT ${[
            ...(dateColumn ? [escapeId(dateColumn)] : []),
            ...metricCols.map((c) => escapeId(c)),
          ]
            // evita duplicados si dateColumn coincide con alguna métrica
            .filter((v, i, arr) => arr.indexOf(v) === i)
            .join(", ")}`
        : "SELECT *";

    let query = `${selectClause} FROM ${escapeId(sensorId)}`;
    const queryParams: Array<string> = [];

    // WHERE por rango
    if (dateColumn && startDate && endDate) {
      query += ` WHERE ${escapeId(dateColumn)} BETWEEN ? AND ?`;
      queryParams.push(startDate, endDate);
    }

    // ORDER
    if (dateColumn) {
      query += ` ORDER BY ${escapeId(dateColumn)} ${order}`;
    }

    // LIMIT
    query += ` LIMIT ${limit}`;

    const [rows] = await connection.query(query, queryParams);

    return NextResponse.json({
      farmId,
      sensorId,
      columns: columnNames,
      data: rows,
      dateColumn,
      selectedMetrics: metricCols,
      order: order.toLowerCase(),
      limit,
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
