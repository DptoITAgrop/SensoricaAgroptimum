// lib/db.ts
import mysql from "mysql2/promise";

export const farms = [
  "Casa_Olmo",
  "Finca_Antequera",
  "Valle_Hermoso",
  "Venta_la_Cuesta",
] as const;

export type FarmName = (typeof farms)[number];

/**
 * Escapa identificadores MySQL (BD, tabla, columna) con backticks
 * para soportar espacios, puntos, guiones, etc.
 * Ej: Parcela 1.2 Suelo -> `Parcela 1.2 Suelo`
 */
export function escapeId(identifier: string): string {
  // MySQL permite escapar backtick duplicándolo: ` -> ``
  const safe = String(identifier).replace(/`/g, "``");
  return `\`${safe}\``;
}

export async function getConnection(database?: string) {
  // Nota: createConnection NO soporta pool options como waitForConnections/connectionLimit.
  // Si quieres pool, te preparo createPool aparte. Aquí lo dejamos correcto para conexión simple.
  return mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    port: Number(process.env.MYSQL_PORT) || 3306,
    database,
    // hardening básico
    connectTimeout: Number(process.env.MYSQL_CONNECT_TIMEOUT_MS) || 10_000,
    // Si quieres tratar DATETIME como string (evita líos de TZ):
    // dateStrings: true,
  });
}

export async function getSensorsForFarm(farmName: FarmName): Promise<string[]> {
  const connection = await getConnection(farmName);
  try {
    const [rows] = await connection.query("SHOW TABLES");

    const tables = (rows as Array<Record<string, string>>)
      .map((row) => Object.values(row)[0])
      .filter(Boolean);

    // filtra basura típica si existiese
    const filtered = tables.filter((t) => {
      const name = String(t).toLowerCase();
      if (name === "migrations") return false;
      if (name.startsWith("sqlite_")) return false;
      return true;
    });

    // ordena alfabético (opcional, ayuda al selector)
    filtered.sort((a, b) => a.localeCompare(b, "es"));

    return filtered;
  } finally {
    await connection.end();
  }
}

// Chill Hours calculation period: November 1 to March 1
export function getChillHoursPeriod(year?: number) {
  const currentYear = year || new Date().getFullYear();
  // If we're before November, use previous year's November
  const now = new Date();
  const startYear = now.getMonth() < 10 ? currentYear - 1 : currentYear;

  return {
    start: new Date(startYear, 10, 1), // November 1
    end: new Date(startYear + 1, 2, 1), // March 1
  };
}

// GDD calculation period: April 1 to September 30
export function getGDDPeriod(year?: number) {
  const currentYear = year || new Date().getFullYear();
  return {
    start: new Date(currentYear, 3, 1), // April 1
    end: new Date(currentYear, 8, 30), // September 30
  };
}

/**
 * Calculate chill hours when sampling is not hourly.
 * Your data is every 10 minutes right now => each sample is 10/60 = 1/6 hour.
 *
 * Chill definition: temperature between 0°C and 7.2°C (inclusive).
 */
export function calculateChillHours(
  temperatures: number[],
  sampleMinutes: number = 10
): number {
  const chillSamples = temperatures.filter((temp) => temp >= 0 && temp <= 7.2).length;
  const hoursPerSample = sampleMinutes / 60;
  const chillHours = chillSamples * hoursPerSample;
  return Math.round(chillHours * 10) / 10; // 1 decimal
}

/**
 * ===========================
 * UTAH model (chill units)
 * ===========================
 * Utah assigns "units per hour" based on temperature.
 * Since your samples are every X minutes, we prorate: units * (sampleMinutes/60).
 *
 * NOTE: Utah can be negative for warm temps; eso es normal.
 */
export function utahHourlyUnits(Tc: number): number {
  if (Tc < 1.4) return 0;
  if (Tc < 2.4) return 0.5;
  if (Tc < 9.1) return 1;
  if (Tc < 12.4) return 0.5;
  if (Tc < 15.9) return 0;
  if (Tc < 18.0) return -0.5;
  return -1;
}

export function utahUnitsForSample(Tc: number, sampleMinutes: number = 10): number {
  const perHour = utahHourlyUnits(Tc);
  const factor = sampleMinutes / 60;
  return perHour * factor;
}

/**
 * Calcula unidades UTAH totales a partir de una lista de temperaturas muestreadas.
 * Útil si ya has cargado un array de temps desde MySQL.
 */
export function calculateUtahChillUnits(
  temperatures: number[],
  sampleMinutes: number = 10
): number {
  let total = 0;
  for (const t of temperatures) {
    if (!Number.isFinite(t)) continue;
    total += utahUnitsForSample(t, sampleMinutes);
  }
  return Math.round(total * 10) / 10; // 1 decimal
}

/**
 * Calculate GDD (Growing Degree Days)
 * Base temperature: 7°C (as requested).
 */
export function calculateGDD(
  minTemps: number[],
  maxTemps: number[],
  baseTemp: number = 7
): number {
  let totalGDD = 0;

  const n = Math.min(minTemps.length, maxTemps.length);
  for (let i = 0; i < n; i++) {
    const avgTemp = (minTemps[i] + maxTemps[i]) / 2;
    const gdd = Math.max(0, avgTemp - baseTemp);
    totalGDD += gdd;
  }

  return Math.round(totalGDD * 10) / 10; // 1 decimal
}
