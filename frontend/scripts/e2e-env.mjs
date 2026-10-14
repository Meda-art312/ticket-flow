import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
if (!existsSync(".env.e2e"))
  writeFileSync(
    ".env.e2e",
    `E2E_PASSWORD=E2e-${randomBytes(24).toString("base64url")}!\n`,
    { mode: 0o600 },
  );
mkdirSync("artifacts", { recursive: true });
mkdirSync(".impeccable/review", { recursive: true });
console.log("Isolated test credentials prepared; values are not printed.");
