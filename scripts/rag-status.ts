import 'dotenv/config';
import { publicAiConfig } from '../src/lib/ai-config';
import { embeddingsConfigured } from '../src/lib/agents/requirements-agent';
import { runnerConfigured } from '../src/lib/agents/repository-agent';
console.log(
  JSON.stringify(
    {
      ai: publicAiConfig(),
      embeddingsConfigured: embeddingsConfigured(),
      githubAuthenticated: Boolean(process.env.GITHUB_TOKEN),
      isolatedRunnerConfigured: runnerConfigured(),
      trainingEnabled: false,
    },
    null,
    2,
  ),
);
