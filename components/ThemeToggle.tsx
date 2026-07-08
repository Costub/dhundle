"use client";

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "./icons";

const THEME_KEY = "dhundle-theme-v1";
type Theme = "night" | "matinee";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("night");

  useEffect(() => {
    const saved = window.localStorage.getItem(THEME_KEY);
    const initial: Theme = saved === "matinee" ? "matinee" : "night";
    document.documentElement.dataset.theme = initial;
    const frame = window.requestAnimationFrame(() => setTheme(initial));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const nextTheme = theme === "night" ? "matinee" : "night";
  const toggle = () => {
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(THEME_KEY, nextTheme);
    setTheme(nextTheme);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
      className="icon-button"
    >
      {theme === "night" ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
    </button>
  );
}
