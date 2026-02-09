import { NextResponse } from "next/server";
import { getSensorsForFarm, type FarmName } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ farmId: string }> }
) {
  try {
    const { farmId } = await params;
    const sensors = await getSensorsForFarm(farmId as FarmName);
    
    return NextResponse.json({
      farmId,
      sensors: sensors.map((name) => ({
        id: name,
        name: name.replace(/_/g, " "),
      })),
    });
  } catch (error) {
    console.error("Error fetching sensors:", error);
    return NextResponse.json(
      { error: "Error al obtener sensores" },
      { status: 500 }
    );
  }
}
