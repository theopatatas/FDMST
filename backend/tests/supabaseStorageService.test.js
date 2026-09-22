const assert = require("node:assert/strict");
const test = require("node:test");

const { deleteManagedPromotionImage, getManagedPromotionImagePath } = require("../services/supabaseStorageService");

const config = {
  url: "https://clinic.supabase.co",
  bucket: "fdmst-images",
};
const managedUrl = "https://clinic.supabase.co/storage/v1/object/public/fdmst-images/promotions/1789900000000-0123456789abcdef-offer.jpg";

test("recognizes promotion images uploaded by this application", () => {
  assert.equal(
    getManagedPromotionImagePath(managedUrl, config),
    "promotions/1789900000000-0123456789abcdef-offer.jpg",
  );
});

test("never treats external, shared-folder, or malformed images as managed promotion images", () => {
  for (const url of [
    "https://other.example.com/banner.jpg",
    managedUrl.replace("/promotions/", "/profiles/"),
    managedUrl.replace("offer.jpg", "../../offer.jpg"),
    `${managedUrl}?token=abc`,
    "data:image/png;base64,AAAA",
  ]) {
    assert.equal(getManagedPromotionImagePath(url, config), null);
  }
});

test("deletes only a managed promotion image through Supabase Storage", async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SECRET_KEY;
  const originalBucket = process.env.SUPABASE_STORAGE_BUCKET;
  const requests = [];

  try {
    process.env.SUPABASE_URL = config.url;
    process.env.SUPABASE_SECRET_KEY = "test-service-key";
    process.env.SUPABASE_STORAGE_BUCKET = config.bucket;
    global.fetch = async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 200 };
    };

    assert.equal(await deleteManagedPromotionImage("https://other.example.com/banner.jpg"), false);
    assert.equal(requests.length, 0);
    assert.equal(await deleteManagedPromotionImage(managedUrl), true);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.method, "DELETE");
    assert.equal(requests[0].url, "https://clinic.supabase.co/storage/v1/object/fdmst-images/promotions/1789900000000-0123456789abcdef-offer.jpg");
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = originalKey;
    if (originalBucket === undefined) delete process.env.SUPABASE_STORAGE_BUCKET;
    else process.env.SUPABASE_STORAGE_BUCKET = originalBucket;
  }
});
