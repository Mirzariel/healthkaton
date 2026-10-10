import { listSandboxRuns, runSandbox, sandboxOptions } from "@/lib/ai/admin";
import { getDb } from "@/lib/db";
import { getPrincipal, readJson, run } from "@/lib/server";

export async function GET() {
  return run(async () => {
    const p = await getPrincipal("konsol");
    return { options: sandboxOptions(getDb(), p), runs: listSandboxRuns(getDb(), p) };
  });
}
export async function POST(req: Request) {
  return run(async () => runSandbox(getDb(), await getPrincipal("konsol"), await readJson(req)));
}
