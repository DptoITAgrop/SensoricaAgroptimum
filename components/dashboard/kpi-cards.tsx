'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Thermometer, Droplets, Leaf, Zap, TrendingUp, TrendingDown } from 'lucide-react'
import type { AgronomyData, TimeSeriesData } from '@/lib/types'

interface KPICardsProps {
  agronomyData: AgronomyData
  latestReading: TimeSeriesData
}

export function KPICards({ agronomyData, latestReading }: KPICardsProps) {
  const chillProgress = (agronomyData.chillHours / agronomyData.chillHoursTarget) * 100

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Horas Frío */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Horas Frío</p>
              <p className="text-3xl font-bold text-foreground mt-1">{agronomyData.chillHours}</p>
              <p className="text-xs text-muted-foreground mt-1">
                de {agronomyData.chillHoursTarget} objetivo
              </p>
            </div>
            <div className="p-2 rounded-lg bg-chart-2/20">
              <Thermometer className="h-5 w-5 text-chart-2" />
            </div>
          </div>
          <div className="mt-3">
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full bg-chart-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(chillProgress, 100)}%` }}
              />
            </div>
            <p className="text-xs text-chart-2 mt-1 font-medium">{chillProgress.toFixed(1)}% completado</p>
          </div>
        </CardContent>
      </Card>

      {/* GDD */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">GDD Acumulados</p>
              <p className="text-3xl font-bold text-foreground mt-1">{agronomyData.gdd}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Base: {agronomyData.gddBase}°C
              </p>
            </div>
            <div className="p-2 rounded-lg bg-primary/20">
              <Leaf className="h-5 w-5 text-primary" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-xs text-primary font-medium">+12 GDD hoy</span>
          </div>
        </CardContent>
      </Card>

      {/* Temperatura Actual */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Temperatura</p>
              <p className="text-3xl font-bold text-foreground mt-1">{latestReading.temperature}°C</p>
              <p className="text-xs text-muted-foreground mt-1">
                Humedad: {latestReading.humidity}%
              </p>
            </div>
            <div className="p-2 rounded-lg bg-accent/20">
              <Zap className="h-5 w-5 text-accent" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            {latestReading.temperature < 5 ? (
              <>
                <TrendingDown className="h-4 w-4 text-destructive" />
                <span className="text-xs text-destructive font-medium">Riesgo helada</span>
              </>
            ) : (
              <>
                <TrendingUp className="h-4 w-4 text-primary" />
                <span className="text-xs text-primary font-medium">Rango óptimo</span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Humedad Suelo */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Humedad Suelo</p>
              <p className="text-3xl font-bold text-foreground mt-1">{latestReading.soilMoisture}%</p>
              <p className="text-xs text-muted-foreground mt-1">
                Cond: {latestReading.conductivity} dS/m
              </p>
            </div>
            <div className="p-2 rounded-lg bg-chart-5/20">
              <Droplets className="h-5 w-5 text-chart-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full bg-chart-5 rounded-full transition-all duration-500"
                style={{ width: `${latestReading.soilMoisture}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
