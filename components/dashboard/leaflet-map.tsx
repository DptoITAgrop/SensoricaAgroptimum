"use client"

import { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  MapPin,
  Thermometer,
  Layers,
  Droplets,
  ZoomIn,
  ZoomOut,
  Locate,
  Battery,
  Wifi,
  Signal,
} from "lucide-react"
import { farmsConfig, type FarmConfig, type SensorConfig } from "@/lib/sensor-config"

interface LeafletMapProps {
  selectedFarmId: string
  onFarmChange?: (farmId: string) => void
  allowedFarms?: string[]  // Si es undefined, mostrar todas
}

export function LeafletMap({ selectedFarmId, onFarmChange, allowedFarms }: LeafletMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.Marker[]>([])
  const [selectedSensor, setSelectedSensor] = useState<SensorConfig | null>(null)
  const [isMapReady, setIsMapReady] = useState(false)
  const [L, setL] = useState<typeof import("leaflet") | null>(null)

  // Filtrar fincas según permisos del usuario
  const visibleFarms = allowedFarms 
    ? farmsConfig.filter(f => allowedFarms.includes(f.id))
    : farmsConfig
  
  const selectedFarm = visibleFarms.find((f) => f.id === selectedFarmId) || visibleFarms[0]

  // Load Leaflet dynamically
  useEffect(() => {
    const loadLeaflet = async () => {
      const leaflet = await import("leaflet")
      setL(leaflet.default)
    }
    loadLeaflet()
  }, [])

  // Initialize map
  useEffect(() => {
    if (!L || !mapRef.current || mapInstanceRef.current) return

    // Add Leaflet CSS
    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement("link")
      link.rel = "stylesheet"
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      document.head.appendChild(link)
    }

    // Create map
    const map = L.map(mapRef.current, {
      center: [selectedFarm.coordinates.lat, selectedFarm.coordinates.lng],
      zoom: 14,
      zoomControl: false,
    })

    // Add Esri World Imagery (Satellite) tiles
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      maxZoom: 19,
    }).addTo(map)
    
    // Add labels layer on top of satellite
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19,
    }).addTo(map)

    mapInstanceRef.current = map
    setIsMapReady(true)

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [L, selectedFarm.coordinates.lat, selectedFarm.coordinates.lng])

  // Update markers when farm changes
  useEffect(() => {
    if (!L || !mapInstanceRef.current || !isMapReady) return

    const map = mapInstanceRef.current

    // Clear existing markers
    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = []

    // Center map on selected farm
    map.setView([selectedFarm.coordinates.lat, selectedFarm.coordinates.lng], 14)

    // Add farm marker
    const farmIcon = L.divIcon({
      html: `
        <div class="farm-marker">
          <div style="
            background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);
            border: 3px solid white;
          ">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9,22 9,12 15,12 15,22"></polyline>
            </svg>
          </div>
        </div>
      `,
      className: "",
      iconSize: [40, 40],
      iconAnchor: [20, 40],
    })

    const farmMarker = L.marker([selectedFarm.coordinates.lat, selectedFarm.coordinates.lng], {
      icon: farmIcon,
    })
      .addTo(map)
      .bindPopup(
        `<div style="text-align:center;padding:8px;">
        <strong style="font-size:14px;">${selectedFarm.name}</strong><br/>
        <span style="color:#666;font-size:12px;">${selectedFarm.sensors.length} sensores</span>
      </div>`
      )

    markersRef.current.push(farmMarker)

    // Add sensor markers
    selectedFarm.sensors.forEach((sensor) => {
      const color =
        sensor.type === "ambient" ? "#4ade80" : sensor.type === "soil" ? "#f59e0b" : "#3b82f6"

      const iconSvg =
        sensor.type === "ambient"
          ? '<path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"></path>'
          : sensor.type === "soil"
            ? '<polygon points="12,2 2,7 12,12 22,7"></polygon><polyline points="2,17 12,22 22,17"></polyline><polyline points="2,12 12,17 22,12"></polyline>'
            : '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>'

      const sensorIcon = L.divIcon({
        html: `
          <div class="sensor-marker" style="cursor:pointer;">
            <div style="
              background: ${color};
              width: 32px;
              height: 32px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 2px 8px ${color}66;
              border: 2px solid white;
              transition: transform 0.2s;
            ">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                ${iconSvg}
              </svg>
            </div>
          </div>
        `,
        className: "",
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      })

      const marker = L.marker([sensor.coordinates.lat, sensor.coordinates.lng], {
        icon: sensorIcon,
      })
        .addTo(map)
        .on("click", () => setSelectedSensor(sensor))

      marker.bindPopup(
        `<div style="min-width:180px;padding:8px;">
        <strong style="font-size:13px;">${sensor.name}</strong><br/>
        <span style="color:#666;font-size:11px;">Modelo: ${sensor.model}</span><br/>
        <span style="color:#666;font-size:11px;">Tipo: ${sensor.type === "ambient" ? "Ambiental" : sensor.type === "soil" ? "Suelo" : "Humedad"}</span><br/>
        <span style="color:#888;font-size:10px;">${sensor.coordinates.lat.toFixed(4)}°, ${sensor.coordinates.lng.toFixed(4)}°</span>
      </div>`
      )

      markersRef.current.push(marker)
    })
  }, [L, selectedFarm, isMapReady])

  const handleZoomIn = () => {
    mapInstanceRef.current?.zoomIn()
  }

  const handleZoomOut = () => {
    mapInstanceRef.current?.zoomOut()
  }

  const handleCenterOnFarm = () => {
    if (mapInstanceRef.current && selectedFarm) {
      mapInstanceRef.current.setView([selectedFarm.coordinates.lat, selectedFarm.coordinates.lng], 14)
    }
  }

  const getSensorIcon = (type: string) => {
    switch (type) {
      case "ambient":
        return <Thermometer className="h-4 w-4" />
      case "soil":
        return <Layers className="h-4 w-4" />
      default:
        return <Droplets className="h-4 w-4" />
    }
  }

  const getSensorColor = (type: string) => {
    switch (type) {
      case "ambient":
        return "bg-green-500/20 text-green-400 border-green-500/30"
      case "soil":
        return "bg-amber-500/20 text-amber-400 border-amber-500/30"
      default:
        return "bg-blue-500/20 text-blue-400 border-blue-500/30"
    }
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Mapa de Sensores
          </CardTitle>
          <Select value={selectedFarmId} onValueChange={onFarmChange}>
            <SelectTrigger className="w-48 bg-secondary border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {visibleFarms.map((farm) => (
                <SelectItem key={farm.id} value={farm.id}>
                  {farm.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative">
          {/* Map Container */}
          <div
            ref={mapRef}
            className="h-[500px] w-full rounded-b-lg"
            style={{ background: "#1a1f2e" }}
          />

          {/* Map Controls */}
          <div className="absolute top-4 right-4 flex flex-col gap-2 z-[1000]">
            <Button
              size="icon"
              variant="secondary"
              className="bg-card/90 backdrop-blur-sm border border-border hover:bg-secondary"
              onClick={handleZoomIn}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="bg-card/90 backdrop-blur-sm border border-border hover:bg-secondary"
              onClick={handleZoomOut}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="bg-card/90 backdrop-blur-sm border border-border hover:bg-secondary"
              onClick={handleCenterOnFarm}
            >
              <Locate className="h-4 w-4" />
            </Button>
          </div>

          {/* Legend */}
          <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur-sm rounded-lg p-3 border border-border z-[1000]">
            <p className="text-xs font-medium text-muted-foreground mb-2">Leyenda</p>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-xs text-foreground">Ambiental (T/H)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <span className="text-xs text-foreground">Suelo</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="text-xs text-foreground">Humedad</span>
              </div>
            </div>
          </div>

          {/* Sensor Count Badge */}
          <div className="absolute top-4 left-4 z-[1000]">
            <Badge className="bg-card/90 backdrop-blur-sm text-foreground border border-border">
              {selectedFarm.sensors.length} sensores en {selectedFarm.name}
            </Badge>
          </div>
        </div>

        {/* Sensor List */}
        <div className="p-4 border-t border-border">
          <h4 className="text-sm font-medium text-foreground mb-3">Sensores de la finca</h4>
          {selectedFarm.sensors.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay sensores configurados para esta finca. Los sensores se cargarán desde la base de
              datos.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {selectedFarm.sensors.map((sensor) => (
                <div
                  key={sensor.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-all hover:scale-[1.02] ${
                    selectedSensor?.id === sensor.id
                      ? "border-primary bg-primary/10"
                      : "border-border bg-secondary/50 hover:border-primary/50"
                  }`}
                  onClick={() => {
                    setSelectedSensor(sensor)
                    if (mapInstanceRef.current) {
                      mapInstanceRef.current.setView(
                        [sensor.coordinates.lat, sensor.coordinates.lng],
                        17
                      )
                    }
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`p-1.5 rounded-full border ${getSensorColor(sensor.type)}`}
                      >
                        {getSensorIcon(sensor.type)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{sensor.name}</p>
                        <p className="text-xs text-muted-foreground">{sensor.model}</p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className="text-xs bg-green-500/10 text-green-400 border-green-500/30"
                    >
                      <Wifi className="h-3 w-3 mr-1" />
                      Online
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {sensor.coordinates.lat.toFixed(2)}°, {sensor.coordinates.lng.toFixed(2)}°
                    </span>
                    <span className="flex items-center gap-1">
                      <Battery className="h-3 w-3" />
                      Alto
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Selected Sensor Detail */}
        {selectedSensor && (
          <div className="p-4 border-t border-border bg-secondary/30">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-foreground">Detalle del sensor</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedSensor(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                Cerrar
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Nombre</p>
                <p className="text-sm font-medium text-foreground">{selectedSensor.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Modelo</p>
                <p className="text-sm font-medium text-foreground">{selectedSensor.model}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">DevEUI</p>
                <p className="text-sm font-medium text-foreground font-mono text-xs">
                  {selectedSensor.devEUI}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Coordenadas</p>
                <p className="text-sm font-medium text-foreground">
                  {selectedSensor.coordinates.lat.toFixed(4)}°,{" "}
                  {selectedSensor.coordinates.lng.toFixed(4)}°
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                <Signal className="h-3 w-3 mr-1" />
                LoRaWAN
              </Badge>
              <Badge
                variant="outline"
                className="text-xs bg-green-500/10 text-green-400 border-green-500/30"
              >
                Conectado
              </Badge>
              <Badge variant="outline" className="text-xs">
                <Battery className="h-3 w-3 mr-1" />
                Bateria Alta
              </Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
