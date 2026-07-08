const express = require("express");

const Appointment = require("../models/Appointment");
const DentalRecord = require("../models/DentalRecord");
const Feedback = require("../models/Feedback");
const Inventory = require("../models/Inventory");
const Notification = require("../models/Notification");
const Patient = require("../models/Patient");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const asyncHandler = require("../utils/asyncHandler");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

const OFFICIAL_SERVICES = [
  "Dental Radiographs",
  "Oral Surgery",
  "Veneers",
  "Tooth Sealant",
  "Fluoride Treatment",
  "Braces / Orthodontic Treatment",
  "Tooth Extraction",
  "Dental Restoration",
  "Crowns / Caps",
  "Fixed Partial Dentures (FPD)",
  "Dentures",
  "Oral Prophylaxis / Cleaning",
  "Root Canal Therapy (RCT)",
  "Oral Check-up",
];

const SERVICE_ALIASES = {
  "braces": "Braces / Orthodontic Treatment",
  "orthodontic braces": "Braces / Orthodontic Treatment",
  "orthodontic treatment": "Braces / Orthodontic Treatment",
  "cleaning": "Oral Prophylaxis / Cleaning",
  "oral prophylaxis": "Oral Prophylaxis / Cleaning",
  "prophylaxis": "Oral Prophylaxis / Cleaning",
  "root canal": "Root Canal Therapy (RCT)",
  "root canal therapy": "Root Canal Therapy (RCT)",
  "rct": "Root Canal Therapy (RCT)",
  "check-up": "Oral Check-up",
  "checkup": "Oral Check-up",
  "oral checkup": "Oral Check-up",
  "oral check-up": "Oral Check-up",
  "extraction": "Tooth Extraction",
  "tooth filling": "Dental Restoration",
  "composite filling": "Dental Restoration",
  "restoration": "Dental Restoration",
  "crowns": "Crowns / Caps",
  "caps": "Crowns / Caps",
  "fpd": "Fixed Partial Dentures (FPD)",
  "fixed partial dentures": "Fixed Partial Dentures (FPD)",
};

const PREVENTIVE_SERVICES = new Set([
  "Dental Radiographs",
  "Tooth Sealant",
  "Fluoride Treatment",
  "Oral Prophylaxis / Cleaning",
  "Oral Check-up",
]);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const normalizeService = (value) => {
  const rawValue = String(value || "Unspecified").trim();
  const lowerValue = rawValue.toLowerCase();
  const officialMatch = OFFICIAL_SERVICES.find((service) => service.toLowerCase() === lowerValue);
  return officialMatch || SERVICE_ALIASES[lowerValue] || rawValue;
};

const normalizeDentist = (value) => String(value || "Unassigned").trim() || "Unassigned";

const fullName = (value) => [value?.firstName, value?.lastName].filter(Boolean).join(" ").trim();

const getMonthKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const getMonthLabel = (monthKey) => {
  const [year, month] = String(monthKey).split("-");
  const monthIndex = Number(month) - 1;
  return Number.isFinite(monthIndex) && MONTHS[monthIndex] ? `${MONTHS[monthIndex]} ${year}` : monthKey;
};

const getDateKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toISOString().slice(0, 10);
};

const getWeekKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const day = date.getDay();
  const difference = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date);
  monday.setDate(difference);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
};

