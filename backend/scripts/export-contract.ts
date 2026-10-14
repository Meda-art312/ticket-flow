import { writeFileSync } from "node:fs";
import contract from "../docs/openapi.json";
writeFileSync(
  process.env.CONTRACT_OUTPUT || "docs/openapi.json",
  JSON.stringify(contract, null, 2) + "\n",
);
