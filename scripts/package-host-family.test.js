const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { packageHostFamily } = require("./package-host-family");

test("packageHostFamily packs server, mcp, and web without plugin SDK", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "host-family-"));
  const server = path.join(root, "cinyuverse-server");
  const mcp = path.join(root, "cinyuverse-mcp");
  const web = path.join(root, "web");
  const output = path.join(root, "out");
  fs.writeFileSync(server, "server-bin");
  fs.writeFileSync(mcp, "mcp-bin");
  fs.mkdirSync(web);
  fs.writeFileSync(path.join(web, "index.html"), "<html></html>");

  packageHostFamily({ server, mcp, web, output });

  assert.equal(fs.readFileSync(path.join(output, "cinyuverse-server"), "utf8"), "server-bin");
  assert.equal(fs.readFileSync(path.join(output, "cinyuverse-mcp"), "utf8"), "mcp-bin");
  assert.equal(
    fs.readFileSync(path.join(output, "web", "index.html"), "utf8"),
    "<html></html>",
  );
  assert.equal(fs.existsSync(path.join(output, "plugins")), false);
  assert.equal(fs.existsSync(path.join(output, "sdk")), false);
  const checksums = fs.readFileSync(path.join(output, "SHA256SUMS"), "utf8");
  assert.match(checksums, /  cinyuverse-server\n/);
  assert.match(checksums, /  cinyuverse-mcp\n/);
});
