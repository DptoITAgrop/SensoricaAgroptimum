import { NextResponse } from "next/server";
import { farms } from "@/lib/db";

export async function GET() {
  return NextResponse.json({
    farms: farms.map((name) => ({
      id: name,
      name: name.replace(/_/g, " "),
    })),
  });
}
