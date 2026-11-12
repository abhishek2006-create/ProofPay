import 'dotenv/config';
import { publicAiConfig } from '../src/lib/ai-config';
import { embeddingsConfigured } from '../src/lib/agents/requirements-agent';
import { pythonServiceConfigured, pythonServiceStatus } from '../src/lib/python-service';
async function main() {
  let verification: unknown = { status: 'NOT_CONFIGURED', required: true };
  if (pythonServiceConfigured()) {
    try {
      verification = { status: 'AVAILABLE', ...(await pythonServiceStatus()) };
    } catch {
      verification = { status: 'UNAVAILABLE', required: true };
      process.exitCode = 1;
    }
  }
  console.log(
    JSON.stringify(
      {
        ai: publicAiConfig(),
        embeddingsConfigured: embeddingsConfigured(),
        verification,
        trainingEnabled: false,
      },
      null,
      2,
    ),
  );
}
void main();
