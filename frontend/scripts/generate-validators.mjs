import fs from "node:fs";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import standaloneCode from "ajv/dist/standalone/index.js";
import { _ } from "ajv/dist/compile/codegen/index.js";
const contract = JSON.parse(
  fs.readFileSync("docs/ticketflow-api-v1.openapi.json", "utf8"),
);
const ajv = new Ajv({
  strict: false,
  code: { source: true, esm: true, formats: _`formats` },
});
addFormats(ajv);
ajv.addSchema({ $id: "ticketflow-v1", components: contract.components });
const names = {};
const index = {};
function absolute(value) {
  if (Array.isArray(value)) return value.map(absolute);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === "$ref" && typeof item === "string" && item.startsWith("#/")
          ? "ticketflow-v1" + item
          : absolute(item),
      ]),
    );
  return value;
}
for (const [path, methods] of Object.entries(contract.paths)) {
  if (path.startsWith("/admin") || path.startsWith("/webhooks")) continue;
  for (const [method, operation] of Object.entries(methods)) {
    if (!operation.responses) continue;
    for (const [status, response] of Object.entries(operation.responses)) {
      if (!status.startsWith("2")) continue;
      const schema = response.content?.["application/json"]?.schema;
      if (!schema) continue;
      const name = "v" + Object.keys(names).length;
      ajv.addSchema(absolute(schema), name);
      names[name] = name;
      index[`${method}:${path}:${status}`] = name;
    }
  }
}
const output =
  'import { fullFormats as formats } from "ajv-formats/dist/formats.js";\n' +
  "const ucs2length = value => Array.from(value).length;\n" +
  standaloneCode(ajv, names).replaceAll(
    'require("ajv/dist/runtime/ucs2length").default',
    "ucs2length",
  );
fs.writeFileSync("src/api/validators.js", output);
fs.writeFileSync(
  "src/api/validator-index.json",
  JSON.stringify(index, null, 2) + "\n",
);
fs.writeFileSync(
  "src/api/validators.d.ts",
  Object.keys(names)
    .map((name) => `export const ${name}: (value: unknown) => boolean;`)
    .join("\n") + "\n",
);
console.log(
  "Precompiled contract validators; browser needs no eval permission.",
);
