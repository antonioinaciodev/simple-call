// Deploy dos pushes fora da main (Cloudflare → Worker simplecall → Settings → Build →
// "Non-production branch deploy command": npx pnpm@10 run deploy:branch).
// Só a branch dev vira site de teste (simplecall-dev); as outras branches só conferem o build.
import { execSync } from 'node:child_process';

const branch = process.env.WORKERS_CI_BRANCH ?? '';
if (branch === 'dev') {
  execSync('pnpm run deploy:dev', { stdio: 'inherit' });
} else {
  console.log(`Branch "${branch || '?'}": sem deploy (só a dev vira site de teste).`);
}
