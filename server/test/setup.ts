import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Each test file gets its own throwaway data directory.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'study-os-test-'));
process.env.APP_PASSWORD = 'test-password';
