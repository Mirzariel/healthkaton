import { redirect } from "next/navigation";

/** Rute lama. Autopilot digantikan asisten peninjauan: AI menyarankan, petugas memutuskan. */
export default function AutopilotMoved() {
  redirect("/console/assistant");
}
