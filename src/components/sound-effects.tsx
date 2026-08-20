"use client";

import { useEffect } from "react";
import { playHudClick, preloadHudClick } from "@/lib/sound";

function spawnRipple(x: number, y: number) {
  const ripple = document.createElement("span");
  ripple.className = "hud-ripple";
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  document.body.appendChild(ripple);
  ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
}

// Mounted once in the root layout. Plays a HUD click sound + a neon touch
// ripple on any button/link/clickable-role click anywhere in the app, via
// event delegation — new buttons get both for free, no per-component wiring.
export function SoundEffects() {
  useEffect(() => {
    preloadHudClick();

    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const interactive = target.closest('button, a[href], [role="button"], [data-hud-sound]');
      if (interactive && !interactive.hasAttribute("data-hud-silent")) {
        playHudClick();
        spawnRipple(event.clientX, event.clientY);
      }
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return null;
}