const getHourKey = (timeValue) => {
  const match = String(timeValue || "").match(/^(\d{1,2})/);
  const hour = match ? Math.min(Math.max(Number(match[1]), 0), 23) : null;
  if (hour === null || Number.isNaN(hour)) return "Unspecified";
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:00 ${suffix}`;
};

const getAge = (dateOfBirth) => {
  if (!dateOfBirth) return null;
  const birthDate = new Date(dateOfBirth);
  if (Number.isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDifference = today.getMonth() - birthDate.getMonth();
  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
};

const ageGroup = (age) => {
  if (age === null) return "Unknown";
  if (age <= 12) return "0-12";
  if (age <= 19) return "13-19";
  if (age <= 35) return "20-35";
  if (age <= 50) return "36-50";
  if (age <= 64) return "51-64";
  return "65+";
};

const increment = (map, key, amount = 1) => {
  map.set(key, (map.get(key) || 0) + amount);
};

const asSeries = (map, { limit, labels } = {}) => {
  const rows = labels
    ? labels.map((label) => ({ label, value: map.get(label) || 0 }))
    : [...map.entries()].map(([label, value]) => ({ label, value }));

  const sortedRows = labels ? rows : rows.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  return typeof limit === "number" ? sortedRows.slice(0, limit) : sortedRows;
};

const lastMonthKeys = (count = 12) => {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const value = new Date(now.getFullYear(), now.getMonth() - (count - index - 1), 1);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
  });
};

const calculateChange = (current, previous) => {
  const currentValue = Number(current || 0);
  const previousValue = Number(previous || 0);

  if (!previousValue && !currentValue) {
    return {
      value: 0,
      status: "neutral",
      current: currentValue,
      previous: previousValue,
    };
  }

  if (!previousValue) {
    return {
      value: currentValue * 100,
      status: "increase",
      current: currentValue,
      previous: previousValue,
    };
  }

  const value = Number((((currentValue - previousValue) / previousValue) * 100).toFixed(1));

  return {
    value,
    status: value > 0 ? "increase" : value < 0 ? "decrease" : "neutral",
    current: currentValue,
    previous: previousValue,
  };
};

const getAnalyticsFilters = (query = {}) => {
  const appointmentQuery = {};

  if (query.startDate || query.endDate) {
    appointmentQuery.appointmentDate = {};
    if (query.startDate) appointmentQuery.appointmentDate.$gte = startOfDay(query.startDate);
    if (query.endDate) appointmentQuery.appointmentDate.$lte = endOfDay(query.endDate);
  }

  if (query.dentist) appointmentQuery.dentistName = query.dentist;
  if (query.service) appointmentQuery.service = query.service;
  if (query.status) appointmentQuery.status = query.status;

  return appointmentQuery;
};

const getAnalyticsBaseFilters = (query = {}) => {
  const baseQuery = {};
  if (query.dentist) baseQuery.dentistName = query.dentist;
  if (query.service) baseQuery.service = query.service;
  if (query.status) baseQuery.status = query.status;
  return baseQuery;
};

const buildKpiStats = (appointments, monthlyAppointments, comparisonRange = null) => {
  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());
  const now = new Date();
  const currentMonthStart = comparisonRange?.currentStart || new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthEnd = comparisonRange?.currentEnd || new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const previousMonthStart = comparisonRange?.previousStart || new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthEnd = comparisonRange?.previousEnd || new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  const previousTodayDay = Math.min(now.getDate(), previousMonthEnd.getDate());
  const previousTodayStart = new Date(now.getFullYear(), now.getMonth() - 1, previousTodayDay);
  previousTodayStart.setHours(0, 0, 0, 0);
  const previousTodayEnd = endOfDay(previousTodayStart);
  const isNoShow = (item) => item.status === "no_show" || /no[-\s]?show/i.test(item.notes || "");
  const getCounts = (items, { todayRange, upcomingReference = now } = {}) => ({
    totalAppointments: items.length,
    todaysAppointments: items.filter((item) => {
      const date = new Date(item.appointmentDate);
      const range = todayRange || { start: todayStart, end: todayEnd };
      return date >= range.start && date <= range.end && item.status !== "cancelled";
    }).length,
    upcomingAppointments: items.filter((item) => (
      new Date(item.appointmentDate) > upcomingReference && ["pending", "confirmed"].includes(item.status)
    )).length,
    completedAppointments: items.filter((item) => item.status === "completed").length,
    pendingAppointments: items.filter((item) => item.status === "pending").length,
    cancelledAppointments: items.filter((item) => item.status === "cancelled").length,
    noShowAppointments: items.filter(isNoShow).length,
  });

  const currentPeriodAppointments = monthlyAppointments.filter((item) => {
    const date = new Date(item.appointmentDate || item.createdAt);
    return date >= currentMonthStart && date <= currentMonthEnd;
  });
  const previousPeriodAppointments = monthlyAppointments.filter((item) => {
    const date = new Date(item.appointmentDate || item.createdAt);
    return date >= previousMonthStart && date <= previousMonthEnd;
  });
  const currentCounts = getCounts(currentPeriodAppointments, {
    todayRange: { start: todayStart, end: todayEnd },
    upcomingReference: now,
  });
  const previousCounts = getCounts(previousPeriodAppointments, {
    todayRange: { start: previousTodayStart, end: previousTodayEnd },
    upcomingReference: previousTodayEnd,
  });
  const totalCounts = getCounts(appointments);

  return {
    ...totalCounts,
    monthlyChange: Object.fromEntries(
      Object.keys(totalCounts).map((key) => [key, calculateChange(currentCounts[key], previousCounts[key])]),
    ),
  };
};

const buildServiceAnalytics = (appointments) => {
  const serviceCounts = new Map(OFFICIAL_SERVICES.map((service) => [service, 0]));
  const monthlyCounts = new Map();
  const serviceMonthCounts = new Map();
  const currentStart = new Date();
  currentStart.setDate(currentStart.getDate() - 30);
  const previousStart = new Date();
  previousStart.setDate(previousStart.getDate() - 60);
  const currentCounts = new Map();
  const previousCounts = new Map();

  appointments.forEach((appointment) => {
    const service = normalizeService(appointment.service);
    const monthKey = getMonthKey(appointment.appointmentDate || appointment.createdAt);
    const date = new Date(appointment.appointmentDate || appointment.createdAt);
    increment(serviceCounts, service);
    increment(monthlyCounts, monthKey);
    serviceMonthCounts.set(`${service}__${monthKey}`, (serviceMonthCounts.get(`${service}__${monthKey}`) || 0) + 1);

    if (!Number.isNaN(date.getTime())) {
      if (date >= currentStart) increment(currentCounts, service);
      else if (date >= previousStart && date < currentStart) increment(previousCounts, service);
    }
  });

  const growthRows = [...serviceCounts.keys()].map((service) => {
    const current = currentCounts.get(service) || 0;
    const previous = previousCounts.get(service) || 0;
    return { label: service, value: current - previous, current, previous };
  });

  const monthKeys = lastMonthKeys();

  return {
    officialServices: OFFICIAL_SERVICES,
    distribution: asSeries(serviceCounts),
    mostRequested: asSeries(serviceCounts, { limit: 8 }),
    monthlyTrend: monthKeys.map((key) => ({ label: getMonthLabel(key), value: monthlyCounts.get(key) || 0 })),
    serviceTrendMatrix: asSeries(serviceCounts, { limit: 6 }).map((service) => ({
      label: service.label,
      values: monthKeys.map((key) => serviceMonthCounts.get(`${service.label}__${key}`) || 0),
    })),
    fastestGrowing: growthRows.filter((item) => item.value > 0).sort((a, b) => b.value - a.value).slice(0, 5),
    fastestDeclining: growthRows.filter((item) => item.value < 0).sort((a, b) => a.value - b.value).slice(0, 5),
  };
};

const buildAppointmentAnalytics = (appointments) => {
  const statusCounts = new Map();
  const monthlyCounts = new Map();
  const weeklyCounts = new Map();
  const dailyCounts = new Map();
  const hourCounts = new Map();
  const weekdayCounts = new Map(WEEKDAYS.map((day) => [day, 0]));
  const completed = appointments.filter((appointment) => appointment.status === "completed").length;
  const cancelled = appointments.filter((appointment) => appointment.status === "cancelled").length;
  const noShow = appointments.filter((appointment) => /no[-\s]?show/i.test(appointment.notes || "")).length;

  appointments.forEach((appointment) => {
    const date = new Date(appointment.appointmentDate || appointment.createdAt);
    increment(statusCounts, appointment.status || "unknown");
    increment(monthlyCounts, getMonthKey(appointment.appointmentDate || appointment.createdAt));
    increment(weeklyCounts, getWeekKey(appointment.appointmentDate || appointment.createdAt));
    increment(dailyCounts, getDateKey(appointment.appointmentDate || appointment.createdAt));
    increment(hourCounts, getHourKey(appointment.appointmentTime));
    if (!Number.isNaN(date.getTime())) increment(weekdayCounts, WEEKDAYS[date.getDay()]);
  });

  const monthKeys = lastMonthKeys();
  const dailyTrend = [...dailyCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-14)
    .map(([label, value]) => ({ label, value }));
  const weeklyTrend = [...weeklyCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-12)
    .map(([label, value]) => ({ label: `Week of ${label}`, value }));

  return {
    statusDistribution: asSeries(statusCounts),
    dailyTrend,
    weeklyTrend,
    monthlyTrend: monthKeys.map((key) => ({ label: getMonthLabel(key), value: monthlyCounts.get(key) || 0 })),
    peakHours: asSeries(hourCounts, { limit: 8 }),
    busiestDays: asSeries(weekdayCounts, { labels: WEEKDAYS }),
    completionRate: appointments.length ? Math.round((completed / appointments.length) * 100) : 0,
    cancellationRate: appointments.length ? Math.round((cancelled / appointments.length) * 100) : 0,
    noShowRate: appointments.length ? Math.round((noShow / appointments.length) * 100) : 0,
  };
};

const buildPatientAnalytics = (patients, appointments) => {
  const ageCounts = new Map(["0-12", "13-19", "20-35", "36-50", "51-64", "65+", "Unknown"].map((label) => [label, 0]));
  const genderCounts = new Map();
  const registrationCounts = new Map();
  const appointmentCounts = new Map();
  const followUpCounts = new Map();

  patients.forEach((patient) => {
    increment(ageCounts, ageGroup(getAge(patient.dateOfBirth)));
    increment(genderCounts, patient.gender || "Not specified");
    increment(registrationCounts, getMonthKey(patient.createdAt));
  });

  appointments.forEach((appointment) => {
    const key = String(appointment.patient || appointment.email || appointment.patientName || "Unknown");
    increment(appointmentCounts, key);
    if (/follow|check/i.test(`${appointment.reason || ""} ${appointment.service || ""}`)) {
      increment(followUpCounts, key);
    }
  });

  const returningPatients = [...appointmentCounts.values()].filter((count) => count > 1).length;
  const newPatients = Math.max(patients.length - returningPatients, 0);
  const monthKeys = lastMonthKeys();

  return {
    newVsReturning: [
      { label: "New", value: newPatients },
      { label: "Returning", value: returningPatients },
    ],
    activePatients: patients.filter((patient) => patient.status === "active").length,
    ageDistribution: asSeries(ageCounts, { labels: ["0-12", "13-19", "20-35", "36-50", "51-64", "65+", "Unknown"] }),
    genderDistribution: asSeries(genderCounts),
    followUps: [...followUpCounts.values()].reduce((total, count) => total + count, 0),
    frequentPatients: [...appointmentCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([key, value]) => {
        const patient = patients.find((item) => String(item._id) === key || item.email === key || fullName(item) === key);
        return { label: fullName(patient) || key, value };
      }),
    registrationTrend: monthKeys.map((key) => ({ label: getMonthLabel(key), value: registrationCounts.get(key) || 0 })),
  };
};

const buildTreatmentAnalytics = (records, appointments) => {
  const procedureCounts = new Map();
  const dentistProcedureCounts = new Map();
  let preventive = 0;
  let corrective = 0;

  records.forEach((record) => {
    const procedure = String(record.procedure || record.treatment || record.diagnosis || "Unspecified").trim();
    increment(procedureCounts, procedure);
    const dentist = normalizeDentist(record.dentistName);
    dentistProcedureCounts.set(dentist, (dentistProcedureCounts.get(dentist) || 0) + 1);
  });

  appointments.forEach((appointment) => {
    const service = normalizeService(appointment.service);
    if (PREVENTIVE_SERVICES.has(service)) preventive += 1;
    else corrective += 1;
  });

  const completedAppointments = appointments.filter((item) => item.status === "completed").length;
  const cancelledAppointments = appointments.filter((item) => item.status === "cancelled").length;
  const followUps = appointments.filter((item) => /follow|check/i.test(`${item.reason || ""} ${item.service || ""}`));
  const completedFollowUps = followUps.filter((item) => item.status === "completed").length;

  return {
    mostCommonProcedures: asSeries(procedureCounts, { limit: 8 }),
    completionRate: appointments.length ? Math.round((completedAppointments / appointments.length) * 100) : 0,
    followUpCompliance: followUps.length ? Math.round((completedFollowUps / followUps.length) * 100) : 0,
    preventiveVsCorrective: [
      { label: "Preventive", value: preventive },
      { label: "Corrective", value: corrective },
    ],
    completedVsCancelled: [
      { label: "Completed", value: completedAppointments },
      { label: "Cancelled", value: cancelledAppointments },
    ],
  };
};

const buildDentistAnalytics = (appointments, records) => {
  const dentistMap = new Map();

  const ensureDentist = (name) => {
    const dentist = normalizeDentist(name);
    if (!dentistMap.has(dentist)) {
      dentistMap.set(dentist, {
        dentist,
        patientsHandled: new Set(),
        proceduresPerformed: 0,
        appointments: 0,
        completed: 0,
        cancelled: 0,
        procedureCounts: new Map(),
        dailyCounts: new Map(),
      });
    }
    return dentistMap.get(dentist);
  };

  appointments.forEach((appointment) => {
    const row = ensureDentist(appointment.dentistName);
    row.appointments += 1;
    row.patientsHandled.add(String(appointment.patient || appointment.email || appointment.patientName || "Unknown"));
    if (appointment.status === "completed") row.completed += 1;
    if (appointment.status === "cancelled") row.cancelled += 1;
    increment(row.dailyCounts, getDateKey(appointment.appointmentDate || appointment.createdAt));
  });

  records.forEach((record) => {
    const row = ensureDentist(record.dentistName);
    row.proceduresPerformed += 1;
    increment(row.procedureCounts, record.procedure || record.treatment || "Unspecified");
  });

  return [...dentistMap.values()]
    .map((row) => ({
      dentist: row.dentist,
      patientsHandled: row.patientsHandled.size,
      proceduresPerformed: row.proceduresPerformed,
      workload: row.appointments,
      completed: row.completed,
      cancelled: row.cancelled,
      dailyAverage: row.dailyCounts.size ? Number((row.appointments / row.dailyCounts.size).toFixed(1)) : row.appointments,
      topProcedures: asSeries(row.procedureCounts, { limit: 3 }),
    }))
    .sort((a, b) => b.workload - a.workload || a.dentist.localeCompare(b.dentist));
};

const buildAdminAnalytics = (patients, users, appointments, auditLogs, feedback) => {
  const accountCounts = new Map();
  const auditCounts = new Map();
  const activeStaff = users.filter((user) => ["staff", "dentist"].includes(user.role) && user.status === "active").length;
  const cancelled = appointments.filter((item) => item.status === "cancelled").length;
  const noShow = appointments.filter((item) => /no[-\s]?show/i.test(item.notes || "")).length;
  const pendingAppointments = appointments.filter((item) => item.status === "pending");
  const approvedAppointments = appointments.filter((item) => ["confirmed", "completed"].includes(item.status));
  const estimatedApprovalHours = approvedAppointments.length && pendingAppointments.length
    ? 24
    : approvedAppointments.length
      ? 12
      : 0;

  users.forEach((user) => increment(accountCounts, getMonthKey(user.createdAt)));
  auditLogs.forEach((log) => increment(auditCounts, log.action || "unknown"));

  const monthKeys = lastMonthKeys();
  const averageFeedback = feedback.length
    ? Number((feedback.reduce((total, item) => total + Number(item.rating || 0), 0) / feedback.length).toFixed(1))
    : 0;

  return {
    accountGrowth: monthKeys.map((key) => ({ label: getMonthLabel(key), value: accountCounts.get(key) || 0 })),
    registrationTrend: buildPatientAnalytics(patients, appointments).registrationTrend,
    activeStaff,
    approvalTimeHours: estimatedApprovalHours,
    cancellationNoShowRate: appointments.length ? Math.round(((cancelled + noShow) / appointments.length) * 100) : 0,
    feedbackScore: averageFeedback,
    auditSummary: asSeries(auditCounts, { limit: 8 }),
  };
};

const startOfDay = (date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const endOfDay = (date) => {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
};

const getKpiComparisonRange = (query = {}) => {
  const now = new Date();

  if (query.startDate || query.endDate) {
    const currentStart = startOfDay(query.startDate || query.endDate);
    const currentEnd = endOfDay(query.endDate || query.startDate);

    if (!Number.isNaN(currentStart.getTime()) && !Number.isNaN(currentEnd.getTime()) && currentEnd >= currentStart) {
      const periodLengthMs = currentEnd.getTime() - currentStart.getTime() + 1;
      const previousEnd = new Date(currentStart.getTime() - 1);
      const previousStart = new Date(previousEnd.getTime() - periodLengthMs + 1);

      return {
        currentStart,
        currentEnd,
        previousStart,
        previousEnd,
      };
    }
  }

  return {
    currentStart: new Date(now.getFullYear(), now.getMonth(), 1),
    currentEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    previousStart: new Date(now.getFullYear(), now.getMonth() - 1, 1),
    previousEnd: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
  };
};

const sanitizeAppointment = (appointment) => ({
  id: appointment._id,
  patientName: appointment.patientName,
  contactNumber: appointment.contactNumber,
  email: appointment.email,
  service: appointment.service,
  appointmentDate: appointment.appointmentDate,
  appointmentTime: appointment.appointmentTime,
  dentistName: appointment.dentistName,
  reason: appointment.reason,
  notes: appointment.notes,
  status: appointment.status,
  createdAt: appointment.createdAt,
});

const sanitizePatient = (patient) => ({
  id: patient._id,
  patientId: patient.patientId,
  patientName: `${patient.firstName} ${patient.lastName}`.trim(),
  email: patient.email,
  contactNumber: patient.contactNumber,
  createdAt: patient.createdAt,
});

router.get(
  "/admin",
  authenticate,
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());
    const now = new Date();

    const [
      totalPatients,
      totalAppointments,
      completedAppointments,
      pendingAppointments,
      cancelledAppointments,
      noShowAppointments,
      todaysAppointments,
      upcomingAppointments,
      todaysSchedule,
      staffActivity,
    ] = await Promise.all([
      Patient.countDocuments({}),
      Appointment.countDocuments({}),
      Appointment.countDocuments({ status: "completed" }),
      Appointment.countDocuments({ status: "pending" }),
      Appointment.countDocuments({ status: "cancelled" }),
      Appointment.countDocuments({ notes: { $regex: /no[-\s]?show/i } }),
      Appointment.countDocuments({
        appointmentDate: { $gte: todayStart, $lte: todayEnd },
        status: { $ne: "cancelled" },
      }),
      Appointment.countDocuments({
        appointmentDate: { $gt: now },
        status: { $in: ["pending", "confirmed"] },
      }),
      Appointment.find({})
        .where("appointmentDate").gte(todayStart).lte(todayEnd)
        .where("status").ne("cancelled")
        .sort({ appointmentTime: 1, appointmentDate: 1 })
        .limit(12)
        .lean(),
      AuditLog.find({ action: { $regex: /^staff_/ } })
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
    ]);

    res.json({
      stats: {
        totalAppointments,
        todaysAppointments,
        upcomingAppointments,
        completedAppointments,
        pendingAppointments,
        cancelledAppointments,
        noShowAppointments,
        totalPatients,
      },
      todaysSchedule: todaysSchedule.map(sanitizeAppointment),
      staffActivity,
    });
  }),
);

router.get(
  "/admin/analytics",
  authenticate,
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());
    const appointmentQuery = getAnalyticsFilters(req.query);
    const monthlyBaseQuery = getAnalyticsBaseFilters(req.query);
    const kpiComparisonRange = getKpiComparisonRange(req.query);

    const [
      totalStaff,
      totalDentists,
      todaysAppointments,
      inventoryAlerts,
      totalTreatments,
      recentAppointments,
      staffActivity,
      appointments,
      monthlyAppointments,
      patients,
      dentalRecords,
      users,
      auditLogs,
      feedback,
      dentistOptions,
      serviceOptions,
      statusOptions,
    ] = await Promise.all([
      User.countDocuments({ role: "staff", status: "active" }),
      User.countDocuments({ role: "dentist", status: "active" }),
      Appointment.countDocuments({
        appointmentDate: { $gte: todayStart, $lte: todayEnd },
        status: { $ne: "cancelled" },
      }),
      Inventory.countDocuments({ status: { $in: ["low_stock", "out_of_stock"] } }),
      DentalRecord.countDocuments({}),
      Appointment.find({})
        .sort({ appointmentDate: 1, appointmentTime: 1 })
        .limit(10)
        .lean(),
      AuditLog.find({ action: { $regex: /^staff_/ } }).sort({ createdAt: -1 }).limit(6).lean(),
      Appointment.find(appointmentQuery)
        .select("patient patientName email service appointmentDate appointmentTime dentistName reason notes status createdAt")
        .lean(),
      Appointment.find({
        ...monthlyBaseQuery,
        appointmentDate: { $gte: kpiComparisonRange.previousStart, $lte: kpiComparisonRange.currentEnd },
      })
        .select("appointmentDate status notes createdAt")
        .lean(),
      Patient.find({})
        .select("firstName lastName email dateOfBirth gender registrationStatus status createdAt")
        .lean(),
      DentalRecord.find({})
        .select("patient appointment patientName visitDate diagnosis treatment procedure dentistName createdAt")
        .lean(),
      User.find({})
        .select("firstName lastName email role status accountStatus createdAt")
        .lean(),
      AuditLog.find({}).select("action entityType performedByEmail createdAt").lean(),
      Feedback.find({}).select("rating category status createdAt").lean(),
      Appointment.distinct("dentistName", { dentistName: { $nin: [null, ""] } }),
      Appointment.distinct("service", { service: { $nin: [null, ""] } }),
      Appointment.distinct("status"),
    ]);

    const kpiStats = buildKpiStats(appointments, monthlyAppointments, kpiComparisonRange);
    const completedAppointments = kpiStats.completedAppointments;
    const estimatedRevenue = completedAppointments * 800;
    const appointmentAnalytics = buildAppointmentAnalytics(appointments);
    const serviceAnalytics = buildServiceAnalytics(appointments);
    const patientAnalytics = buildPatientAnalytics(patients, appointments);
    const treatmentAnalytics = buildTreatmentAnalytics(dentalRecords, appointments);
    const dentistPerformance = buildDentistAnalytics(appointments, dentalRecords);
    const adminAnalytics = buildAdminAnalytics(patients, users, appointments, auditLogs, feedback);

    res.json({
      stats: {
        totalPatients: patients.length,
        totalStaff,
        totalDentists,
        totalServices: OFFICIAL_SERVICES.length,
        totalAppointments: kpiStats.totalAppointments,
        completedAppointments,
        pendingAppointments: kpiStats.pendingAppointments,
        cancelledAppointments: kpiStats.cancelledAppointments,
        noShowAppointments: kpiStats.noShowAppointments,
        todaysAppointments,
        inventoryAlerts,
        totalTreatments,
        upcomingAppointments: kpiStats.upcomingAppointments,
        estimatedRevenue,
        monthlyChange: kpiStats.monthlyChange,
      },
      filters: {
        dentists: dentistOptions.filter(Boolean).sort(),
        services: [...new Set([...OFFICIAL_SERVICES, ...serviceOptions.filter(Boolean)])],
        statuses: statusOptions.filter(Boolean).sort(),
      },
      analytics: {
        services: serviceAnalytics,
        dentists: dentistPerformance,
        patients: patientAnalytics,
        appointments: appointmentAnalytics,
        treatments: treatmentAnalytics,
        revenue: {
          available: false,
          note: "No payment module exists yet. Revenue is estimated from completed appointments.",
          estimatedRevenue,
          byService: serviceAnalytics.distribution.map((item) => ({
            label: item.label,
            value: item.value * 800,
          })),
          byDentist: dentistPerformance.map((item) => ({
            label: item.dentist,
            value: item.completed * 800,
          })),
          byMonth: appointmentAnalytics.monthlyTrend.map((item) => ({
            label: item.label,
            value: appointments.filter((appointment) => (
              appointment.status === "completed"
              && getMonthLabel(getMonthKey(appointment.appointmentDate || appointment.createdAt)) === item.label
            )).length * 800,
          })),
          byPaymentMethod: [],
        },
        admin: adminAnalytics,
        reports: {
          periods: ["daily", "weekly", "monthly", "quarterly", "yearly"],
          exports: ["pdf", "excel", "csv"],
        },
      },
      appointments: recentAppointments.map(sanitizeAppointment),
      staffActivity,
    });
  }),
);

router.get(
  "/staff",
  authenticate,
  authorize("staff", "dentist"),
  asyncHandler(async (req, res) => {
    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());
    const now = new Date();

    const [todaysAppointments, upcomingAppointments, recentPatients] = await Promise.all([
      Appointment.find({
        appointmentDate: { $gte: todayStart, $lte: todayEnd },
        status: { $ne: "cancelled" },
      })
        .sort({ appointmentTime: 1 })
        .limit(10),
      Appointment.find({
        appointmentDate: { $gt: todayEnd },
        status: { $in: ["pending", "confirmed"] },
      })
        .sort({ appointmentDate: 1, appointmentTime: 1 })
        .limit(10),
      Patient.find({ createdAt: { $lte: now } })
        .sort({ createdAt: -1 })
        .limit(8),
    ]);

    res.json({
      todaysAppointments: todaysAppointments.map(sanitizeAppointment),
      upcomingAppointments: upcomingAppointments.map(sanitizeAppointment),
      recentPatients: recentPatients.map(sanitizePatient),
    });
  }),
);

module.exports = router;
