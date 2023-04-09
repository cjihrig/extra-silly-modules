globalThis.basic_esm ??= 0;
globalThis.basic_esm++;

import fs from 'node:fs';
import * as foo from 'node:dns';
import { createRequire } from 'node:module';
import dep from './dep-esm.mjs';

const require = createRequire(import.meta.url);
require('./dep-cjs');

export default true;
