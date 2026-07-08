import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/adminAuth";
import { trimStemToOpus } from "@/lib/audioTrim";
import { STEM_CONTENT_TYPES, storeStemFile } from "@/lib/adminStore";

export const dynamic = "force-dynamic";

const MAX_BYTES = 100 * 1024 * 1024;
const MIN_TRIM_DURATION = 5;
const MAX_TRIM_DURATION = 60;

function parseOptionalNumber(value: FormDataEntryValue | null): number | null {
  if (value === null || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

/** Upload one stem file. Multipart: file, date, position, optional batchId/start/duration. */
export async function POST(req: NextRequest) {
  try {
    await assertAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const file = form.get("file");
  const date = String(form.get("date") || "");
  const position = Number(form.get("position"));
  const batchId = String(form.get("batchId") || "");
  const trimStart = parseOptionalNumber(form.get("start"));
  const trimDuration = parseOptionalNumber(form.get("duration"));

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  if (!Number.isInteger(position) || position < 1 || position > 6) {
    return NextResponse.json({ error: "position must be 1-6" }, { status: 400 });
  }

  const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? "").toLowerCase();
  if (!(ext in STEM_CONTENT_TYPES)) {
    return NextResponse.json(
      { error: `Unsupported file type "${ext}" - use opus/ogg/mp3/m4a/wav/webm` },
      { status: 400 }
    );
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is empty or over 100 MB" }, { status: 400 });
  }

  const shouldTrim = trimStart !== null || trimDuration !== null;
  if (shouldTrim) {
    if (
      trimStart === null ||
      trimDuration === null ||
      Number.isNaN(trimStart) ||
      Number.isNaN(trimDuration)
    ) {
      return NextResponse.json(
        { error: "Provide both numeric start and duration when trimming" },
        { status: 400 }
      );
    }
    if (trimStart < 0) {
      return NextResponse.json({ error: "Trim start must be 0 or greater" }, { status: 400 });
    }
    if (trimDuration < MIN_TRIM_DURATION || trimDuration > MAX_TRIM_DURATION) {
      return NextResponse.json(
        { error: `Trim duration must be ${MIN_TRIM_DURATION}-${MAX_TRIM_DURATION} seconds` },
        { status: 400 }
      );
    }
  }

  try {
    const original = Buffer.from(await file.arrayBuffer());
    const prepared = shouldTrim
      ? trimStemToOpus({
          originalName: file.name,
          data: original,
          start: trimStart ?? 0,
          duration: trimDuration ?? MIN_TRIM_DURATION,
        })
      : { data: original, ext };
    const storagePath = await storeStemFile(date, position, prepared.ext, prepared.data, batchId);
    return NextResponse.json({ storagePath, trimmed: shouldTrim });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
