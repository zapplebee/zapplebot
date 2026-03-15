import { tool, text } from "../bot-tool";
import { z } from "zod";

const MINNEAPOLIS = { lat: 44.915, lon: -93.21, label: "Minnehaha Park, Minneapolis, MN" } as const;

type ForecastPeriod = {
  name: string;
  temperature: number;
  temperatureUnit: string;
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
  detailedForecast: string;
};

type OpenMeteoCurrent = {
  time: string;
  rain: number;
  snowfall: number;
  precipitation: number;
};

type OpenMeteoDaily = {
  time: string[];
  showers_sum: number[];
  snowfall_sum: number[];
  precipitation_sum: number[];
  precipitation_hours: number[];
  rain_sum: number[];
};

type OpenMeteoHourly = {
  time: string[];
  precipitation: number[];
  rain: number[];
  snowfall: number[];
};

function round1(value: number | undefined): number {
  return Number(((value ?? 0) as number).toFixed(1));
}

function sumForToday(times: string[], values: number[], currentTime: string): number {
  const currentDate = currentTime.slice(0, 10);
  let sum = 0;

  // Open-Meteo daily totals cover the whole local day, so we sum hourly values
  // up to "now" to separate what has already happened from what is still projected.
  for (let i = 0; i < times.length; i++) {
    const time = times[i];
    if (!time || !time.startsWith(currentDate) || time > currentTime) continue;
    sum += values[i] ?? 0;
  }

  return round1(sum);
}

function compactSummary(input: {
  location: string;
  currentForecast: string;
  currentTemp: string | null;
  observedSnowToday: number;
  projectedSnowRestOfToday: number;
  observedPrecipToday: number;
  projectedPrecipRestOfToday: number;
}): string {
  const tempPart = input.currentTemp ? `${input.currentTemp}. ` : "";
  return `${input.location}: ${tempPart}${input.currentForecast}. Snow so far today: ${input.observedSnowToday} in, projected additional snow today: ${input.projectedSnowRestOfToday} in. Precip so far today: ${input.observedPrecipToday} in, projected additional precip today: ${input.projectedPrecipRestOfToday} in.`;
}

