import { buildStaticHostBundle } from "../src/host-bundle.js";

const result = await buildStaticHostBundle();
console.log(`Host bundle: ${result.path} (${result.bytes} bytes)`);
