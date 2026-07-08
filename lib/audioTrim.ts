import "server-only";

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";

export interface TrimStemOptions {
  originalName: string;
  data: Buffer;
  start: number;
  duration: number;
}

export interface TrimStemResult {
  data: Buffer;
  ext: ".opus";
}

function safeCleanup(dir: string) {
  const resolvedDir = resolve(dir);
  const resolvedTmp = resolve(tmpdir());
  if (!resolvedDir.startsWith(resolvedTmp)) return;
  rmSync(resolvedDir, { recursive: true, force: true });
}

function ffmpegBinary(): string {
  return process.env.FFMPEG_PATH?.trim() || "ffmpeg";
}

export function trimStemToOpus({
  originalName,
  data,
  start,
  duration,
}: TrimStemOptions): TrimStemResult {
  const inputExt = extname(originalName).toLowerCase() || ".audio";
  const dir = mkdtempSync(join(tmpdir(), "dhundle-admin-trim-"));
  const input = join(dir, `source${inputExt}`);
  const output = join(dir, "stem.opus");

  try {
    writeFileSync(input, data);
    const fade = Math.min(0.12, duration / 4);
    const fadeOutStart = Math.max(0, duration - fade);
    const command = ffmpegBinary();
    const result = spawnSync(
      command,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        String(start),
        "-i",
        input,
        "-t",
        String(duration),
        "-vn",
        "-af",
        `afade=t=in:st=0:d=${fade},afade=t=out:st=${fadeOutStart}:d=${fade}`,
        "-c:a",
        "libopus",
        "-b:a",
        "64k",
        "-ar",
        "48000",
        "-ac",
        "2",
        output,
      ],
      { encoding: "utf8" }
    );

    if (result.error) {
      throw new Error(
        `ffmpeg could not run from "${command}". Set FFMPEG_PATH to the full ffmpeg.exe path, restart the dev server, or upload pre-trimmed stems. (${result.error.message})`
      );
    }
    if (result.status !== 0 || !existsSync(output)) {
      const detail = [result.stderr, result.stdout].filter(Boolean).join(" ").trim();
      throw new Error(`ffmpeg trim failed${detail ? `: ${detail.slice(0, 400)}` : ""}`);
    }

    return { data: readFileSync(output), ext: ".opus" };
  } finally {
    safeCleanup(dir);
  }
}
