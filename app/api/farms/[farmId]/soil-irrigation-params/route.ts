import { NextResponse } from "next/server";
import mysql, { Pool } from "mysql2/promise";

// Fuerza runtime Node (mysql no va en edge)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

declare global {
  // eslint-disable-next-line no-var
  var __soilParamsPool: Pool | undefined;
}

function env(name: string, required = true) {
  const v = process.env[name];
  if (required && (!v || !v.trim())) throw new Error(`Missing env: ${name}`);
  return v?.trim() ?? "";
}

function getPool() {
  if (global.__soilParamsPool) return global.__soilParamsPool;

  const host = env("MYSQL_HOST");
  const user = env("MYSQL_USER");
  const password = env("MYSQL_PASSWORD");
  const port = Number(env("MYSQL_PORT")) || 3306;

  // La tabla soil_irrigation_params vive en iot_config
  const database = process.env.MYSQL_DATABASE?.trim() || "iot_config";

  const pool = mysql.createPool({
    host,
    user,
    password,
    port,
    database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  });

  global.__soilParamsPool = pool;
  return pool;
}

function isRetryableMysqlError(e: any) {
  const code = e?.code;
  return (
    code === "ECONNRESET" ||
    code === "PROTOCOL_CONNECTION_LOST" ||
    code === "ETIMEDOUT" ||
    code === "EPIPE"
  );
}

function buildSensorCandidates(sensor: string) {
  const s0 = sensor.trim();
  const variants = new Set<string>();

  // exact
  variants.add(s0);

  // normaliza guiones a "_"
  variants.add(s0.replace(/-+/g, "_"));

  // normaliza espacios a "_"
  variants.add(s0.replace(/\s+/g, "_"));

  // normaliza múltiples "_" -> "_"
  variants.add(s0.replace(/_+/g, "_"));

  // dobles "__" <-> "_" (por si en DB quedó distinto)
  variants.add(s0.replace(/_+/g, "__"));
  variants.add(s0.replace(/__+/g, "_"));

  // combina guiones+espacios
  const s1 = s0.replace(/-+/g, "_").replace(/\s+/g, "_");
  variants.add(s1);
  variants.add(s1.replace(/_+/g, "_"));
  variants.add(s1.replace(/_+/g, "__"));
  variants.add(s1.replace(/__+/g, "_"));

  // limpia extremos
  const cleaned = s1.replace(/^_+|_+$/g, "");
  variants.add(cleaned);
  variants.add(cleaned.replace(/_+/g, "_"));
  variants.add(cleaned.replace(/_+/g, "__"));

  // máximo 8
  return Array.from(variants).filter(Boolean).slice(0, 8);
}

async function queryWithRetry<T = any>(
  sql: string,
  params: any[],
  retries = 1
): Promise<T> {
  const pool = getPool();
  try {
    // Timeout REAL por query
    const [rows] = await pool.query({ sql, timeout: 12_000 }, params);
    return rows as T;
  } catch (e: any) {
    if (retries > 0 && isRetryableMysqlError(e)) {
      global.__soilParamsPool = undefined;
      return queryWithRetry<T>(sql, params, retries - 1);
    }
    throw e;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ farmId: string }> }
) {
  const startedAt = Date.now();

  try {
    const { farmId: farmIdRaw } = await params;
    const farmName = decodeURIComponent(farmIdRaw);

    const { searchParams } = new URL(request.url);
    const sensorRaw = searchParams.get("sensor") ?? "";
    const sensor = decodeURIComponent(sensorRaw).trim();

    if (!farmName || !sensor) {
      return NextResponse.json(
        { ok: false, error: "Missing farmId or sensor" },
        { status: 400 }
      );
    }

    const candidates = buildSensorCandidates(sensor);

    console.log("[soil-irrigation-params] request:", {
      farmName,
      sensorRaw,
      candidates,
    });

    const placeholders = candidates.map(() => "?").join(", ");
    const sql = `
      SELECT
        id,
        farm_name,
        sensor_table,
        cc,
        pmp,
        adp,
        pct_inicio,
        pct_fin,
        umbral_inicio,
        umbral_fin,
        profundidad_sensor_m
      FROM soil_irrigation_params
      WHERE farm_name = ?
        AND sensor_table IN (${placeholders})
      ORDER BY id DESC
      LIMIT 1
    `;

    const rows = await queryWithRetry<any[]>(sql, [farmName, ...candidates], 1);
    const row = Array.isArray(rows) ? rows[0] ?? null : null;

    // ✅ IMPORTANTE: si no hay params, NO es error → devolvemos data:null
    if (!row) {
      return NextResponse.json({
        ok: true,
        ms: Date.now() - startedAt,
        data: null,
        requested: { farmName, sensorRaw: sensor },
        tried: { candidates },
      });
    }

    return NextResponse.json({
      ok: true,
      ms: Date.now() - startedAt,
      data: row,
    });
  } catch (e: any) {
    console.error("[soil-irrigation-params] ERROR:", e);

    const code = e?.code ?? undefined;
    const msg = e?.message ?? String(e);

    return NextResponse.json(
      {
        ok: false,
        error: "Error leyendo soil_irrigation_params",
        ms: Date.now() - startedAt,
        debug: { code, message: msg },
      },
      { status: 500 }
    );
  }
}