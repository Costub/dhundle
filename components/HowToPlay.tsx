"use client";

import { CloseIcon, MusicIcon, SearchIcon, SparklesIcon, VolumeIcon } from "./icons";

const STEPS = [
  {
    icon: MusicIcon,
    title: "Listen",
    body: "A Bollywood song is hidden in today's puzzle. You start with one instrument layer.",
  },
  {
    icon: SearchIcon,
    title: "Guess with the stems",
    body: "Every wrong guess or reveal without guessing unlocks the next instrument. Puzzles use 4-6 stems.",
  },
  {
    icon: SparklesIcon,
    title: "Use hints carefully",
    body: "Year, artist, actor, and movie hints are optional. Every hint appears in your result.",
  },
  {
    icon: VolumeIcon,
    title: "Mix it your way",
    body: "Tap unlocked instrument chips to mute or unmute layers while you think.",
  },
];

export default function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-night/75 p-4 backdrop-blur-md"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="How to play"
    >
      <div
        className="stage-panel max-h-[85vh] w-full max-w-md animate-scale-in overflow-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="tiny-label">Daily rules</p>
            <h2 className="mt-1 font-display text-2xl text-ink">How to play</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="icon-button h-9 w-9">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <ol className="mt-5 space-y-3">
          {STEPS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3.5 rounded-2xl border border-line bg-surface/45 p-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gold/25 bg-gold/12 text-gold">
                <Icon className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="text-sm font-bold text-ink">{title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-muted">{body}</p>
              </div>
            </li>
          ))}
        </ol>

        <button onClick={onClose} className="btn-primary mt-5 w-full">
          Let&apos;s Play
        </button>
      </div>
    </div>
  );
}
