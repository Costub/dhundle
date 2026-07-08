"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Equalizer, LockIcon, PauseIcon, PlayIcon, VolumeIcon, VolumeOffIcon } from "./icons";
import type { StemInfo } from "@/lib/types";

interface StemPlayerProps {
  stems: StemInfo[];
  revealedCount: number;
}

interface ActiveSource {
  src: string;
  node: AudioBufferSourceNode;
  gain: GainNode;
}

const AUDIO_LOAD_TIMEOUT_MS = 12_000;

/**
 * Multi-stem synchronized player. All revealed stems start on the same
 * AudioContext clock so they stay sample-locked; muting a stem just zeroes
 * its gain. Stems are assumed to share the same duration per puzzle.
 */
export default function StemPlayer({ stems, revealedCount }: StemPlayerProps) {
  const ctxRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const sourcesRef = useRef<ActiveSource[]>([]);
  const startCtxTimeRef = useRef(0); // ctx.currentTime when playback started
  const offsetRef = useRef(0); // seconds into the loop at playback start
  const rafRef = useRef(0);

  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const revealed = stems.slice(0, revealedCount);

  const getCtx = useCallback((): AudioContext => {
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    return ctxRef.current;
  }, []);

  const loadBuffer = useCallback(
    async (src: string): Promise<AudioBuffer> => {
      const cached = buffersRef.current.get(src);
      if (cached) return cached;
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), AUDIO_LOAD_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(src, { signal: controller.signal });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          throw new Error("Audio load timed out. Check that the stem file is public and reachable.");
        }
        throw new Error("Could not reach the audio file. Check the stem URL and Supabase bucket.");
      } finally {
        window.clearTimeout(timeout);
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(
          `Could not load audio (${res.status}). ${detail.slice(0, 120) || "Check the stem URL."}`
        );
      }
      const data = await res.arrayBuffer();
      let buf: AudioBuffer;
      try {
        buf = await getCtx().decodeAudioData(data);
      } catch {
        throw new Error(
          `Could not decode audio. Check that the stem file is a valid browser-playable audio file.`
        );
      }
      buffersRef.current.set(src, buf);
      return buf;
    },
    [getCtx]
  );

  const stopSources = useCallback(() => {
    for (const s of sourcesRef.current) {
      try {
        s.node.stop();
      } catch {
        // already stopped
      }
      s.node.disconnect();
      s.gain.disconnect();
    }
    sourcesRef.current = [];
    cancelAnimationFrame(rafRef.current);
  }, []);

  const pause = useCallback(() => {
    const ctx = ctxRef.current;
    if (ctx && duration > 0) {
      offsetRef.current =
        (ctx.currentTime - startCtxTimeRef.current + offsetRef.current) % duration;
    }
    stopSources();
    setPlaying(false);
  }, [duration, stopSources]);

  const play = useCallback(
    async (fromStart = false) => {
      setLoading(true);
      setError(null);
      try {
        const ctx = getCtx();
        if (ctx.state === "suspended") await ctx.resume();
        const buffers = await Promise.all(revealed.map((s) => loadBuffer(s.src)));
        stopSources();

        const dur = Math.max(...buffers.map((b) => b.duration));
        setDuration(dur);
        if (fromStart) offsetRef.current = 0;
        const offset = offsetRef.current % dur;
        const startAt = ctx.currentTime + 0.08;

        sourcesRef.current = revealed.map((stem, i) => {
          const node = ctx.createBufferSource();
          node.buffer = buffers[i];
          node.loop = true;
          const gain = ctx.createGain();
          gain.gain.value = muted.has(stem.position) ? 0 : 1;
          node.connect(gain).connect(ctx.destination);
          node.start(startAt, offset);
          return { src: stem.src, node, gain };
        });
        startCtxTimeRef.current = startAt;
        setPlaying(true);

        const tick = () => {
          const elapsed =
            (ctx.currentTime - startCtxTimeRef.current + offset + dur) % dur;
          setProgress(elapsed / dur);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not play audio.");
        setPlaying(false);
      } finally {
        setLoading(false);
      }
    },
    [getCtx, loadBuffer, muted, revealed, stopSources]
  );

  const toggleMute = (position: number) => {
    setMuted((prev) => {
      const next = new Set(prev);
      if (next.has(position)) next.delete(position);
      else next.add(position);
      // apply live to the running graph
      for (let i = 0; i < sourcesRef.current.length; i++) {
        const stem = revealed[i];
        if (stem) {
          sourcesRef.current[i].gain.gain.value = next.has(stem.position) ? 0 : 1;
        }
      }
      return next;
    });
  };

  // When a new stem is revealed mid-game, restart the mix from the top so the
  // player hears the fuller arrangement immediately. Uses latest-refs so the
  // restart survives re-renders between reveal and playback.
  const prevCountRef = useRef(revealedCount);
  const playRef = useRef(play);
  const playingRef = useRef(playing);
  useEffect(() => {
    playRef.current = play;
    playingRef.current = playing;
  });
  useEffect(() => {
    if (revealedCount === prevCountRef.current) return;
    prevCountRef.current = revealedCount;
    offsetRef.current = 0;
    setTimeout(() => {
      setProgress(0);
      if (playingRef.current) void playRef.current(true);
    }, 0);
  }, [revealedCount]);

  useEffect(() => {
    return () => {
      stopSources();
      ctxRef.current?.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="stage-panel relative overflow-hidden p-4">
      <div className="pointer-events-none absolute -right-16 -top-20 h-40 w-40 rounded-full bg-peacock/15 blur-3xl" />
      <div className="relative flex items-center gap-4">
        <button
          onClick={() => (playing ? pause() : void play())}
          disabled={loading}
          aria-label={playing ? "Pause" : "Play"}
          className="focus-ring relative flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-gold-soft via-gold to-emerald text-night shadow-glow transition duration-200 hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-55"
        >
          <span className="absolute inset-0 rounded-full border border-white/30" />
          <span className={playing ? "absolute inset-[-6px] animate-pulse-glow rounded-full border border-gold/35" : "hidden"} />
          {loading ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-night/30 border-t-night" />
          ) : playing ? (
            <PauseIcon className="h-6 w-6" />
          ) : (
            <PlayIcon className="ml-0.5 h-6 w-6" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="mb-3 flex h-12 items-end gap-1 rounded-2xl border border-line bg-night/35 px-3 py-2">
            {Array.from({ length: 28 }).map((_, i) => {
              const height = 22 + ((i * 17) % 55);
              const unlocked = i / 28 < revealedCount / stems.length;
              return (
                <span
                  key={i}
                  className={
                    "w-full origin-bottom rounded-full transition duration-300 " +
                    (unlocked
                      ? playing
                        ? "animate-eq-2 bg-gradient-to-t from-gold to-gold-soft"
                        : "bg-gold/55"
                      : "bg-line-strong/45")
                  }
                  style={{ height: `${height}%`, animationDelay: `${i * -35}ms` }}
                />
              );
            })}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-line/80">
            <div
              className="h-full rounded-full bg-gradient-to-r from-peacock via-gold to-rose-glow shadow-[0_0_18px_rgb(244_175_44_/_0.34)] transition-[width] duration-200"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <div className="mt-2.5 flex items-center gap-2 text-xs text-muted">
            <Equalizer active={playing} className="text-gold" />
            <span>
              <span className="font-semibold text-ink">{revealedCount}</span> of{" "}
              {stems.length} instruments unlocked
            </span>
          </div>
        </div>
      </div>

      <div className="relative mt-4 flex flex-wrap gap-2">
        {stems.map((stem) => {
          const isRevealed = stem.position <= revealedCount;
          const isMuted = muted.has(stem.position);
          return (
            <button
              key={stem.position}
              disabled={!isRevealed}
              onClick={() => toggleMute(stem.position)}
              aria-label={
                !isRevealed
                  ? `${stem.instrument} locked`
                  : `${stem.instrument} — ${isMuted ? "unmute" : "mute"}`
              }
              title={isRevealed ? "Tap to mute or unmute" : "Unlocks with your next attempt"}
              className={
                "focus-ring flex min-h-10 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition duration-200 active:scale-[0.98] " +
                (!isRevealed
                  ? "border-line bg-surface/40 text-subtle"
                  : isMuted
                    ? "cursor-pointer border-line-strong bg-surface-raised/70 text-subtle hover:text-muted"
                    : "cursor-pointer border-gold/35 bg-gold/12 text-gold-soft shadow-sm hover:bg-gold/20")
              }
            >
              {!isRevealed ? (
                <LockIcon className="h-3.5 w-3.5" />
              ) : isMuted ? (
                <VolumeOffIcon className="h-3.5 w-3.5" />
              ) : (
                <VolumeIcon className="h-3.5 w-3.5" />
              )}
              {stem.instrument}
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="relative mt-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs leading-relaxed text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
