import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const modelScript = path.join(projectRoot, 'model-service', 'train.py');

const pythonCommand = process.env.PYTHON_BIN || 'python';

console.log(`[retrain] Starting retraining job from ${projectRoot}`);

const result = spawnSync(pythonCommand, [modelScript], {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: false,
  env: process.env,
});

if (result.error) {
  console.error('[retrain] Failed to launch training job:', result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`[retrain] Retraining ended with exit code ${result.status}`);
  process.exit(result.status || 1);
}

console.log('[retrain] Retraining completed successfully.');
