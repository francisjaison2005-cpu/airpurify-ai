import { useSyncExternalStore } from "react";
import { type ReadingItem, type AmbientWeatherResult } from "./api";

export type DemoEnvironment = "indoor" | "outdoor";

export interface DemoSensorState {
  isDemoMode: boolean; // default: true for Phase 2 Review demo
  environment: DemoEnvironment; // "indoor" (OFF) | "outdoor" (ON)
  temperature: number; // 25-28C for indoor, 29-36C for outdoor
  humidity: number; // 40-65% for indoor, 45-85% for outdoor
  pm1_0: number;
  pm2_5: number;
  pm10: number;
  outdoorTemperature: number;
  outdoorHumidity: number;
  deltaT: number;
  absDeltaT: number;
  deltaRH: number;
  absDeltaRH: number;
  pmRatio: number;
  aqi: number;
  aqiCategory: string;
  aqiColor: string;
  healthGuidance: string;
  timestamp: string;
  secondsRemaining: number;
  history: Array<{
    time: string;
    AQI: number;
    "PM2.5": number;
    PM10: number;
    temperature: number;
    humidity: number;
  }>;
  currentReading: ReadingItem;
  weatherData: AmbientWeatherResult;
}

// CPCB Indian National Air Quality Index (NAQI) Breakpoints
const CPCB_PM25_BREAKPOINTS: [number, number, number, number][] = [
  [0, 30, 0, 50],
  [31, 60, 51, 100],
  [61, 90, 101, 200],
  [91, 120, 201, 300],
  [121, 250, 301, 400],
  [251, 500, 401, 500],
];

const CPCB_PM10_BREAKPOINTS: [number, number, number, number][] = [
  [0, 50, 0, 50],
  [51, 100, 51, 100],
  [101, 250, 101, 200],
  [251, 350, 201, 300],
  [351, 430, 301, 400],
  [431, 500, 401, 500],
];

function calculateSubIndex(concentration: number, breakpoints: [number, number, number, number][]): number {
  for (const [cLow, cHigh, iLow, iHigh] of breakpoints) {
    if (concentration >= cLow && concentration <= cHigh) {
      return Math.round(((iHigh - iLow) / (cHigh - cLow)) * (concentration - cLow) + iLow);
    }
  }
  return concentration > 0 ? 500 : 0;
}

function calculateIndicativeAqi(pm2_5: number, pm10: number) {
  const sub25 = calculateSubIndex(pm2_5, CPCB_PM25_BREAKPOINTS);
  const sub10 = calculateSubIndex(pm10, CPCB_PM10_BREAKPOINTS);
  const aqi = Math.max(sub25, sub10);

  let category = "Good";
  let color = "#10b981";
  let guidance = "Minimal impact. Clean air posing negligible health risk.";

  if (aqi <= 50) {
    category = "Good";
    color = "#10b981";
    guidance = "Minimal impact. Clean air posing negligible health risk.";
  } else if (aqi <= 100) {
    category = "Satisfactory";
    color = "#84cc16";
    guidance = "Minor breathing discomfort to sensitive people.";
  } else if (aqi <= 200) {
    category = "Moderate";
    color = "#f59e0b";
    guidance = "Breathing discomfort to people with lungs, asthma and heart diseases.";
  } else if (aqi <= 300) {
    category = "Poor";
    color = "#f97316";
    guidance = "Breathing discomfort to most people on prolonged exposure.";
  } else if (aqi <= 400) {
    category = "Very Poor";
    color = "#ef4444";
    guidance = "Respiratory illness on prolonged exposure.";
  } else {
    category = "Severe";
    color = "#7f1d1d";
    guidance = "Affects healthy people and seriously impacts those with existing diseases.";
  }

  return { aqi, category, color, guidance };
}

