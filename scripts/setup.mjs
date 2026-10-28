import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (!existsSync('.env')) {
  const template = readFileSync('.env.example', 'utf8');
  writeFileSync(
    '.env',
    template.replace(
      'replace-with-a-random-secret-at-least-32-characters',
      randomBytes(48).toString('base64url'),
    ),
  );
  console.log(
    'Created ignored .env with a random local authentication secret. PayPal and AI remain unconfigured.',
  );
} else console.log('.env already exists; preserved.');
