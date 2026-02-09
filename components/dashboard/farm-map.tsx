// lib/farms-config.ts
// Configuración de sensores por finca con coordenadas GPS reales
// (Temporal) hasta que esto se cargue desde MySQL

export interface SensorConfig {
  id: string
  name: string
  tableName: string
  model: string
  type: 'ambient' | 'soil' | 'humidity'
  devEUI: string
  coordinates: {
    lat: number
    lng: number
  }
  farmId: string
}

export interface FarmConfig {
  id: string
  name: string
  database: string
  coordinates: {
    lat: number
    lng: number
  }
  sensors: SensorConfig[]
}

// Configuración de fincas con sensores
export const farmsConfig: FarmConfig[] = [
  {
    id: 'Finca_Antequera',
    name: 'Finca Antequera',
    database: 'Finca_Antequera',
    coordinates: { lat: 37.11, lng: -4.57 },
    sensors: [
      // --- YA TENÍAS ---
      {
        id: 'parcela_1_2',
        name: 'Parcela 1.2',
        tableName: 'parcela_1_2',
        model: 'NM-TH-EU',
        type: 'ambient',
        devEUI: '24-e1-24-13-6e-31-41-71',
        coordinates: { lat: 37.12, lng: -4.56 },
        farmId: 'Finca_Antequera',
      },
      {
        id: 'parcela_1_2_suelo',
        name: 'Parcela 1.2 Suelo',
        tableName: 'parcela_1_2_suelo',
        model: 'NM-EM500-SMTC-EU',
        type: 'soil',
        devEUI: '24-e1-24-12-6e-39-88-96',
        coordinates: { lat: 37.12, lng: -4.561 },
        farmId: 'Finca_Antequera',
      },
      {
        id: 'parcela_2',
        name: 'Parcela 2',
        tableName: 'parcela_2',
        model: 'NM-EM500-SMTC-EU',
        type: 'soil',
        devEUI: '24-e1-24-12-6e-39-88-24',
        coordinates: { lat: 37.11, lng: -4.56 },
        farmId: 'Finca_Antequera',
      },
      {
        id: 'parcela_3_kerman',
        name: 'Parcela 3 (Kerman)',
        tableName: 'parcela_3_kerman',
        model: 'NM-TH-EU',
        type: 'ambient',
        devEUI: '24-e1-24-13-6e-31-16-42',
        coordinates: { lat: 37.11, lng: -4.57 },
        farmId: 'Finca_Antequera',
      },
      {
        id: 'parcela_3_kerman_suelo',
        name: 'Parcela 3 (Kerman) Suelo',
        tableName: 'parcela_3_kerman_suelo',
        model: 'NM-EM500-SMTC-EU',
        type: 'soil',
        devEUI: '24-e1-24-12-6e-39-53-75',
        coordinates: { lat: 37.11, lng: -4.571 },
        farmId: 'Finca_Antequera',
      },
      {
        id: 'parcela_4_1',
        name: 'Parcela 4.1',
        tableName: 'parcela_4_1',
        model: 'NM-EM500-SMTC-EU',
        type: 'soil',
        devEUI: '24-e1-24-12-6e-39-76-93',
        coordinates: { lat: 37.12, lng: -4.58 },
        farmId: 'Finca_Antequera',
      },

      // --- NUEVOS (de tus capturas) ---
      {
        id: 'parcela_4_2_suelo',
        name: 'Parcela 4.2 Suelo',
        tableName: 'parcela_4_2_suelo',
        model: 'NM-EM500-SMTC-EU',
        type: 'soil',
        devEUI: '24-e1-24-12-6e-39-74-89',
        coordinates: { lat: 37.12, lng: -4.56 },
        farmId: 'Finca_Antequera',
      },
      {
        id: 'parcela_4_3',
        name: 'Parcela 4.3',
        tableName: 'parcela_4_3',
        model: 'NM-EM500-SMTC-EU',
        type: 'soil',
        devEUI: 'TODO_DEV_EUI_PARCELA_4_3', // en tu captura está cortado
        coordinates: { lat: 37.11, lng: -4.58 },
        farmId: 'Finca_Antequera',
      },
      {
        id: 'parcela_5',
        name: 'Parcela 5',
        tableName: 'parcela_5',
        model: 'NM-EM500-SMTC-EU',
        type: 'soil',
        devEUI: '24-e1-24-12-6e-39-59-50',
        coordinates: { lat: 37.11, lng: -4.57 },
        farmId: 'Finca_Antequera',
      },
      {
        id: 'parcela_6_2',
        name: 'Parcela 6.2',
        tableName: 'parcela_6_2',
        model: 'NM-TH-EU',
        type: 'ambient',
        devEUI: '24-e1-24-13-6e-31-09-22',
        coordinates: { lat: 37.11, lng: -4.57 },
        farmId: 'Finca_Antequera',
      },
      {
        id: 'parcela_6_3_suelo',
        name: 'Parcela 6.3 Suelo',
        tableName: 'parcela_6_3_suelo',
        model: 'NM-EM500-SMTC-EU',
        type: 'soil',
        devEUI: '24-e1-24-12-6e-39-68-14',
        coordinates: { lat: 37.1, lng: -4.57 },
        farmId: 'Finca_Antequera',
      },
      {
        id: 'parcela_6x4_nuevo_ambiental',
        name: 'Parcela 6x4 Nuevo Ambiental',
        tableName: 'parcela_6x4_nuevo_ambiental',
        model: 'NM-TH-EU',
        type: 'ambient',
        devEUI: '24-e1-24-13-6e-31-18-84',
        coordinates: { lat: 37.09, lng: -4.6 },
        farmId: 'Finca_Antequera',
      },
      {
        id: 'parcela_6x4_nuevo_suelo',
        name: 'Parcela 6x4 Nuevo Suelo',
        tableName: 'parcela_6x4_nuevo_suelo',
        model: 'NM-EM500-SMTC-EU',
        type: 'soil',
        devEUI: '24-e1-24-12-6e-39-65-99',
        coordinates: { lat: 37.09, lng: -4.6 },
        farmId: 'Finca_Antequera',
      },
    ],
  },

  {
    id: 'Casa_Olmo',
    name: 'Casa Olmo',
    database: 'Casa_Olmo',
    // Centro aproximado (tus sensores están bastante dispersos)
    coordinates: { lat: 39.43, lng: -1.82 },
    sensors: [
      {
        id: 'pvh_estacion_meteo',
        name: 'PVH Estación Meteorológica',
        tableName: 'pvh_estacion_meteorologica',
        model: 'NM-WTS506-EU',
        type: 'ambient',
        devEUI: '24-e1-24-45-4e-27-92-40',
        coordinates: { lat: 38.85, lng: -3.11 },
        farmId: 'Casa_Olmo',
      },
      {
        id: 'em500_pp_1',
        name: 'Pluviómetro (EM500-PP)',
        tableName: 'em500_pp_1',
        model: 'NM-EM500-PP-EU',
        type: 'humidity', // lluvia/precipitación encaja mejor aquí que en soil
        devEUI: '24-e1-24-12-6e-15-68-23',
        coordinates: { lat: 39.43, lng: -1.97 },
        farmId: 'Casa_Olmo',
      },
      {
        id: 'em500_smtc_le_mans_sector_34',
        name: 'Le Mans I · Sector 34 · Suelo',
        tableName: 'le_mans_i_sector_34_suelo',
        model: 'NM-EM500-SMTC-EU',
        type: 'soil',
        devEUI: 'TODO_DEV_EUI_LE_MANS_34_SUELO', // en tu captura se corta al final
        coordinates: { lat: 39.462, lng: -0.327 },
        farmId: 'Casa_Olmo',
      },
      {
        id: 'th_le_mans_sector_34',
        name: 'Le Mans I · Sector 34 · Ambiental',
        tableName: 'le_mans_i_sector_34_ambiental',
        model: 'NM-TH-EU',
        type: 'ambient',
        devEUI: '24-e1-24-13-6e-44-39-99',
        coordinates: { lat: 39.462, lng: -0.327 },
        farmId: 'Casa_Olmo',
      },
      {
        id: 'th_le_mans_sector_40',
        name: 'Le Mans I · Sector 40 · Ambiental',
        tableName: 'le_mans_i_sector_40_ambiental',
        model: 'NM-TH-EU',
        type: 'ambient',
        devEUI: '24-e1-24-13-6e-44-05-70',
        coordinates: { lat: 39.39, lng: -1.96 },
        farmId: 'Casa_Olmo',
      },
      {
        id: 'em500_smtc_le_mans_sector_40',
        name: 'Le Mans I · Sector 40 · Suelo',
        tableName: 'le_mans_i_sector_40_suelo',
        model: 'NM-EM500-SMTC-EU',
        type: 'soil',
        devEUI: '24-e1-24-12-6e-39-78-33',
        coordinates: { lat: 39.39, lng: -1.96 },
        farmId: 'Casa_Olmo',
      },
      {
        id: 'nicosia_suelo',
        name: 'Nicosia · Sensor Suelo',
        tableName: 'nicosia_suelo',
        model: 'NM-EM500-SMTC-EU',
        type: 'soil',
        devEUI: '24-e1-24-12-6e-39-79-45',
        coordinates: { lat: 39.39, lng: -1.97 },
        farmId: 'Casa_Olmo',
      },
      {
        id: 'em500_smtc_40_02',
        name: 'EM500 SMTC (40.02 / -1.70)',
        tableName: 'em500_smtc_40_02',
        model: 'NM-EM500-SMTC-EU',
        type: 'soil',
        devEUI: '24-e1-24-12-6e-21-66-43',
        coordinates: { lat: 40.02, lng: -1.7 },
        farmId: 'Casa_Olmo',
      },
      {
        id: 'em500_smtc_39_462',
        name: 'EM500 SMTC (39.462 / -0.327)',
        tableName: 'em500_smtc_39_462',
        model: 'NM-EM500-SMTC-EU',
        type: 'soil',
        devEUI: '24-e1-24-12-6e-21-54-66',
        coordinates: { lat: 39.462, lng: -0.327 },
        farmId: 'Casa_Olmo',
      },
    ],
  },

  {
    id: 'Valle_Hermoso',
    name: 'Valle Hermoso',
    database: 'Valle_Hermoso',
    coordinates: { lat: 38.98, lng: -3.93 },
    sensors: [],
  },
  {
    id: 'Venta_la_Cuesta',
    name: 'Venta la Cuesta',
    database: 'Venta_la_Cuesta',
    coordinates: { lat: 39.12, lng: -3.57 },
    sensors: [],
  },
]

// Función para obtener el tipo de sensor por modelo
export function getSensorTypeByModel(model: string): 'ambient' | 'soil' | 'humidity' {
  const m = model.toUpperCase()
  if (m.includes('TH') || m.includes('WTS')) return 'ambient'
  if (m.includes('SMTC') || m.includes('EM500')) {
    if (m.includes('PP')) return 'humidity'
    return 'soil'
  }
  return 'humidity'
}

// Colores para cada tipo de sensor en el mapa
export const sensorTypeColors = {
  ambient: '#4ade80', // Verde
  soil: '#f59e0b', // Naranja/Amarillo
  humidity: '#3b82f6', // Azul
}

// Iconos para cada tipo de sensor
export const sensorTypeIcons = {
  ambient: 'thermometer',
  soil: 'layers',
  humidity: 'droplets',
}