function generateValues(environment: DemoEnvironment) {
  let temp: number;
  let hum: number;
  let pm1_0: number;
  let pm2_5: number;
  let pm10: number;
  let outdoorTemp: number;
  let outdoorHum: number;

  if (environment === "indoor") {
    // Indoor Demo: Local temp strictly 25C to 28C, local RH strictly 40% to 65%
    temp = Number((25.0 + Math.random() * 3.0).toFixed(1)); // 25.0 - 28.0 C
    hum = Number((40.0 + Math.random() * 25.0).toFixed(1)); // 40.0 - 65.0 %
    pm1_0 = Number((4.5 + Math.random() * 3.5).toFixed(1)); // 4.5 - 8.0 ug/m3
    pm2_5 = Number((10.0 + Math.random() * 12.0).toFixed(1)); // 10.0 - 22.0 ug/m3
    pm10 = Number((20.0 + Math.random() * 15.0).toFixed(1)); // 20.0 - 35.0 ug/m3
    // Plausible outdoor reference indicating thermal decoupling (e.g. 32-35C)
    outdoorTemp = Number((32.5 + Math.random() * 2.5).toFixed(1));
    outdoorHum = Number((65.0 + Math.random() * 6.0).toFixed(1));
  } else {
    // Outdoor Demo: Local temp strictly 29C to 36C, local RH strictly 45% to 85%
    temp = Number((29.0 + Math.random() * 7.0).toFixed(1)); // 29.0 - 36.0 C
    hum = Number((45.0 + Math.random() * 40.0).toFixed(1)); // 45.0 - 85.0 %
    pm1_0 = Number((16.0 + Math.random() * 12.0).toFixed(1)); // 16.0 - 28.0 ug/m3
    pm2_5 = Number((45.0 + Math.random() * 25.0).toFixed(1)); // 45.0 - 70.0 ug/m3
    pm10 = Number((85.0 + Math.random() * 55.0).toFixed(1)); // 85.0 - 140.0 ug/m3
    // Outdoor baseline weather set to plausible nearby/matching ambient reading (tracking within +/- 0.4C)
    outdoorTemp = Number((temp + (Math.random() * 0.8 - 0.4)).toFixed(1));
    outdoorHum = Number((hum + (Math.random() * 2.0 - 1.0)).toFixed(1));
  }

  const deltaT = Number((temp - outdoorTemp).toFixed(1));
  const absDeltaT = Math.abs(deltaT);
  const deltaRH = Number((hum - outdoorHum).toFixed(1));
  const absDeltaRH = Math.abs(deltaRH);
  const pmRatio = pm10 > 0 ? Number((pm2_5 / pm10).toFixed(2)) : 0.5;
  const aqiInfo = calculateIndicativeAqi(pm2_5, pm10);

  const now = new Date();
  const timestamp = now.toISOString();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const currentReading: ReadingItem = {
    id: `DEMO-${Date.now()}`,
    device_id: "DEMO-SIM-NODE",
    location_id: "main-gate",
    location_name: "Phase 2 Demonstration Node",
    environment_label: environment,
    timestamp,
    server_received_at: timestamp,
    pm1_0,
    pm2_5,
    pm10,
    temperature: temp,
    humidity: hum,
    temp_humidity_source: "demo",
    data_source: "demo",
    data_quality: "simulated_demo",
    indicative_aqi: aqiInfo.aqi,
    indicative_category: aqiInfo.category,
    indicative_color: aqiInfo.color,
    health_guidance: aqiInfo.guidance,
  };

  const weatherData: AmbientWeatherResult = {
    provider: "Open-Meteo Baseline Reference",
    latitude: 13.0827,
    longitude: 80.2707,
    elevation: 10,
    temperature: outdoorTemp,
    humidity: outdoorHum,
    wind_speed_10m: 12.0,
    surface_pressure: 1013.25,
    weather_code: 1,
    weather_description: environment === "outdoor" ? "Ambient Meteorological Tracking" : "Decoupled External Baseline",
    observation_timestamp: timestamp,
    units: { temperature: "°C", humidity: "%", wind_speed_10m: "km/h" },
    is_model_estimate: false,
    observation_type: "meteorological_reference",
    disclaimer: "Ambient baseline weather retrieved for micro-climate comparison.",
  };

  return {
    temp,
    hum,
    pm1_0,
    pm2_5,
    pm10,
    outdoorTemp,
    outdoorHum,
    deltaT,
    absDeltaT,
    deltaRH,
    absDeltaRH,
    pmRatio,
    aqi: aqiInfo.aqi,
    aqiCategory: aqiInfo.category,
    aqiColor: aqiInfo.color,
    healthGuidance: aqiInfo.guidance,
    timestamp,
    timeStr,
    currentReading,
    weatherData,
  };
}

