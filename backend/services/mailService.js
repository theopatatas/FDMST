const DEFAULT_FROM_NAME = "Flores-Dizon Dental Clinic";

const isMailConfigured = () => Boolean(process.env.MAIL_API_URL && process.env.MAIL_API_KEY);

const sendMail = async ({ to, subject, message, html, attachments = [] }) => {
  if (!isMailConfigured()) {
    const error = new Error("Mail API is not configured.");
    error.status = 503;
    throw error;
  }

  const recipient = String(to || "").trim();
  if (!recipient) {
    const error = new Error("Recipient email is required.");
    error.status = 400;
    throw error;
  }

  const response = await fetch(process.env.MAIL_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": process.env.MAIL_API_KEY,
    },
    body: JSON.stringify({
      to: recipient,
      subject,
      message,
      html,
      fromName: process.env.MAIL_FROM_NAME || DEFAULT_FROM_NAME,
      attachments,
    }),
  });

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text ? { message: text } : null;
  }

  if (!response.ok) {
    const error = new Error(data?.message || "Mail API request failed.");
    error.status = response.status;
    throw error;
  }

  return data || { message: "Email sent." };
};

const sendOtpEmail = ({ to, otp, purpose }) => {
  const isReset = purpose === "password_reset";
  const title = isReset ? "Password Reset OTP" : "Patient Registration OTP";
  const subject = `${title} - Flores-Dizon Dental Clinic`;
  const message = `Your Flores-Dizon Dental Clinic ${isReset ? "password reset" : "registration"} OTP is ${otp}. This code expires in 10 minutes. If you did not request this, please ignore this email.`;
  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
      <h2 style="color:#082f49;">${title}</h2>
      <p>Your one-time password is:</p>
      <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #0c4a6e;">${otp}</p>
      <p>This code expires in <strong>10 minutes</strong>.</p>
      <p>If you did not request this, please ignore this email.</p>
    </div>
  `;

  return sendMail({ to, subject, message, html });
};

module.exports = {
  sendMail,
  sendOtpEmail,
};
