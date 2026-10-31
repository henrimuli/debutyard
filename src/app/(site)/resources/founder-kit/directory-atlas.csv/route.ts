import { connection } from "next/server";
import { atlasCsv } from "@/lib/kit-atlas";
import { atlasDirectories } from "../atlas-data";

export async function GET() {
  await connection();
  const csv = atlasCsv(await atlasDirectories());
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="debutyard-directory-atlas.csv"',
      "X-Robots-Tag": "noindex",
    },
  });
}
