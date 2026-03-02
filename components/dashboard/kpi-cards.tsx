'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Thermometer, Droplets, Leaf, Zap, TrendingUp, TrendingDown } from 'lucide-react'
import type { AgronomyData, TimeSeriesData } from '@/lib/types'

interface KPICardsProps {
  agronomyData: AgronomyData
  latestReading: TimeSeriesData
}

function toNum(v: any): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function fmt1(v: any): string {
  const n = toNum(v)
  if (n === null) return '—'
  return (Math.round(n * 10) / 10).toFixed(1)
}

function fmt0(v: any): string {
  const n = toNum(v)
  if (n === null) return '—'
  return String(Math.round(n))
}

export function KPICards({ agronomyData, latestReading }: KPICardsProps) {
  // ---- HF ----
  const chillHoursTotal = toNum((agronomyData as any)?.chillHours)
  const chillHoursAvg = toNum((agronomyData as any)?.chillHoursAvg) // ✅ NUEVO (si lo aportas desde backend)
  const chillTarget = toNum((agronomyData as any)?.chillHoursTarget)

  // Si existe la media -> mostramos media. Si no -> fallback a total (lo actual).
  const useAverageHF = chillHoursAvg !== null
  const chillHoursDisplay = useAverageHF ? chillHoursAvg : chillHoursTotal

  const chillProgress =
    chillHoursDisplay !== null && chillTarget !== null && chillTarget > 0
      ? (chillHoursDisplay / chillTarget) * 100
      : null

  // ---- GDD ----
  const gddTotal = toNum((agronomyData as any)?.gdd)
  const gddAvg = toNum((agronomyData as any)?.gddAvg) // ✅ opcional si lo quieres igual que HF
  const gddBase = toNum((agronomyData as any)?.gddBase)

  // Si algún día quieres “media finca” también en GDD, puedes usar lo mismo.
  const useAverageGDD = gddAvg !== null
  const gddDisplay = useAverageGDD ? gddAvg : gddTotal

  // “GDD hoy” si te lo da el backend (mejor que hardcode)
  const gddToday = toNum((agronomyData as any)?.gddToday)

  // ---- Tiempo real ----
  const temperature = toNum((latestReading as any)?.temperature)
  const humidity = toNum((latestReading as any)?.humidity)
  const soilMoisture = toNum((latestReading as any)?.soilMoisture)
  const conductivity = toNum((latestReading as any)?.conductivity)

  const isFrostRisk = temperature !== null && temperature < 5

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Horas Frío (CAMPAÑA 1 Nov -> 1 Mar) */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Horas Frío
              </p>

              <p className="text-3xl font-bold text-foreground mt-1">
                {chillHoursDisplay === null ? '—' : fmt1(chillHoursDisplay)}
              </p>

              <p className="text-xs text-muted-foreground mt-1">
                {chillTarget !== null ? (
                  <>
                    de {fmt0(chillTarget)} objetivo ·{' '}
                    <span className="opacity-80">
                      {useAverageHF ? 'Media finca' : 'Total finca'} (1 Nov–1 Mar)
                    </span>
                  </>
                ) : (
                  <span className="opacity-80">
                    {useAverageHF ? 'Media finca' : 'Total finca'} (1 Nov–1 Mar)
                  </span>
                )}
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
                style={{ width: `${Math.min(Math.max(chillProgress ?? 0, 0), 100)}%` }}
              />
            </div>

            <p className="text-xs text-chart-2 mt-1 font-medium">
              {chillProgress === null ? '—' : `${chillProgress.toFixed(1)}% completado`}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* GDD */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                GDD Acumulados
              </p>

              <p className="text-3xl font-bold text-foreground mt-1">
                {gddDisplay === null ? '—' : fmt1(gddDisplay)}
              </p>

              <p className="text-xs text-muted-foreground mt-1">
                {gddBase === null ? 'Base: —' : `Base: ${fmt1(gddBase)}°C`}
                {useAverageGDD ? <span className="opacity-80"> · Media finca</span> : null}
              </p>
            </div>

            <div className="p-2 rounded-lg bg-primary/20">
              <Leaf className="h-5 w-5 text-primary" />
            </div>
          </div>

          {/* ✅ sin hardcode: solo si existe gddToday */}
          {gddToday !== null ? (
            <div className="mt-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-xs text-primary font-medium">+{fmt1(gddToday)} GDD hoy</span>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-xs text-primary font-medium">Período vegetativo</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Temperatura Actual */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Temperatura
              </p>
              <p className="text-3xl font-bold text-foreground mt-1">
                {temperature === null ? '—' : `${fmt1(temperature)}°C`}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Humedad: {humidity === null ? '—' : `${fmt0(humidity)}%`}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-accent/20">
              <Zap className="h-5 w-5 text-accent" />
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            {isFrostRisk ? (
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
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                Humedad Suelo
              </p>
              <p className="text-3xl font-bold text-foreground mt-1">
                {soilMoisture === null ? '—' : `${fmt0(soilMoisture)}%`}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Cond: {conductivity === null ? '—' : `${fmt1(conductivity)} dS/m`}
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
                style={{
                  width:
                    soilMoisture === null
                      ? '0%'
                      : `${Math.min(Math.max(soilMoisture, 0), 100)}%`,
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}