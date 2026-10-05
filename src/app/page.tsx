import { Story } from "@/components/story/Story";
import { getDb } from "@/lib/db";
import { getStoryData } from "@/lib/story";

export const dynamic = "force-dynamic";

export default function Home() {
  return <Story d={getStoryData(getDb())} />;
}
