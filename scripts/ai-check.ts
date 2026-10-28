import 'dotenv/config';
import { diagnoseAi } from '../src/lib/ai';
diagnoseAi()
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Model check failed.');
    process.exitCode = 1;
  });
