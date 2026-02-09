"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/dashboard/header";
import { KPICardsLive } from "@/components/dashboard/kpi-cards-live";
import { SensorSelector } from "@/components/dashboard/sensor-selector";
import { TemperatureChart } from "@/components/dashboard/temperature-chart";
import { SoilChart } from "@/components/dashboard/soil-chart";
import { HeatmapChart } from "@/components/dashboard/heatmap-chart";
import { AgronomyChart } from "@/components/dashboard/agronomy-chart";
import { LeafletMap } from "@/components/dashboard/leaflet-map";
import { AlertsPanel } from "@/components/dashboard/alerts-panel";
import { PhenologyPanel } from "@/components/dashboard/phenology-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, Info, Loader2 } from "lucide-react";
import { fincas, alerts, agronomyData } from "@/lib/mock-data";
import { mutate } from "swr";
import { useSensorTimeSeries } from "@/hooks/use-sensor-timeseries";

// Todas las fincas disponibles
const allFarms = [
  { id: "Casa_Olmo", name: "Casa Olmo" },
  { id: "Finca_Antequera", name: "Finca Antequera" },
  { id: "Valle_Hermoso", name: "Valle Hermoso" },
  { id: "Venta_la_Cuesta", name: "Venta la Cuesta" },
];

type RangePreset = "7d" | "30d" | "6m" | "1y";

interface UserSession {
  id: string;
  name: string;
  email: string;
  role: string;
  allowedFarms: string[] | "all";
}

