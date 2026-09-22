const { addDays, clinicDateKey, clinicDayStart, parseDateKey } = require("../utils/clinicDate");
const HISTORY_DAYS = 84;
const ACTIVE_STATUSES = new Set(["pending", "confirmed", "follow_up", "checked_in", "in_consultation", "completed", "no_show"]);
const SCHEDULED_STATUSES = new Set(["pending", "confirmed", "follow_up", "checked_in", "in_consultation"]);
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DEFAULT_WORKING_DAYS = WEEKDAYS.filter((day) => day !== "Sunday");

const weekdayFor = (key) => WEEKDAYS[parseDateKey(key).getUTCDay()];

const buildAppointmentForecast = ({ targetDate, appointments, workingDays = DEFAULT_WORKING_DAYS, today = clinicDateKey() }) => {
  const working = new Set(Array.isArray(workingDays) ? workingDays : DEFAULT_WORKING_DAYS);
  const historyStart = addDays(today, -HISTORY_DAYS);
  const counts = new Map();
  const scheduled = new Map();

  for (const appointment of appointments) {
    const key = clinicDateKey(appointment.appointmentDate);
    if (key >= historyStart && key < today && ACTIVE_STATUSES.has(appointment.status)) {
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    if (key >= targetDate && key <= addDays(targetDate, 6) && SCHEDULED_STATUSES.has(appointment.status)) {
      scheduled.set(key, (scheduled.get(key) || 0) + 1);
    }
  }

  const history = Array.from({ length: HISTORY_DAYS }, (_, index) => {
    const date = addDays(historyStart, index);
    return { date, weekday: weekdayFor(date), count: counts.get(date) || 0 };
  }).filter((day) => working.has(day.weekday));
  const historyAppointments = history.reduce((total, day) => total + day.count, 0);
  const overallAverage = history.length ? historyAppointments / history.length : 0;

  const days = Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(targetDate, offset);
    const weekday = weekdayFor(date);
    const booked = scheduled.get(date) || 0;
    const comparable = history.filter((day) => day.weekday === weekday);
    const isWorkingDay = working.has(weekday);
    if (!isWorkingDay || historyAppointments < 5 || comparable.length < 4) {
      return { date, weekday, booked, forecast: null, low: null, high: null, isWorkingDay, comparableDays: comparable.length };
    }

    const weekdayAverage = comparable.reduce((total, day) => total + day.count, 0) / comparable.length;
    const baseline = weekdayAverage * 0.75 + overallAverage * 0.25;
    const forecast = Math.max(booked, Math.round(baseline));
    const variance = comparable.reduce((total, day) => total + (day.count - weekdayAverage) ** 2, 0) / comparable.length;
    const spread = Math.max(1, Math.round(Math.sqrt(variance)));
    return {
      date,
      weekday,
      booked,
      forecast,
      low: Math.max(booked, forecast - spread),
      high: Math.max(booked, forecast + spread),
      isWorkingDay,
      comparableDays: comparable.length,
    };
  });

  return { selected: days[0], days, historyDays: history.length, historyAppointments, historyStart, historyEnd: addDays(today, -1) };
};

const generateForecastInsight = async (forecast, service = "") => {
  if (!process.env.OPENROUTER_API_KEY) return { status: "not_configured" };
  if (forecast.selected.forecast === null) return { status: "insufficient_data" };

  const selected = forecast.selected;
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 180,
        provider: { require_parameters: true },
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "appointment_forecast_insight",
            strict: true,
            schema: {
              type: "object",
              properties: {
                insight: { type: "string" },
                action: { type: "string" },
              },
              required: ["insight", "action"],
              additionalProperties: false,
            },
          },
        },
        messages: [
          { role: "system", content: "You summarize dental clinic appointment forecasts. Use only the aggregate counts provided. Write one short, cautious observation and one practical staffing or scheduling action. Do not invent causes, patients, revenue, or certainty. Do not provide medical advice." },
          { role: "user", content: JSON.stringify({ date: selected.date, weekday: selected.weekday, service: service || "All services", existingBookings: selected.booked, forecast: selected.forecast, estimatedRange: [selected.low, selected.high], comparableWeekdays: selected.comparableDays, historyDays: forecast.historyDays, historyAppointments: forecast.historyAppointments }) },
        ],
      }),
    });
    if (!response.ok) return { status: "unavailable" };
    const result = await response.json();
    const content = JSON.parse(result.choices?.[0]?.message?.content || "null");
    if (typeof content?.insight !== "string" || typeof content?.action !== "string") return { status: "unavailable" };
    return { status: "ready", insight: content.insight.slice(0, 300), action: content.action.slice(0, 200) };
  } catch {
    return { status: "unavailable" };
  }
};

module.exports = { addDays, buildAppointmentForecast, clinicDateKey, clinicDayStart, generateForecastInsight, parseDateKey };
