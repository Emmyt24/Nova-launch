import { openApiSpec } from "../src/lib/openapi/spec";
import { writeFileSync } from "fs";

writeFileSync("openapi.json", JSON.stringify(openApiSpec, null, 2));
console.log("openapi.json written");
