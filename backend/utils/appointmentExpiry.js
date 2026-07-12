const Appointment = require("../models/Appointment");
const AuditLog = require("../models/AuditLog");
const Notification = require("../models/Notification");
const Patient = require("../models/Patient");
const User = require("../models/User");

const AUTO_DECLINE_AFTER_MS = 24 * 60 * 60 * 1000;
const WARNING_BEFORE_DEADLINE_MS = 2 * 60 * 60 * 1000;
const JOB_INTERVAL_MS = 15 * 60 * 1000;
const AUTO_DECLINE_REASON = "Automatically cancelled because the appointment request was not reviewed within 24 hours.";

let intervalId = null;
let isRunning = false;

const fullName = (user) => [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();

const getAppointmentSubmittedAt = (appointment) =>
  new Date(appointment.requestSubmittedAt || appointment.createdAt || appointment._id.getTimestamp());

const getPatientRecipient = async (appointment) => {
  const patient = appointment.patient
    ? await Patient.findById(appointment.patient).select("userId")
    : await Patient.findOne({ email: appointment.email }).select("userId");

  return patient?.userId ? { user: patient.userId, patient: patient._id } : null;
};

const createNotificationOnce = async (query, payload) => {
  const existing = await Notification.exists(query);
  if (existing) return null;
  return Notification.create(payload);
};

const notifyPatientOfAutoDecline = async (appointment) => {
  const recipient = await getPatientRecipient(appointment);
  if (!recipient) return;

  await createNotificationOnce(
    {
      user: recipient.user,
      type: "appointment",
      "metadata.appointmentId": appointment._id,
      "metadata.event": "appointment_auto_declined",
    },
    {
      ...recipient,
      title: "Appointment request cancelled",
      message: `Your ${appointment.service} appointment request was automatically cancelled because it was not reviewed within 24 hours.`,
      type: "appointment",
      metadata: {
        appointmentId: appointment._id,
        event: "appointment_auto_declined",
        declineReason: AUTO_DECLINE_REASON,
      },
    },
  );
};

const getClinicReviewRecipients = async (appointment) => {
  const users = await User.find({
    role: { $in: ["admin", "staff", "dentist"] },
    status: "active",
  }).select("_id firstName lastName role");

  const assignedDentistName = String(appointment.dentistName || "").trim().toLowerCase();
  const isSpecificDentist = assignedDentistName && assignedDentistName !== "any available dentist";

  return users.filter((user) => {
    if (user.role !== "dentist" || !isSpecificDentist) return true;
    return fullName(user).toLowerCase() === assignedDentistName;
  });
};

const notifyClinicUsersOfExpiringAppointment = async (appointment) => {
  const recipients = await getClinicReviewRecipients(appointment);
  if (!recipients.length) return;

  const deadline = new Date(getAppointmentSubmittedAt(appointment).getTime() + AUTO_DECLINE_AFTER_MS);
  const message = `${appointment.patientName}'s ${appointment.service} request will be automatically cancelled if it is not reviewed by ${deadline.toLocaleString()}.`;

  await Promise.all(recipients.map((user) =>
    createNotificationOnce(
      {
        user: user._id,
        type: "appointment",
        "metadata.appointmentId": appointment._id,
        "metadata.event": "appointment_auto_decline_warning",
      },
      {
        user: user._id,
        title: "Appointment request nearing auto-cancellation",
        message,
        type: "appointment",
        scheduledFor: deadline,
        metadata: {
          appointmentId: appointment._id,
          event: "appointment_auto_decline_warning",
          expiresAt: deadline,
        },
      },
    ),
  ));
};

const warnExpiringPendingAppointments = async (now) => {
  const warningCutoff = new Date(now.getTime() - (AUTO_DECLINE_AFTER_MS - WARNING_BEFORE_DEADLINE_MS));
  const declineCutoff = new Date(now.getTime() - AUTO_DECLINE_AFTER_MS);

  const candidates = await Appointment.find({
    status: "pending",
    $or: [
      { requestSubmittedAt: { $lte: warningCutoff, $gt: declineCutoff } },
      { requestSubmittedAt: { $exists: false }, createdAt: { $lte: warningCutoff, $gt: declineCutoff } },
    ],
    autoDeclineWarningSentAt: { $exists: false },
  })
    .limit(100)
    .lean();

  for (const appointment of candidates) {
    const updated = await Appointment.findOneAndUpdate(
      {
        _id: appointment._id,
        status: "pending",
        autoDeclineWarningSentAt: { $exists: false },
      },
      { autoDeclineWarningSentAt: now },
      { new: true },
    ).lean();

    if (updated) {
      await notifyClinicUsersOfExpiringAppointment(updated);
    }
  }
};

const declineOverduePendingAppointments = async (now) => {
  const declineCutoff = new Date(now.getTime() - AUTO_DECLINE_AFTER_MS);

  const overdueAppointments = await Appointment.find({
    status: "pending",
    $or: [
      { requestSubmittedAt: { $lte: declineCutoff } },
      { requestSubmittedAt: { $exists: false }, createdAt: { $lte: declineCutoff } },
    ],
    autoDeclinedAt: { $exists: false },
  })
    .limit(100)
    .lean();

  for (const appointment of overdueAppointments) {
    const cancelled = await Appointment.findOneAndUpdate(
      {
        _id: appointment._id,
        status: "pending",
        autoDeclinedAt: { $exists: false },
      },
      {
        status: "cancelled",
        declineReason: AUTO_DECLINE_REASON,
        autoDeclinedAt: now,
        statusUpdatedAt: now,
        statusUpdatedByEmail: "system@fdmst.local",
      },
      { new: true },
    );

    if (!cancelled) continue;

    await Promise.allSettled([
      notifyPatientOfAutoDecline(cancelled),
      AuditLog.create({
        action: "Appointment Auto Cancelled",
        entityType: "Appointments",
        entityId: cancelled._id,
        performedByEmail: "system@fdmst.local",
        metadata: {
          status: "cancelled",
          reason: AUTO_DECLINE_REASON,
          submittedAt: cancelled.requestSubmittedAt || cancelled.createdAt,
          autoDeclinedAt: now,
        },
      }),
    ]);
  }
};

const runAppointmentExpiryCheck = async () => {
  if (isRunning) return;

  isRunning = true;

  try {
    const now = new Date();
    await warnExpiringPendingAppointments(now);
    await declineOverduePendingAppointments(now);
  } catch (error) {
    console.error("Appointment expiry check failed:", error);
  } finally {
    isRunning = false;
  }
};

const startAppointmentExpiryMonitor = () => {
  if (intervalId) return intervalId;

  runAppointmentExpiryCheck();
  intervalId = setInterval(runAppointmentExpiryCheck, JOB_INTERVAL_MS);
  return intervalId;
};

module.exports = {
  AUTO_DECLINE_REASON,
  runAppointmentExpiryCheck,
  startAppointmentExpiryMonitor,
};