function rangeLabel(p: RangePreset) {
  if (p === "7d") return "Última semana";
  if (p === "30d") return "Último mes";
  if (p === "6m") return "Últimos 6 meses";
  return "Último año";
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFarmId, setSelectedFarmId] = useState("");
  const [selectedSensor, setSelectedSensor] = useState("all");
  const [activeTab, setActiveTab] = useState("overview");

  // ✅ filtro temporal para gráficas
  const [rangePreset, setRangePreset] = useState<RangePreset>("30d");

  // Cargar sesión del usuario
  useEffect(() => {
    async function loadSession() {
      try {
        const response = await fetch("/api/auth/session");
        if (!response.ok) {
          router.push("/login");
          return;
        }
        const data = await response.json();
        setUser(data.user);

        // Seleccionar la primera finca permitida
        const allowedFarms =
          data.user.allowedFarms === "all"
            ? allFarms.map((f) => f.id)
            : data.user.allowedFarms;

        if (allowedFarms.length > 0) {
          setSelectedFarmId(allowedFarms[0]);
        }
      } catch {
        router.push("/login");
      } finally {
        setIsLoading(false);
      }
    }
    loadSession();
  }, [router]);

  // Filtrar fincas según permisos del usuario
  const userFarms = useMemo(() => {
    if (!user) return [];
    if (user.allowedFarms === "all") return allFarms;
    return allFarms.filter((f) => user.allowedFarms.includes(f.id));
  }, [user]);

  const selectedFinca = useMemo(
    () => fincas.find((f) => f.id === selectedFarmId) ?? fincas[0],
    [selectedFarmId]
  );

  const fincaAlerts = useMemo(
    () => alerts.filter((a) => a.fincaId === selectedFarmId),
    [selectedFarmId]
  );

  const fincaAgronomy = useMemo(
    () =>
      agronomyData.find((a) => a.fincaId === selectedFarmId) ?? agronomyData[0],
    [selectedFarmId]
  );

  const activeAlertCount = alerts.filter((a) => !a.acknowledged).length;

  // ✅ sensor real para gráficas: si "all", usamos undefined
  const sensorForCharts = useMemo(() => {
    if (!selectedFarmId) return undefined;
    if (selectedSensor && selectedSensor !== "all") return selectedSensor;
    return undefined;
  }, [selectedFarmId, selectedSensor]);

  // ✅ TimeSeries desde MySQL con polling (se refresca solo)
  const {
    data: timeSeriesData,
    loading: seriesLoading,
    error: seriesError,
  } = useSensorTimeSeries({
    farmId: selectedFarmId || undefined,
    sensorId: sensorForCharts,
    preset: rangePreset,
    order: "asc",
    metrics: ["temperature", "humidity", "conductivity"],
    refreshIntervalMs: 30000,
    limit: 8000,
  });

  // ✅ heatmap: por ahora reutilizamos timeSeries
  const heatmapData = useMemo(() => {
    return timeSeriesData as any;
  }, [timeSeriesData]);

  const handleRefresh = useCallback(() => {
    if (!selectedFarmId) return;

    // KPIs
    mutate(`/api/farms/${selectedFarmId}/chill-hours`);
    mutate(`/api/farms/${selectedFarmId}/gdd`);
    mutate(`/api/farms/${selectedFarmId}/sensors`);

    // Gráficas (data del sensor)
    if (sensorForCharts) {
      mutate(
        (key: any) =>
          typeof key === "string" &&
          key.includes(`/api/farms/${encodeURIComponent(selectedFarmId)}/sensors/`) &&
          key.includes("/data")
      );
    }
  }, [selectedFarmId, sensorForCharts]);

  const handleFarmChange = (farmId: string) => {
    if (user?.allowedFarms !== "all" && !user?.allowedFarms.includes(farmId))
      return;

    setSelectedFarmId(farmId);
    setSelectedSensor("all");

    mutate(`/api/farms/${farmId}/sensors`);
    mutate(`/api/farms/${farmId}/chill-hours`);
    mutate(`/api/farms/${farmId}/gdd`);
  };

  const handleSensorChange = (sensorId: string) => {
    setSelectedSensor(sensorId);

    if (!selectedFarmId) return;
    mutate(`/api/farms/${selectedFarmId}/chill-hours`);
    mutate(`/api/farms/${selectedFarmId}/gdd`);

    if (sensorId !== "all") {
      mutate(
        (key: any) =>
          typeof key === "string" &&
          key.includes(
            `/api/farms/${encodeURIComponent(selectedFarmId)}/sensors/${encodeURIComponent(
              sensorId
            )}/data`
          )
      );
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user || userFarms.length === 0) return null;

  return (
    <div className="min-h-screen bg-background">
      <Header
        farms={userFarms}
        selectedFarmId={selectedFarmId}
        onFarmChange={handleFarmChange}
        alertCount={activeAlertCount}
        onRefresh={handleRefresh}
        user={user}
        onLogout={handleLogout}
      />

      <main className="p-4 lg:p-6 max-w-[1800px] mx-auto">
        {/* User Info Banner */}
        <section className="mb-4">
          <Card className="bg-secondary/50 border-border">
            <CardContent className="py-3 px-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Info className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Períodos de cálculo:
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="bg-chart-2/10 text-chart-2 border-chart-2/30"
                    >
                      <Calendar className="h-3 w-3 mr-1" />
                      HF: 1 Nov - 1 Mar
                    </Badge>
                    <Badge
                      variant="outline"
                      className="bg-primary/10 text-primary border-primary/30"
                    >
                      <Calendar className="h-3 w-3 mr-1" />
                      GDD: 1 Abr - 30 Sep
                    </Badge>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <Select
                    value={rangePreset}
                    onValueChange={(v) => setRangePreset(v as RangePreset)}
                  >
                    <SelectTrigger className="w-[160px] bg-secondary border-border">
                      <SelectValue placeholder="Rango" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7d">Última semana</SelectItem>
                      <SelectItem value="30d">Último mes</SelectItem>
                      <SelectItem value="6m">Últimos 6 meses</SelectItem>
                      <SelectItem value="1y">Último año</SelectItem>
                    </SelectContent>
                  </Select>

                  <SensorSelector
                    farmId={selectedFarmId}
                    selectedSensor={selectedSensor}
                    onSensorChange={handleSensorChange}
                  />

                  <Badge variant="secondary" className="text-xs">
                    {user.role === "admin"
                      ? "Administrador"
                      : user.role === "tecnico"
                      ? "Técnico"
                      : "Usuario Finca"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* KPI Cards */}
        <section className="mb-6">
          <KPICardsLive
            farmId={selectedFarmId}
            selectedSensor={selectedSensor === "all" ? undefined : selectedSensor}
          />
        </section>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-secondary">
            <TabsTrigger value="overview">Vista General</TabsTrigger>
            <TabsTrigger value="climate">Clima</TabsTrigger>
            <TabsTrigger value="agronomy">Agronomía</TabsTrigger>
            <TabsTrigger value="map">Mapa</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <LeafletMap
                  selectedFarmId={selectedFarmId}
                  onFarmChange={handleFarmChange}
                  allowedFarms={user.allowedFarms === "all" ? undefined : user.allowedFarms}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <TemperatureChart
                    data={timeSeriesData as any}
                    rangeLabel={rangeLabel(rangePreset)}
                    isLoading={seriesLoading}
                    error={seriesError}
                  />
                  <SoilChart
                    data={timeSeriesData as any}
                    rangeLabel={rangeLabel(rangePreset)}
                    isLoading={seriesLoading}
                    error={seriesError}
                  />
                </div>
              </div>

              <div className="space-y-6">
                <AlertsPanel alerts={fincaAlerts} />
                <PhenologyPanel data={fincaAgronomy} variety={selectedFinca.variety} />
              </div>
            </div>
          </TabsContent>

          {/* Climate Tab */}
          <TabsContent value="climate" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <TemperatureChart
                data={timeSeriesData as any}
                rangeLabel={rangeLabel(rangePreset)}
                isLoading={seriesLoading}
                error={seriesError}
              />
              <SoilChart
                data={timeSeriesData as any}
                rangeLabel={rangeLabel(rangePreset)}
                isLoading={seriesLoading}
                error={seriesError}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <HeatmapChart
                data={heatmapData as any}
                title="Mapa de Calor - Temperatura"
                subtitle="Temperatura por hora y día de la semana"
              />

              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base">Resumen Climático</CardTitle>
                </CardHeader>
                <CardContent>
                  {seriesError ? (
                    <p className="text-sm text-destructive">Error cargando datos</p>
                  ) : !timeSeriesData.length ? (
                    <p className="text-sm text-muted-foreground">
                      Selecciona un sensor para ver datos.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between py-3 border-b border-border">
                        <span className="text-sm text-muted-foreground">
                          Temperatura máxima ({rangeLabel(rangePreset)})
                        </span>
                        <span className="text-sm font-medium text-foreground">
                          {Math.max(...timeSeriesData.map((d: any) => d.temperature ?? -999)).toFixed(1)}
                          °C
                        </span>
                      </div>

                      <div className="flex items-center justify-between py-3 border-b border-border">
                        <span className="text-sm text-muted-foreground">
                          Temperatura mínima ({rangeLabel(rangePreset)})
                        </span>
                        <span className="text-sm font-medium text-foreground">
                          {Math.min(...timeSeriesData.map((d: any) => d.temperature ?? 999)).toFixed(1)}
                          °C
                        </span>
                      </div>

                      <div className="flex items-center justify-between py-3 border-b border-border">
                        <span className="text-sm text-muted-foreground">
                          Temperatura media ({rangeLabel(rangePreset)})
                        </span>
                        <span className="text-sm font-medium text-foreground">
                          {(
                            timeSeriesData.reduce(
                              (sum: number, d: any) => sum + (d.temperature ?? 0),
                              0
                            ) / timeSeriesData.length
                          ).toFixed(1)}
                          °C
                        </span>
                      </div>

                      <div className="flex items-center justify-between py-3 border-b border-border">
                        <span className="text-sm text-muted-foreground">
                          Humedad media ({rangeLabel(rangePreset)})
                        </span>
                        <span className="text-sm font-medium text-foreground">
                          {Math.round(
                            timeSeriesData.reduce(
                              (sum: number, d: any) => sum + (d.humidity ?? 0),
                              0
                            ) / timeSeriesData.length
                          )}
                          %
                        </span>
                      </div>

                      <div className="flex items-center justify-between py-3">
                        <span className="text-sm text-muted-foreground">Registros cargados</span>
                        <span className="text-sm font-medium text-foreground">
                          {timeSeriesData.length}
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Agronomy Tab */}
          <TabsContent value="agronomy" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                {/* ✅ FIX: pasar props reales */}
                <AgronomyChart
                  farmId={selectedFarmId}
                  selectedSensor={selectedSensor}
                />
              </div>
              <PhenologyPanel data={fincaAgronomy} variety={selectedFinca.variety} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-sm">Recomendaciones</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                      <span>Continuar monitorizando acumulación de horas frío</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                      <span>Preparar tratamiento preventivo para brotación</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent mt-2 shrink-0" />
                      <span>Vigilar previsión de heladas tardías</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-sm">Próximas Tareas</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-chart-2 mt-2 shrink-0" />
                      <span>Revisión de sistema de riego (15 Mar)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-chart-2 mt-2 shrink-0" />
                      <span>Análisis foliar programado (20 Mar)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-chart-2 mt-2 shrink-0" />
                      <span>Fertilización de primavera (25 Mar)</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-sm">Histórico Campaña</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Inicio campaña</span>
                      <span className="text-foreground">15 Nov 2025</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Días transcurridos</span>
                      <span className="text-foreground">79 días</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Fecha prevista cosecha</span>
                      <span className="text-foreground">Sep 2026</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Map Tab */}
          <TabsContent value="map" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <LeafletMap
                  selectedFarmId={selectedFarmId}
                  onFarmChange={handleFarmChange}
                  allowedFarms={user.allowedFarms === "all" ? undefined : user.allowedFarms}
                />
              </div>

              <div className="space-y-6">
                <AlertsPanel alerts={fincaAlerts} />
                <Card className="bg-card border-border">
                  <CardHeader>
                    <CardTitle className="text-sm">Información de la Finca</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Nombre</span>
                        <span className="text-foreground">{selectedFinca.name}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Variedad</span>
                        <span className="text-foreground">{selectedFinca.variety}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Superficie</span>
                        <span className="text-foreground">{selectedFinca.area} ha</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Base de datos</span>
                        <Badge variant="outline" className="text-xs">
                          {selectedFarmId}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