async function getWeather(location: string) {
  const { lat, lon, label } = MINNEAPOLIS;

  const openMeteoUrl = new URL("https://api.open-meteo.com/v1/forecast");
  openMeteoUrl.searchParams.set("latitude", String(lat));
  openMeteoUrl.searchParams.set("longitude", String(lon));
  openMeteoUrl.searchParams.set("daily", "showers_sum,snowfall_sum,precipitation_sum,precipitation_hours,rain_sum");
  openMeteoUrl.searchParams.set("hourly", "precipitation,rain,snowfall");
  openMeteoUrl.searchParams.set("current", "rain,snowfall,precipitation");
  openMeteoUrl.searchParams.set("timezone", "America/Chicago");
  openMeteoUrl.searchParams.set("wind_speed_unit", "mph");
  openMeteoUrl.searchParams.set("temperature_unit", "fahrenheit");
  openMeteoUrl.searchParams.set("precipitation_unit", "inch");
  openMeteoUrl.searchParams.set("forecast_days", "1");

  const [pointsRes, openMeteoRes] = await Promise.all([
    fetch(`https://api.weather.gov/points/${lat},${lon}`, {
      headers: { "User-Agent": "zapplebot/1.0 (discord bot)" },
    }),
    fetch(openMeteoUrl),
  ]);

  if (!pointsRes.ok) {
    throw new Error(`weather.gov points lookup failed: ${pointsRes.status}`);
  }
  if (!openMeteoRes.ok) {
    throw new Error(`open-meteo forecast failed: ${openMeteoRes.status}`);
  }

  const points = await pointsRes.json() as { properties: { forecast: string; forecastHourly: string } };
  const forecastUrl: string = points.properties.forecast;
  const forecastHourlyUrl: string = points.properties.forecastHourly;

  const openMeteo = await openMeteoRes.json() as {
    current: OpenMeteoCurrent;
    daily: OpenMeteoDaily;
    hourly: OpenMeteoHourly;
  };

  const [forecastRes, hourlyRes] = await Promise.all([
    fetch(forecastUrl, { headers: { "User-Agent": "zapplebot/1.0 (discord bot)" } }),
    fetch(forecastHourlyUrl, { headers: { "User-Agent": "zapplebot/1.0 (discord bot)" } }),
  ]);

  if (!forecastRes.ok) {
    throw new Error(`weather.gov forecast failed: ${forecastRes.status}`);
  }

  const forecast = await forecastRes.json() as { properties: { periods: ForecastPeriod[] } };
  const periods = forecast.properties.periods;

  let currentConditions: {
    temperature: number;
    temperatureUnit: string;
    windSpeed: string;
    windDirection: string;
    shortForecast: string;
  } | null = null;

  if (hourlyRes.ok) {
    const hourly = await hourlyRes.json() as { properties: { periods: ForecastPeriod[] } };
    const now = hourly.properties.periods[0]!;
    currentConditions = {
      temperature: now.temperature,
      temperatureUnit: now.temperatureUnit,
      windSpeed: now.windSpeed,
      windDirection: now.windDirection,
      shortForecast: now.shortForecast,
    };
  }

  const currentTime = openMeteo.current.time;
  const observedPrecipToday = sumForToday(openMeteo.hourly.time, openMeteo.hourly.precipitation, currentTime);
  const observedRainToday = sumForToday(openMeteo.hourly.time, openMeteo.hourly.rain, currentTime);
  const observedSnowToday = sumForToday(openMeteo.hourly.time, openMeteo.hourly.snowfall, currentTime);

  const totalPrecipToday = round1(openMeteo.daily.precipitation_sum[0]);
  const totalRainToday = round1(openMeteo.daily.rain_sum[0]);
  const totalSnowToday = round1(openMeteo.daily.snowfall_sum[0]);
  const precipitationHoursToday = round1(openMeteo.daily.precipitation_hours[0]);

  // Derive "rest of today" by subtracting observed hourly accumulation from
  // the API's all-day totals. Clamp at zero to absorb small timing/rounding drift.
  const projectedPrecipRestOfToday = round1(Math.max(0, totalPrecipToday - observedPrecipToday));
  const projectedRainRestOfToday = round1(Math.max(0, totalRainToday - observedRainToday));
  const projectedSnowRestOfToday = round1(Math.max(0, totalSnowToday - observedSnowToday));

  const currentTemp = currentConditions
    ? `${currentConditions.temperature}°${currentConditions.temperatureUnit}`
    : null;

  return {
    location: label,
    summary: compactSummary({
      location: label,
      currentForecast: currentConditions?.shortForecast ?? "Current forecast unavailable",
      currentTemp,
      observedSnowToday,
      projectedSnowRestOfToday,
      observedPrecipToday,
      projectedPrecipRestOfToday,
    }),
    current: {
      temperature: currentConditions?.temperature ?? null,
      temperatureUnit: currentConditions?.temperatureUnit ?? null,
      windSpeed: currentConditions?.windSpeed ?? null,
      windDirection: currentConditions?.windDirection ?? null,
      shortForecast: currentConditions?.shortForecast ?? null,
      // These are current-period precipitation values from Open-Meteo, in inches.
      precipitationInches: round1(openMeteo.current.precipitation),
      rainInches: round1(openMeteo.current.rain),
      snowfallInches: round1(openMeteo.current.snowfall),
    },
    today: {
      observed: {
        precipitationInches: observedPrecipToday,
        rainInches: observedRainToday,
        snowfallInches: observedSnowToday,
        source: "open_meteo_hourly",
      },
      projected_rest: {
        precipitationInches: projectedPrecipRestOfToday,
        rainInches: projectedRainRestOfToday,
        snowfallInches: projectedSnowRestOfToday,
        source: "open_meteo_daily_minus_hourly",
      },
      total: {
        precipitationInches: totalPrecipToday,
        rainInches: totalRainToday,
        snowfallInches: totalSnowToday,
        precipitationHours: precipitationHoursToday,
        source: "open_meteo_daily",
      },
    },
    forecast: (periods[0] ?? null)
      ? {
          period: periods[0]!.name,
          shortForecast: periods[0]!.shortForecast,
          temperature: `${periods[0]!.temperature}°${periods[0]!.temperatureUnit}`,
          wind: `${periods[0]!.windSpeed} ${periods[0]!.windDirection}`,
        }
      : null,
  };
}

export const weatherTool = tool({
  name: "get_weather",
  description: text`
    Get compact current weather and today's precipitation progress for Minneapolis.
    Uses weather.gov for forecast text and Open-Meteo to distinguish what has already happened today from what is still projected today.
    Always returns Minneapolis weather near Minnehaha Park.
    Returns a short summary plus compact current and today fields in inches. Prefer the summary and today fields over raw interpretation.
  `,
  parameters: {
    location: z
      .string()
      .optional()
      .describe("Optional location hint. Currently ignored; this tool always returns Minneapolis weather."),
  },
  implementation: async ({ location }: { location?: string }) => {
    try {
      return await getWeather(location ?? "default");
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : String(err),
        location: location ?? "Minneapolis",
      };
    }
  },
});
