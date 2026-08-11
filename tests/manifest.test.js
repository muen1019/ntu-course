const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

test("manifest is a minimal Manifest V3 extension", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.deepEqual(manifest.content_scripts[0].matches, ["https://course.ntu.edu.tw/priority/list/*"]);
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