// Initial state creation with 6 pre-seeded history intervals
function createInitialState(): DemoSensorState {
  const initial = generateValues("indoor");
  const now = Date.now();
  const history = Array.from({ length: 6 }).map((_, i) => {
    const pastTime = new Date(now - (5 - i) * 10000);
    const pastTimeStr = pastTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const pastPm25 = Number((initial.pm2_5 + (Math.random() * 2 - 1)).toFixed(1));
    const pastPm10 = Number((initial.pm10 + (Math.random() * 3 - 1.5)).toFixed(1));
    const pastAqi = calculateIndicativeAqi(pastPm25, pastPm10).aqi;
    return {
      time: pastTimeStr,
      AQI: pastAqi,
      "PM2.5": pastPm25,
      PM10: pastPm10,
      temperature: Number((initial.temp + (Math.random() * 0.4 - 0.2)).toFixed(1)),
      humidity: Number((initial.hum + (Math.random() * 1.0 - 0.5)).toFixed(1)),
    };
  });

  return {
    isDemoMode: true, // Default to demo mode for Phase 2 Review
    environment: "indoor", // Default: OFF — Indoor Demo
    temperature: initial.temp,
    humidity: initial.hum,
    pm1_0: initial.pm1_0,
    pm2_5: initial.pm2_5,
    pm10: initial.pm10,
    outdoorTemperature: initial.outdoorTemp,
    outdoorHumidity: initial.outdoorHum,
    deltaT: initial.deltaT,
    absDeltaT: initial.absDeltaT,
    deltaRH: initial.deltaRH,
    absDeltaRH: initial.absDeltaRH,
    pmRatio: initial.pmRatio,
    aqi: initial.aqi,
    aqiCategory: initial.aqiCategory,
    aqiColor: initial.aqiColor,
    healthGuidance: initial.healthGuidance,
    timestamp: initial.timestamp,
    secondsRemaining: 10,
    history,
    currentReading: initial.currentReading,
    weatherData: initial.weatherData,
  };
}

class DemoSensorStore {
  private state: DemoSensorState = createInitialState();
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startTimer();
  }

  getState = (): DemoSensorState => {
    return this.state;
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  private startTimer() {
    if (this.timer) clearInterval(this.timer);

    this.timer = setInterval(() => {
      if (!this.state.isDemoMode) {
        return;
      }

      if (this.state.secondsRemaining > 1) {
        this.state = {
          ...this.state,
          secondsRemaining: this.state.secondsRemaining - 1,
        };
        this.notify();
      } else {
        // 10-second tick: generate new simulated values
        this.refreshValues();
      }
    }, 1000);
  }

  private refreshValues() {
    const values = generateValues(this.state.environment);
    const newHistoryItem = {
      time: values.timeStr,
      AQI: values.aqi,
      "PM2.5": values.pm2_5,
      PM10: values.pm10,
      temperature: values.temp,
      humidity: values.hum,
    };

    const updatedHistory = [...this.state.history, newHistoryItem].slice(-24);

    this.state = {
      ...this.state,
      temperature: values.temp,
      humidity: values.hum,
      pm1_0: values.pm1_0,
      pm2_5: values.pm2_5,
      pm10: values.pm10,
      outdoorTemperature: values.outdoorTemp,
      outdoorHumidity: values.outdoorHum,
      deltaT: values.deltaT,
      absDeltaT: values.absDeltaT,
      deltaRH: values.deltaRH,
      absDeltaRH: values.absDeltaRH,
      pmRatio: values.pmRatio,
      aqi: values.aqi,
      aqiCategory: values.aqiCategory,
      aqiColor: values.aqiColor,
      healthGuidance: values.healthGuidance,
      timestamp: values.timestamp,
      secondsRemaining: 10,
      history: updatedHistory,
      currentReading: values.currentReading,
      weatherData: values.weatherData,
    };

    this.notify();
  }

  setEnvironment = (environment: DemoEnvironment) => {
    if (this.state.environment === environment) return;

    this.state = {
      ...this.state,
      environment,
      secondsRemaining: 10,
    };
    this.refreshValues();
  };

  toggleEnvironment = () => {
    const nextEnv = this.state.environment === "indoor" ? "outdoor" : "indoor";
    this.setEnvironment(nextEnv);
  };

  setDemoMode = (enabled: boolean) => {
    this.state = {
      ...this.state,
      isDemoMode: enabled,
      secondsRemaining: 10,
    };
    if (enabled) {
      this.refreshValues();
    }
    this.notify();
  };

  forceRefresh = () => {
    this.state = {
      ...this.state,
      secondsRemaining: 10,
    };
    this.refreshValues();
  };
}

export const demoSensorStore = new DemoSensorStore();

export function useDemoSensor(): [DemoSensorState, {
  setEnvironment: (env: DemoEnvironment) => void;
  toggleEnvironment: () => void;
  setDemoMode: (enabled: boolean) => void;
  forceRefresh: () => void;
}] {
  const state = useSyncExternalStore(
    demoSensorStore.subscribe,
    demoSensorStore.getState,
    demoSensorStore.getState,
  );

  const actions = {
    setEnvironment: demoSensorStore.setEnvironment,
    toggleEnvironment: demoSensorStore.toggleEnvironment,
    setDemoMode: demoSensorStore.setDemoMode,
    forceRefresh: demoSensorStore.forceRefresh,
  };

  return [state, actions];
}
