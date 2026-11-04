/** Builds dist/ once before all test files: the hook and bundle tests run the built programs. */
import { execSync } from 'node:child_process';
import path from 'node:path';

export default function setup(): void {
  execSync('node esbuild.config.mjs', { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' });
}
