"use client";

import { useEffect, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Radio } from "lucide-react";
import useSWR from "swr";

interface SensorSelectorProps {
  farmId: string;
  selectedSensor: string;
  onSensorChange: (sensorId: string) => void;
}

interface SensorsResponse {
  farmId: string;
  sensors: Array<{
    id: string;   // nombre real de tabla (puede tener espacios/puntos)
    name: string; // label para UI
  }>;
  count?: number;
}

const fetcher = async (url: string): Promise<SensorsResponse> => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || res.statusText);
  }
  return res.json();
};

export function SensorSelector({
  farmId,
  selectedSensor,
  onSensorChange,
}: SensorSelectorProps) {
  const url = useMemo(() => {
    if (!farmId) return null;
    return `/api/farms/${encodeURIComponent(farmId)}/sensors`;
  }, [farmId]);

  const { data, error, isLoading } = useSWR<SensorsResponse>(url, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  const sensors = data?.sensors ?? [];

  // Si cambias de finca y el sensor seleccionado ya no existe, resetea a "all"
  useEffect(() => {
    if (!farmId) return;
    if (!data?.sensors) return;

    if (selectedSensor === "all") return;

    const exists = data.sensors.some((s) => s.id === selectedSensor);
    if (!exists) {
      onSensorChange("all");
    }
  }, [farmId, data, selectedSensor, onSensorChange]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 h-10 px-3 rounded-md bg-secondary border border-border">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Cargando sensores...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 h-10 px-3 rounded-md bg-secondary border border-border">
        <Radio className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Error cargando sensores</span>
      </div>
    );
  }

  if (!sensors.length) {
    return (
      <div className="flex items-center gap-2 h-10 px-3 rounded-md bg-secondary border border-border">
        <Radio className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Sin sensores disponibles</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Radio className="h-4 w-4" />
        <span>Sensor:</span>
      </div>

      <Select value={selectedSensor} onValueChange={onSensorChange}>
        <SelectTrigger className="w-[200px] md:w-[280px] bg-secondary border-border">
          <SelectValue placeholder="Todos los sensores" />
        </SelectTrigger>

        <SelectContent>
          <SelectItem value="all">
            <div className="flex items-center gap-2">
              <span>Todos los sensores</span>
              <Badge variant="secondary" className="text-[10px]">
                {sensors.length}
              </Badge>
            </div>
          </SelectItem>

          {sensors.map((sensor) => (
            <SelectItem key={sensor.id} value={sensor.id}>
              {sensor.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
