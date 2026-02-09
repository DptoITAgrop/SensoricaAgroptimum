export interface Finca {
  id: string
  name: string
  location: string
  coordinates: {
    lat: number
    lng: number
  }
  area: number // hectáreas
  variety: string
}

export interface Sensor {
  id: string
  fincaId: string
  type: 'ambient' | 'soil' | 'humidity'
  name: string
  coordinates: {
    lat: number
    lng: number
  }
  lastReading: SensorReading
  status: 'ok' | 'warning' | 'alert'
}

export interface SensorReading {
  timestamp: Date
  temperature?: number
  humidity?: number
  soilMoisture?: number
  conductivity?: number
  precipitation?: number
}

export interface Alert {
  id: string
  fincaId: string
  sensorId?: string
  type: 'frost' | 'conductivity' | 'humidity' | 'rain_pollen'
  severity: 'normal' | 'warning' | 'critical'
  message: string
  timestamp: Date
  acknowledged: boolean
}

export interface AgronomyData {
  fincaId: string
  chillHours: number // Horas Frío acumuladas
  chillHoursTarget: number
  gdd: number // Growing Degree Days
  gddBase: number
  phenologyStage: string
  lastUpdated: Date
}

export interface TimeSeriesData {
  date: string
  temperature: number
  humidity: number
  soilMoisture: number
  conductivity: number
  precipitation: number
}

export interface HeatmapData {
  day: string
  hour: number
  value: number
}
