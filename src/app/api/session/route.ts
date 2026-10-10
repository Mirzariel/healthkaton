import { readJson, run, setPersona, str } from "@/lib/server";

export async function POST(req: Request) {
  return run(async () => {
    const b = await readJson(req);
    const p = await setPersona(str(b.userId));
    return { id: p.id, role: p.role, name: p.name };
  });
}
