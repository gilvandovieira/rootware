import { runDataExample } from "./data.ts";
import { runFoundationExample } from "./foundation.ts";
import { runPostgresAdaptersExample } from "./postgres_adapters.ts";
import { runTodoApiExample } from "./todo_api.ts";
import { runWebStateAsyncExample } from "./web_state_async.ts";

export async function runAllExamples(): Promise<void> {
  await runFoundationExample();
  await runDataExample();
  await runWebStateAsyncExample();
  await runPostgresAdaptersExample();
  await runTodoApiExample();
}

if (import.meta.main) {
  await runAllExamples();
  console.log("all rootware examples passed");
}
