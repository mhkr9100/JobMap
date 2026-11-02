"use client";

import { useEffect, useRef, useState } from "react";
import type { ControlAxes, FlightGame as Game, HudState } from "@/lib/flight/engine";

const INITIAL_HUD: HudState = {
  speedKts: 0,
  altitudeFt: 0,
  headingDeg: 90,
  throttle: 0.55,
  crashed: false,
  cameraMode: "chase",
  mapLabel: "Loading map…",
  attribution: "",
  lat: 0,
  lon: 0,
  warning: null,
};

function HoldButton({
  label,
  axis,
  value,
  game,
  className = "",
}: {
  label: string;
  axis: keyof ControlAxes;
  value: number;
  game: React.RefObject<Game | null>;
  className?: string;
}) {
  const set = (v: number) => game.current?.setTouchAxes({ [axis]: v });
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        set(value);
      }}
      onPointerUp={() => set(0)}
      onPointerCancel={() => set(0)}
      onLostPointerCapture={() => set(0)}
      onContextMenu={(e) => e.preventDefault()}
      className={`flex size-14 select-none items-center justify-center rounded-2xl bg-black/35 text-xl font-bold text-white backdrop-blur-sm active:bg-white/40 ${className}`}
    >
      {label}
    </button>
  );
}

export default function FlightGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudState>(INITIAL_HUD);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let game: Game | null = null;
    let cancelled = false;

    void import("@/lib/flight/engine")
      .then(({ FlightGame: Engine }) => {
        if (cancelled) return;
        game = new Engine({
          container,
          mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "",
          googleKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || undefined,
          onHud: setHud,
        });
        gameRef.current = game;
        return game.start();
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));

    return () => {
      cancelled = true;
      game?.dispose();
      gameRef.current = null;
    };
  }, []);

  const heading = Math.round(hud.headingDeg) % 360;

  return (
    <div className="fixed inset-0 overflow-hidden bg-sky-200 font-mono text-white select-none">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Minimal HUD, top-left (fly.pieter.com style) */}
      <div className="pointer-events-none absolute left-4 top-4 space-y-0.5 text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
        <p className="text-base font-bold">✈ JobMap Flight · St. Louis</p>
        <p>SPD {Math.round(hud.speedKts)} kts</p>
        <p>ALT {Math.round(hud.altitudeFt).toLocaleString()} ft</p>
        <p>HDG {String(heading).padStart(3, "0")}°</p>
        <div className="flex items-center gap-2">
          <span>THR</span>
          <span className="h-2 w-24 overflow-hidden rounded bg-black/40">
            <span className="block h-full bg-emerald-400" style={{ width: `${Math.round(hud.throttle * 100)}%` }} />
          </span>
        </div>
      </div>

      {/* Controls help, top-right */}
      <div className="pointer-events-none absolute right-4 top-4 hidden text-right text-xs leading-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] md:block">
        <p>↑ ↓ pitch · ← → roll</p>
        <p>A D rudder · W S throttle</p>
        <p>C camera ({hud.cameraMode}) · R respawn</p>
      </div>

      {hud.warning && (
        <p className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-lg bg-amber-500/90 px-3 py-1 text-sm font-bold text-black">
          {hud.warning}
        </p>
      )}

      {hud.crashed && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="rounded-2xl bg-black/50 px-6 py-3 text-2xl font-bold">💥 Crashed — respawning…</p>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 p-6 text-center text-sm">
          Could not start the flight: {error}
        </div>
      )}

      {/* Touch controls (mobile) */}
      <div className="absolute bottom-6 left-4 grid grid-cols-3 gap-2 md:hidden">
        <span />
        <HoldButton label="↑" axis="pitch" value={1} game={gameRef} />
        <span />
        <HoldButton label="←" axis="roll" value={-1} game={gameRef} />
        <HoldButton label="↓" axis="pitch" value={-1} game={gameRef} />
        <HoldButton label="→" axis="roll" value={1} game={gameRef} />
      </div>
      <div className="absolute bottom-6 right-4 flex flex-col gap-2 md:hidden">
        <HoldButton label="+" axis="throttle" value={1} game={gameRef} />
        <HoldButton label="−" axis="throttle" value={-1} game={gameRef} />
        <button
          type="button"
          onClick={() => gameRef.current?.cycleCamera()}
          className="flex size-14 items-center justify-center rounded-2xl bg-black/35 text-xs font-bold backdrop-blur-sm"
        >
          CAM
        </button>
      </div>

      <p className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] text-white/80 drop-shadow">
        {hud.mapLabel}
        {hud.attribution ? ` · ${hud.attribution}` : ""}
      </p>
    </div>
  );
}
