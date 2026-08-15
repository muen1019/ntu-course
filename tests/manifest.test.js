const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

test("manifest is a minimal Manifest V3 extension", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.deepEqual(manifest.content_scripts[0].matches, ["https://course.ntu.edu.tw/priority/list/*"]);
  assert.deepEqual(manifest.content_scripts[1].matches, ["https://course.ntu.edu.tw/priority/table"]);
  assert.ok(manifest.content_scripts[1].js.includes("src/table.js"));
});

test("manifest contains a stable public key for development installs", () => {
  assert.match(manifest.key, /^[A-Za-z0-9+/]+={0,2}$/);

  const publicKey = Buffer.from(manifest.key, "base64");
  assert.ok(publicKey.length > 200);

  const extensionId = [...crypto.createHash("sha256").update(publicKey).digest().subarray(0, 16)]
    .map((byte) => [byte >> 4, byte & 15].map((nibble) => "abcdefghijklmnop"[nibble]).join(""))
    .join("");
  assert.equal(extensionId, "hjhkdadbnmlgkdnjjlfbklackeaeaefg");
});

test("every manifest file reference exists", () => {
  const referencedFiles = [
    manifest.action.default_popup,
    ...manifest.content_scripts.flatMap((entry) => [...entry.js, ...entry.css])
  ];

  referencedFiles.forEach((file) => {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} should exist`);
  });
});
