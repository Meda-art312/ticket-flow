import Ajv from "ajv/dist/2020";
import addFormats from "ajv-formats";
import contract from "../docs/openapi.json";
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ $id: "ticketflow-api-v1", components: contract.components });
export function matches(name: string, value: unknown) {
  const validate = ajv.compile({
    $ref: `ticketflow-api-v1#/components/schemas/${name}`,
  });
  if (!validate(value)) throw new Error(JSON.stringify(validate.errors));
}
