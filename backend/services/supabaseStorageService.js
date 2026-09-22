const crypto = require("crypto");
const path = require("path");
const dotenv = require("dotenv");

const loadedEnv = dotenv.config({ path: path.resolve(__dirname, "../.env") }).parsed || {};

const DATA_URL_PATTERN = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=]+)$/i;
const EXTENSIONS_BY_MIME = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const normalizeSupabaseUrl = (value) => String(value || "").trim().replace(/\/+$/, "");

const encodeStoragePath = (path) => path
  .split("/")
  .map((part) => encodeURIComponent(part))
  .join("/");

const sanitizeFolder = (folder) => String(folder || "general")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9/_-]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 80) || "general";

const sanitizeBaseName = (name) => String(name || "image")
  .trim()
  .toLowerCase()
  .replace(/\.[a-z0-9]+$/i, "")
  .replace(/[^a-z0-9_-]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 50) || "image";

const getEnvValue = (name) => String(process.env[name] || loadedEnv[name] || "").trim();

const getSupabaseConfig = () => ({
  url: normalizeSupabaseUrl(getEnvValue("SUPABASE_URL")),
  key: getEnvValue("SUPABASE_SECRET_KEY") || getEnvValue("SUPABASE_SERVICE_ROLE_KEY"),
  publishableKey: getEnvValue("SUPABASE_PUBLISHABLE_KEY") || getEnvValue("SUPABASE_ANON_KEY"),
  bucket: getEnvValue("SUPABASE_STORAGE_BUCKET") || "fdmst-images",
});

const getSupabaseHeaders = (config, extraHeaders = {}) => {
  const usesNewSupabaseKey = config.key.startsWith("sb_");
  const headers = {
    apikey: config.key,
    ...extraHeaders,
  };

  if (!usesNewSupabaseKey) {
    headers.Authorization = `Bearer ${config.key}`;
  }

  return headers;
};

const parseImageDataUrl = (imageData) => {
  const match = String(imageData || "").trim().match(DATA_URL_PATTERN);

  if (!match) {
    const error = new Error("Upload must be a valid JPG, PNG, WebP, or GIF image.");
    error.status = 400;
    throw error;
  }

  const mimeType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");

  if (!buffer.length) {
    const error = new Error("Selected image is empty.");
    error.status = 400;
    throw error;
  }

  return {
    mimeType,
    extension: EXTENSIONS_BY_MIME[mimeType],
    buffer,
  };
};

const isMissingBucketError = (details) => {
  const text = String(details || "").toLowerCase();
  return text.includes("bucket not found") || text.includes("nosuchbucket");
};

const createStorageBucket = async (config) => {
  const response = await fetch(`${config.url}/storage/v1/bucket`, {
    method: "POST",
    headers: getSupabaseHeaders(config, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      id: config.bucket,
      name: config.bucket,
      public: true,
    }),
  });

  if (response.ok || response.status === 409) return;

  let details = "";
  try {
    details = await response.text();
  } catch {
    details = "";
  }

  const error = new Error(details || "Unable to create Supabase Storage bucket.");
  error.status = response.status;
  throw error;
};

const uploadObject = async ({ config, storagePath, parsed }) => {
  const uploadUrl = `${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodeStoragePath(storagePath)}`;
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: getSupabaseHeaders(config, {
      "Content-Type": parsed.mimeType,
      "Cache-Control": "3600",
      "x-upsert": "false",
    }),
    body: parsed.buffer,
  });

  if (response.ok) return;

  let details = "";
  try {
    details = await response.text();
  } catch {
    details = "";
  }

  const error = new Error(details || "Unable to upload image to Supabase Storage.");
  error.status = response.status;
  error.details = details;
  throw error;
};

const uploadImageToSupabase = async ({ imageData, folder, fileName, maxSizeBytes = 1024 * 1024 }) => {
  const config = getSupabaseConfig();

  if (!config.url || !config.key) {
    const error = new Error("Supabase storage is not configured. Add SUPABASE_URL and SUPABASE_SECRET_KEY to backend/.env.");
    error.status = 503;
    throw error;
  }

  const parsed = parseImageDataUrl(imageData);

  if (parsed.buffer.length > maxSizeBytes) {
    const error = new Error(`Image must be ${Math.round(maxSizeBytes / 1024)} KB or smaller.`);
    error.status = 400;
    throw error;
  }

  const storagePath = [
    sanitizeFolder(folder),
    `${Date.now()}-${crypto.randomBytes(8).toString("hex")}-${sanitizeBaseName(fileName)}.${parsed.extension}`,
  ].join("/");

  try {
    await uploadObject({ config, storagePath, parsed });
  } catch (error) {
    if (!isMissingBucketError(error.details || error.message)) {
      throw error;
    }

    await createStorageBucket(config);
    await uploadObject({ config, storagePath, parsed });
  }

  const publicUrl = `${config.url}/storage/v1/object/public/${encodeURIComponent(config.bucket)}/${encodeStoragePath(storagePath)}`;

  return {
    url: publicUrl,
    path: storagePath,
    bucket: config.bucket,
    mimeType: parsed.mimeType,
    size: parsed.buffer.length,
  };
};

const getManagedPromotionImagePath = (imageUrl, config = getSupabaseConfig()) => {
  if (!config.url || !imageUrl) return null;

  try {
    const base = new URL(config.url);
    const image = new URL(imageUrl);
    const prefix = `${base.pathname.replace(/\/$/, "")}/storage/v1/object/public/${encodeURIComponent(config.bucket)}/promotions/`;
    if (image.origin !== base.origin || !image.pathname.startsWith(prefix) || image.search || image.hash) return null;

    const fileName = decodeURIComponent(image.pathname.slice(prefix.length));
    if (!/^\d{13}-[a-f0-9]{16}-[a-z0-9_-]+\.(?:jpg|png|webp|gif)$/.test(fileName)) return null;
    return `promotions/${fileName}`;
  } catch {
    return null;
  }
};

const deleteManagedPromotionImage = async (imageUrl) => {
  const config = getSupabaseConfig();
  const storagePath = getManagedPromotionImagePath(imageUrl, config);
  if (!storagePath) return false;
  if (!config.key) throw new Error("Supabase storage is not configured.");

  const response = await fetch(`${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodeStoragePath(storagePath)}`, {
    method: "DELETE",
    headers: getSupabaseHeaders(config),
  });
  if (response.ok || response.status === 404) return true;

  throw new Error(`Unable to remove the previous promotion image (HTTP ${response.status}).`);
};

module.exports = {
  uploadImageToSupabase,
  deleteManagedPromotionImage,
  getManagedPromotionImagePath,
};
