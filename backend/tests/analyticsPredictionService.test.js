const test = require("node:test");
const assert = require("node:assert/strict");

const {
  addDays,
  buildAppointmentForecast,
  clinicDateKey,
  clinicDayStart,
  generateForecastInsight,
  parseDateKey,
} = require("../services/analyticsPredictionService");

test("clinic date helpers preserve Manila appointment dates and reject invalid dates", () => {
  assert.equal(clinicDateKey(new Date("2026-07-14T16:00:00.000Z")), "2026-07-15");
  assert.equal(clinicDayStart("2026-07-15").toISOString(), "2026-07-14T16:00:00.000Z");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(parseDateKey("2026-02-30"), null);
});

test("forecast uses comparable weekdays, booked appointments, and clinic working days", () => {
  const today = "2026-09-22";
  const targetDate = "2026-09-23";
  const appointments = [];
  for (let week = 1; week <= 8; week += 1) {
    const date = addDays(targetDate, -7 * week);
    appointments.push({ appointmentDate: clinicDayStart(date), status: "completed" });
    appointments.push({ appointmentDate: clinicDayStart(date), status: "completed" });
    appointments.push({ appointmentDate: clinicDayStart(date), status: "cancelled" });
  }
  appointments.push({ appointmentDate: clinicDayStart(targetDate), status: "confirmed" });

  const result = buildAppointmentForecast({ targetDate, appointments, today });
  assert.equal(result.selected.booked, 1);
  assert.ok(result.selected.forecast >= 1);
  assert.ok(result.selected.low >= result.selected.booked);
  assert.equal(result.historyAppointments, 16);
  assert.equal(result.days[4].weekday, "Sunday");
  assert.equal(result.days[4].forecast, null);
});

test("forecast reports insufficient history instead of inventing a number", () => {
  const result = buildAppointmentForecast({
    targetDate: "2026-09-23",
    today: "2026-09-22",
    appointments: [{ appointmentDate: clinicDayStart("2026-09-23"), status: "pending" }],
  });
  assert.equal(result.selected.booked, 1);
  assert.equal(result.selected.forecast, null);
});

test("AI request receives aggregate data and returns validated text", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-key";
  const forecast = buildAppointmentForecast({
    targetDate: "2026-09-23",
    today: "2026-09-22",
    appointments: Array.from({ length: 8 }, (_, index) => ({
      appointmentDate: clinicDayStart(addDays("2026-09-23", -(index + 1) * 7)),
      status: "completed",
    })),
  });
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const data = JSON.parse(body.messages[1].content);
    assert.equal(data.date, "2026-09-23");
    assert.equal(data.existingBookings, 0);
    assert.ok(!body.messages[1].content.includes("patientName"));
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ insight: "Demand may be steady.", action: "Review the schedule." }) } }] }) };
  };
  try {
    const result = await generateForecastInsight(forecast);
    assert.deepEqual(result, { status: "ready", insight: "Demand may be steady.", action: "Review the schedule." });
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
});
