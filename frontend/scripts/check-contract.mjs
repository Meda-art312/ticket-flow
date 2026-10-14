import fs from "node:fs/promises";
import openapiTS, { astToString } from "openapi-typescript";
const contract = new URL(
  "../docs/ticketflow-api-v1.openapi.json",
  import.meta.url,
);
const source = JSON.parse(await fs.readFile(contract, "utf8"));
if (source.info.version !== "ticketflow-api-v1")
  throw Error("Unsupported contract version");
const generated = astToString(await openapiTS(contract));
const checked = await fs.readFile(
  new URL("../src/api/schema.d.ts", import.meta.url),
  "utf8",
);
if (generated !== checked.replace(/^\/\*\*[\s\S]*?\*\/\n\n/, ""))
  throw Error(
    "Generated types differ from contract; run npm run contract:generate",
  );
console.log("ticketflow-api-v1 types match the backend-owned snapshot");
