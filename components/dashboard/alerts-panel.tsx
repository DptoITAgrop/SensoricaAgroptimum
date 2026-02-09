'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Bell, AlertTriangle, Snowflake, Droplets, Zap, CloudRain, Check, X } from 'lucide-react'
import type { Alert } from '@/lib/types'

interface AlertsPanelProps {
  alerts: Alert[]
  onAcknowledge?: (alertId: string) => void
  onDismiss?: (alertId: string) => void
}

function getAlertIcon(type: Alert['type']) {
  switch (type) {
    case 'frost':
      return <Snowflake className="h-4 w-4" />
    case 'conductivity':
      return <Zap className="h-4 w-4" />
    case 'humidity':
      return <Droplets className="h-4 w-4" />
    case 'rain_pollen':
      return <CloudRain className="h-4 w-4" />
  }
}

function getSeverityStyles(severity: Alert['severity']) {
  switch (severity) {
    case 'normal':
      return {
        bg: 'bg-primary/10',
        border: 'border-primary/30',
        icon: 'text-primary',
        badge: 'bg-primary/20 text-primary hover:bg-primary/30'
      }
    case 'warning':
      return {
        bg: 'bg-accent/10',
        border: 'border-accent/30',
        icon: 'text-accent',
        badge: 'bg-accent/20 text-accent-foreground hover:bg-accent/30'
      }
    case 'critical':
      return {
        bg: 'bg-destructive/10',
        border: 'border-destructive/30',
        icon: 'text-destructive',
        badge: 'bg-destructive/20 text-destructive hover:bg-destructive/30'
      }
  }
}

function getAlertTypeName(type: Alert['type']) {
  switch (type) {
    case 'frost':
      return 'Helada'
    case 'conductivity':
      return 'Conductividad'
    case 'humidity':
      return 'Humedad'
    case 'rain_pollen':
      return 'Lluvia/Polen'
  }
}

function formatTimeAgo(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  
  if (diffMins < 1) return 'Ahora'
  if (diffMins < 60) return `Hace ${diffMins} min`
  if (diffHours < 24) return `Hace ${diffHours}h`
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
}

export function AlertsPanel({ alerts, onAcknowledge, onDismiss }: AlertsPanelProps) {
  const [localAlerts, setLocalAlerts] = useState(alerts)
  
  const activeAlerts = localAlerts.filter(a => !a.acknowledged)
  const acknowledgedAlerts = localAlerts.filter(a => a.acknowledged)
  
  const criticalCount = activeAlerts.filter(a => a.severity === 'critical').length
  const warningCount = activeAlerts.filter(a => a.severity === 'warning').length

  const handleAcknowledge = (alertId: string) => {
    setLocalAlerts(prev => prev.map(a => 
      a.id === alertId ? { ...a, acknowledged: true } : a
    ))
    onAcknowledge?.(alertId)
  }

  const handleDismiss = (alertId: string) => {
    setLocalAlerts(prev => prev.filter(a => a.id !== alertId))
    onDismiss?.(alertId)
  }

  return (
    <Card className="bg-card border-border h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-semibold text-foreground">Alertas</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {criticalCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {criticalCount} Críticas
              </Badge>
            )}
            {warningCount > 0 && (
              <Badge variant="secondary" className="text-xs bg-accent/20 text-accent-foreground">
                {warningCount} Atención
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[320px] pr-4">
          {activeAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <div className="p-3 rounded-full bg-primary/10 mb-3">
                <Check className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">Sin alertas activas</p>
              <p className="text-xs text-muted-foreground mt-1">Todo está funcionando correctamente</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeAlerts.map(alert => {
                const styles = getSeverityStyles(alert.severity)
                return (
                  <div
                    key={alert.id}
                    className={`p-3 rounded-lg border ${styles.bg} ${styles.border} transition-all duration-200`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${styles.bg} ${styles.icon}`}>
                        {getAlertIcon(alert.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <Badge className={`text-[10px] ${styles.badge}`}>
                            {getAlertTypeName(alert.type)}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {formatTimeAgo(alert.timestamp)}
                          </span>
                        </div>
                        <p className="text-sm text-foreground leading-tight">{alert.message}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-2"
                            onClick={() => handleAcknowledge(alert.id)}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Confirmar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-2 text-muted-foreground"
                            onClick={() => handleDismiss(alert.id)}
                          >
                            <X className="h-3 w-3 mr-1" />
                            Descartar
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          
          {acknowledgedAlerts.length > 0 && (
            <>
              <div className="flex items-center gap-2 my-4">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">Confirmadas ({acknowledgedAlerts.length})</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="space-y-2">
                {acknowledgedAlerts.map(alert => (
                  <div
                    key={alert.id}
                    className="p-2 rounded-lg bg-muted/30 border border-border/50 opacity-60"
                  >
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded bg-muted text-muted-foreground">
                        {getAlertIcon(alert.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground truncate">{alert.message}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={() => handleDismiss(alert.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
