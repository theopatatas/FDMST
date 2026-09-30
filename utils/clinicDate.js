const CLINIC_TIME_ZONE = "Asia/Manila";

const clinicDateKey = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CLINIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
};

const parseDateKey = (key) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key || ""))) return null;
  const date = new Date(`${key}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === key ? date : null;
};

const addDays = (key, days) => {
  const date = parseDateKey(key);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const clinicDayStart = (key) => new Date(`${key}T00:00:00+08:00`);
const clinicDayEnd = (key) => new Date(clinicDayStart(addDays(key, 1)).getTime() - 1);

module.exports = { addDays, clinicDateKey, clinicDayStart, clinicDayEnd, parseDateKey };
