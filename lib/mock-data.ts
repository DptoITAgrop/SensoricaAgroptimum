import type { Finca, Sensor, Alert, AgronomyData, TimeSeriesData, HeatmapData } from './types'

export const fincas: Finca[] = [
  {
    id: 'Casa_Olmo',
    name: 'Casa Olmo',
    location: 'España',
    coordinates: { lat: 38.9942, lng: -1.8585 },
    area: 45,
    variety: 'Kerman'
  },
  {
    id: 'Finca_Antequera',
    name: 'Finca Antequera',
    location: 'España',
    coordinates: { lat: 39.8628, lng: -4.0273 },
    area: 32,
    variety: 'Peter'
  },
  {
    id: 'Valle_Hermoso',
    name: 'Valle Hermoso',
    location: 'España',
    coordinates: { lat: 38.9848, lng: -3.9274 },
    area: 58,
    variety: 'Kerman'
  },
  {
    id: 'Venta_la_Cuesta',
    name: 'Venta la Cuesta',
    location: 'España',
    coordinates: { lat: 39.1234, lng: -3.5678 },
    area: 40,
    variety: 'Kerman'
  }
]

// Los sensores reales se cargarán desde la base de datos MySQL
// Esta es una estructura de fallback
export const sensors: Sensor[] = []

export const alerts: Alert[] = [
  {
    id: 'a1',
    fincaId: 'Casa_Olmo',
    type: 'frost',
    severity: 'critical',
    message: 'Riesgo de helada: Temperatura prevista -2°C esta noche',
    timestamp: new Date(),
    acknowledged: false
  },
  {
    id: 'a2',
    fincaId: 'Finca_Antequera',
    type: 'conductivity',
    severity: 'warning',
    message: 'Conductividad del suelo elevada: 2.4 dS/m',
    timestamp: new Date(Date.now() - 3600000),
    acknowledged: false
  },
  {
    id: 'a3',
    fincaId: 'Valle_Hermoso',
    type: 'humidity',
    severity: 'warning',
    message: 'Humedad del suelo baja',
    timestamp: new Date(Date.now() - 7200000),
    acknowledged: true
  },
  {
    id: 'a4',
    fincaId: 'Venta_la_Cuesta',
    type: 'rain_pollen',
    severity: 'warning',
    message: 'Previsión de lluvia durante floración - riesgo de lavado de polen',
    timestamp: new Date(Date.now() - 1800000),
    acknowledged: false
  }
]

export const agronomyData: AgronomyData[] = [
  {
    fincaId: 'Casa_Olmo',
    chillHours: 892,
    chillHoursTarget: 1000,
    gdd: 245,
    gddBase: 10,
    phenologyStage: 'Pre-brotación',
    lastUpdated: new Date()
  },
  {
    fincaId: 'Finca_Antequera',
    chillHours: 756,
    chillHoursTarget: 1000,
    gdd: 198,
    gddBase: 10,
    phenologyStage: 'Reposo invernal',
    lastUpdated: new Date()
  },
  {
    fincaId: 'Valle_Hermoso',
    chillHours: 945,
    chillHoursTarget: 1000,
    gdd: 312,
    gddBase: 10,
    phenologyStage: 'Inicio brotación',
    lastUpdated: new Date()
  },
  {
    fincaId: 'Venta_la_Cuesta',
    chillHours: 820,
    chillHoursTarget: 1000,
    gdd: 275,
    gddBase: 10,
    phenologyStage: 'Pre-brotación',
    lastUpdated: new Date()
  }
]

// Generate time series data for the last 30 days
export function generateTimeSeriesData(): TimeSeriesData[] {
  const data: TimeSeriesData[] = []
  const now = new Date()
  
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    
    data.push({
      date: date.toISOString().split('T')[0],
      temperature: Math.round((15 + Math.sin(i / 5) * 8 + Math.random() * 4) * 10) / 10,
      humidity: Math.round(60 + Math.sin(i / 3) * 15 + Math.random() * 10),
      soilMoisture: Math.round(35 + Math.cos(i / 4) * 10 + Math.random() * 5),
      conductivity: Math.round((1.5 + Math.sin(i / 6) * 0.5 + Math.random() * 0.3) * 10) / 10,
      precipitation: i % 5 === 0 ? Math.round(Math.random() * 15) : 0
    })
  }
  
  return data
}

// Generate heatmap data for temperature by hour/day
export function generateHeatmapData(): HeatmapData[] {
  const data: HeatmapData[] = []
  const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
  
  for (const day of days) {
    for (let hour = 0; hour < 24; hour++) {
      // Simulate temperature pattern: cooler at night, warmer during day
      const baseTemp = 12
      const hourFactor = Math.sin((hour - 6) * Math.PI / 12) * 8
      const randomFactor = Math.random() * 3 - 1.5
      
      data.push({
        day,
        hour,
        value: Math.round((baseTemp + hourFactor + randomFactor) * 10) / 10
      })
    }
  }
  
  return data
}

// Generate daily chill hours data
export function generateChillHoursData(): { date: string; hours: number; accumulated: number }[] {
  const data: { date: string; hours: number; accumulated: number }[] = []
  const now = new Date()
  let accumulated = 0
  
  for (let i = 59; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    
    // More chill hours in winter months
    const month = date.getMonth()
    const winterFactor = month >= 10 || month <= 2 ? 1.5 : 0.5
    const dailyHours = Math.round(Math.random() * 8 * winterFactor + 4 * winterFactor)
    accumulated += dailyHours
    
    data.push({
      date: date.toISOString().split('T')[0],
      hours: dailyHours,
      accumulated
    })
  }
  
  return data
}

// Generate GDD data
export function generateGDDData(): { date: string; daily: number; accumulated: number }[] {
  const data: { date: string; daily: number; accumulated: number }[] = []
  const now = new Date()
  let accumulated = 0
  
  for (let i = 59; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    
    // More GDD in spring/summer
    const month = date.getMonth()
    const warmFactor = month >= 3 && month <= 8 ? 1.5 : 0.3
    const dailyGDD = Math.round(Math.random() * 10 * warmFactor + 2 * warmFactor)
    accumulated += dailyGDD
    
    data.push({
      date: date.toISOString().split('T')[0],
      daily: dailyGDD,
      accumulated
    })
  }
  
  return data
}
