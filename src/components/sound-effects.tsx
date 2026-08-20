"use client";

import { useEffect } from "react";
import { playHudClick } from "@/lib/sound";

// Mounted once in the root layout. Plays a HUD blip on any button/link/
// clickable-role click anywhere in the app, via event delegation — new
// buttons get the sound for free, no per-component wiring needed.
export function SoundEffects() {
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const interactive = target.closest('button, a[href], [role="button"], [data-hud-sound]');
      if (interactive && !interactive.hasAttribute("data-hud-silent")) {
        playHudClick();
      }
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return null;
}
