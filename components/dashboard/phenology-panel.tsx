'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Leaf, Calendar, Target, TrendingUp } from 'lucide-react'
import type { AgronomyData } from '@/lib/types'

interface PhenologyPanelProps {
  data: AgronomyData
  variety: string
}

const phenologyStages = [
  { id: 'dormancy', name: 'Reposo invernal', icon: '1' },
  { id: 'pre-bud', name: 'Pre-brotación', icon: '2' },
  { id: 'bud-break', name: 'Inicio brotación', icon: '3' },
  { id: 'flowering', name: 'Floración', icon: '4' },
  { id: 'fruit-set', name: 'Cuajado', icon: '5' },
  { id: 'growth', name: 'Crecimiento', icon: '6' },
  { id: 'maturation', name: 'Maduración', icon: '7' },
  { id: 'harvest', name: 'Cosecha', icon: '8' },
]

function getCurrentStageIndex(stageName: string): number {
  const stageMap: Record<string, number> = {
    'Reposo invernal': 0,
    'Pre-brotación': 1,
    'Inicio brotación': 2,
    'Floración': 3,
    'Cuajado': 4,
    'Crecimiento': 5,
    'Maduración': 6,
    'Cosecha': 7,
  }
  return stageMap[stageName] ?? 0
}

export function PhenologyPanel({ data, variety }: PhenologyPanelProps) {
  const currentStageIndex = getCurrentStageIndex(data.phenologyStage)
  const chillProgress = (data.chillHours / data.chillHoursTarget) * 100
  
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Leaf className="h-4 w-4 text-primary" />
            <CardTitle className="text-base font-semibold text-foreground">Estado Fenológico</CardTitle>
          </div>
          <Badge variant="secondary" className="text-xs">{variety}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Current Stage Display */}
        <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Fase Actual</span>
            <Badge className="bg-primary text-primary-foreground">{data.phenologyStage}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {data.phenologyStage === 'Pre-brotación' && 'Las yemas comienzan a hincharse. Monitorizar temperaturas bajas.'}
            {data.phenologyStage === 'Reposo invernal' && 'El árbol está en dormancia. Acumulando horas frío necesarias.'}
            {data.phenologyStage === 'Inicio brotación' && 'Las yemas están abriendo. Fase crítica para heladas tardías.'}
          </p>
        </div>

        {/* Stage Timeline */}
        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-2">Progreso de la campaña</p>
          <div className="flex items-center gap-1">
            {phenologyStages.map((stage, index) => (
              <div 
                key={stage.id}
                className={`flex-1 h-2 rounded-full transition-colors ${
                  index < currentStageIndex 
                    ? 'bg-primary' 
                    : index === currentStageIndex 
                      ? 'bg-primary animate-pulse' 
                      : 'bg-muted'
                }`}
              />
            ))}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">Reposo</span>
            <span className="text-[10px] text-muted-foreground">Cosecha</span>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-secondary">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-3 w-3 text-chart-2" />
              <span className="text-[10px] text-muted-foreground uppercase">Horas Frío</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold text-foreground">{data.chillHours}</span>
              <span className="text-xs text-muted-foreground">/ {data.chillHoursTarget}</span>
            </div>
            <Progress value={chillProgress} className="h-1.5 mt-2" />
          </div>
          
          <div className="p-3 rounded-lg bg-secondary">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-3 w-3 text-primary" />
              <span className="text-[10px] text-muted-foreground uppercase">GDD Acum.</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold text-foreground">{data.gdd}</span>
              <span className="text-xs text-muted-foreground">base {data.gddBase}°C</span>
            </div>
            <div className="flex items-center gap-1 mt-2">
              <TrendingUp className="h-3 w-3 text-primary" />
              <span className="text-xs text-primary">+12 hoy</span>
            </div>
          </div>
        </div>

        {/* Last Update */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>Última actualización</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {data.lastUpdated.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
