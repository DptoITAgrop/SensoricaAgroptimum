import { NextResponse } from "next/server";
import { getSensorsForFarm, type FarmName } from "@/lib/db";

function prettyLabel(tableName: string) {
  // No tocamos el id real. Solo generamos un label amigable.
  // - Convertimos "__" (doble underscore) a " · " para que se vea separado (sin perder info)
  // - Convertimos "_" a espacio
  // - Colapsamos espacios
  return tableName
    .replace(/__/g, " · ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ farmId: string }> }
) {
  try {
    const { farmId: farmIdRaw } = await params;
    const farmId = decodeURIComponent(farmIdRaw);

    const sensors = await getSensorsForFarm(farmId as FarmName);

    // Evita duplicados y ordena (por si db devuelve repetidos)
    const uniqueSorted = Array.from(new Set(sensors)).sort((a, b) =>
      a.localeCompare(b)
    );

    return NextResponse.json({
      farmId,
      count: uniqueSorted.length,
      sensors: uniqueSorted.map((tableName) => ({
        id: tableName, // ✅ ID = nombre REAL de la tabla
        name: prettyLabel(tableName), // ✅ Label bonito para UI
      })),
    });
  } catch (error: any) {
    console.error("[/api/farms/[farmId]/sensors] Error fetching sensors:", error);

    return NextResponse.json(
      {
        error: "Error al obtener sensores",
        details: error?.message ?? String(error),
      },
      { status: 500 }
    );
  }
}