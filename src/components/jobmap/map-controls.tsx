"use client";

import { useState, type ReactNode, type RefObject } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Box,
  ChevronsDown,
  ChevronsUp,
  Gauge,
  Keyboard,
  MapPin,
  Minus,
  Navigation2,
  Pause,
  Plane,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Continuous camera actions, shared by keyboard and on-screen buttons. */
export type CameraAction =
  | "forward"
  | "back"
  | "left"
  | "right"
  | "rotateLeft"
  | "rotateRight"
  | "tiltUp"
  | "tiltDown"
  | "zoomIn"
  | "zoomOut";

export type FlightCameraView = "cockpit" | "chase-close" | "chase-far";
export type ThrottleLevel = 1 | 2 | 3;
export type FlightVisionMode = "day" | "nvg" | "flir";

interface MapControlsProps {
  onHold: (action: CameraAction, active: boolean) => void;
  onResetNorth: () => void;
  onToggle3D: () => void;
  onCameraViewChange: (view: FlightCameraView) => void;
  cameraView: FlightCameraView;
  visionMode: FlightVisionMode;
  onVisionModeChange: (mode: FlightVisionMode) => void;
  is3D: boolean;
  isFlying: boolean;
  onToggleFlying: () => void;
  throttle: ThrottleLevel;
  onThrottleChange: (level: ThrottleLevel) => void;
  onChangeStartLocation?: () => void;
  compassRef: RefObject<HTMLSpanElement | null>;
}

function HoldButton({
  action,
  onHold,
  label,
  children,
  className,
}: {
  action: CameraAction;
  onHold: MapControlsProps["onHold"];
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onHold(action, true);
      }}
      onPointerUp={() => onHold(action, false)}
      onPointerCancel={() => onHold(action, false)}
      onLostPointerCapture={() => onHold(action, false)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onHold(action, true);
        }
      }}
      onKeyUp={(event) => {
        if (event.key === "Enter" || event.key === " ") onHold(action, false);
      }}
      onBlur={() => onHold(action, false)}
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        "flex size-9 select-none items-center justify-center rounded-xl text-slate-700 transition hover:bg-blue-50 hover:text-blue-700 active:scale-95 active:bg-blue-100",
        className,
      )}
    >
      {children}
    </button>
  );
}

const SHORTCUTS: [string, string][] = [
  ["Space", "Toggle Cruise Flight / Hover"],
  ["W / ↑ or S / ↓", "Thrust forward / reverse"],
  ["A / D or ← / →", "Bank & turn left / right"],
  ["Q / E", "Yaw / rotate 360°"],
  ["R / F", "Pitch nose up / down"],
  ["Z / X or + / −", "Altitude (3D lock)"],
  ["1 / 2 / 3", "Throttle (55 / 95 / 160 KTS)"],
  ["T", "Lock & inspect target building"],
  ["V", "Cycle Vision (Day / NVG / FLIR)"],
  ["Shift", "Afterburner boost"],
  ["N", "Align North"],
];

export default function MapControls({
  onHold,
  onResetNorth,
  onToggle3D,
  onCameraViewChange,
  cameraView,
  visionMode,
  onVisionModeChange,
  is3D,
  isFlying,
  onToggleFlying,
  throttle,
  onThrottleChange,
  onChangeStartLocation,
  compassRef,
}: MapControlsProps) {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="absolute bottom-24 left-4 z-20 flex flex-col items-start gap-2 md:left-6">
      {showHelp && (
        <div className="w-72 rounded-2xl border border-white/40 bg-slate-950/95 p-3.5 text-xs text-slate-100 shadow-2xl backdrop-blur-2xl">
          <p className="mb-2 flex items-center gap-1.5 font-bold text-sky-400">
            <Plane className="size-3.5" /> Flight Simulator Controls
          </p>
          <ul className="space-y-1.5">
            {SHORTCUTS.map(([keys, desc]) => (
              <li key={keys} className="flex justify-between gap-2">
                <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-sky-300">{keys}</span>
                <span className="text-slate-300">{desc}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Flight Throttle & Cruise Deck */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-700/80 bg-slate-950/90 p-1.5 text-white shadow-2xl backdrop-blur-2xl">
        <button
          type="button"
          onClick={onToggleFlying}
          title="Toggle continuous flight (Space)"
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold tracking-wide transition active:scale-95",
            isFlying
              ? "bg-emerald-500 text-slate-950 shadow-[0_0_16px_rgba(16,185,129,0.5)] hover:bg-emerald-400"
              : "bg-amber-500/20 text-amber-300 border border-amber-400/40 hover:bg-amber-500/30",
          )}
        >
          {isFlying ? <Pause className="size-3.5 fill-current" /> : <Play className="size-3.5 fill-current" />}
          {isFlying ? "CRUISING" : "HOVERING"}
        </button>

        <div className="flex items-center gap-0.5 rounded-xl bg-slate-900 p-0.5" role="group" aria-label="Throttle speed">
          <Gauge className="mx-1.5 size-3.5 text-sky-400" />
          {([1, 2, 3] as ThrottleLevel[]).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => onThrottleChange(level)}
              title={`Throttle ${level}x (${level === 1 ? "55 KTS" : level === 2 ? "95 KTS" : "160 KTS"})`}
              className={cn(
                "rounded-lg px-2 py-1 font-mono text-[11px] font-bold transition",
                throttle === level
                  ? "bg-sky-500 text-slate-950 shadow-sm"
                  : "text-slate-400 hover:text-white",
              )}
            >
              {level === 1 ? "SLOW" : level === 2 ? "CRUISE" : "BOOST"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-0.5 rounded-xl bg-slate-900 p-0.5" role="group" aria-label="Avionics vision mode">
          {(["day", "nvg", "flir"] as FlightVisionMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onVisionModeChange(mode)}
              title={`Vision Mode: ${mode.toUpperCase()} (V)`}
              className={cn(
                "rounded-lg px-2 py-1 font-mono text-[10px] font-bold uppercase transition",
                visionMode === mode
                  ? mode === "nvg"
                    ? "bg-emerald-500 text-slate-950"
                    : mode === "flir"
                      ? "bg-amber-400 text-slate-950"
                      : "bg-slate-200 text-slate-950"
                  : "text-slate-400 hover:text-white",
              )}
            >
              {mode}
            </button>
          ))}
        </div>

        {onChangeStartLocation && (
          <button
            type="button"
            onClick={onChangeStartLocation}
            title="Change takeoff location"
            className="flex h-9 items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/90 px-2.5 text-[11px] font-semibold text-slate-200 transition hover:border-sky-400 hover:text-sky-300"
          >
            <MapPin className="size-3.5 text-sky-400" />
            Takeoff
          </button>
        )}
      </div>

      <div className="flex items-end gap-2">
        {/* Rotation / tilt / zoom column */}
        <div className="flex flex-col items-center gap-0.5 rounded-2xl border border-white/40 bg-white/95 p-1 shadow-2xl backdrop-blur-2xl">
          <button
            type="button"
            onClick={onResetNorth}
            title="Face north (N)"
            aria-label="Face north"
            className="flex size-9 items-center justify-center rounded-xl hover:bg-blue-50"
          >
            <span ref={compassRef} className="flex transition-transform duration-75">
              <Navigation2 className="size-4 fill-red-500 text-red-500" />
            </span>
          </button>
          <HoldButton action="rotateLeft" onHold={onHold} label="Bank / turn left (Q)">
            <RotateCcw className="size-4" />
          </HoldButton>
          <HoldButton action="rotateRight" onHold={onHold} label="Bank / turn right (E)">
            <RotateCw className="size-4" />
          </HoldButton>
          <div className="my-0.5 h-px w-6 bg-slate-200" />
          <HoldButton action="tiltUp" onHold={onHold} label="Pitch up (R)">
            <ChevronsUp className="size-4" />
          </HoldButton>
          <HoldButton action="tiltDown" onHold={onHold} label="Pitch down (F)">
            <ChevronsDown className="size-4" />
          </HoldButton>
          <div className="my-0.5 h-px w-6 bg-slate-200" />
          <HoldButton action="zoomIn" onHold={onHold} label="Descend / zoom in (Z)">
            <Plus className="size-4" />
          </HoldButton>
          <HoldButton action="zoomOut" onHold={onHold} label="Climb / zoom out (X)">
            <Minus className="size-4" />
          </HoldButton>
        </div>

        {/* Flight Yoke D-pad + Camera view toggles */}
        <div className="flex flex-col items-center gap-2">
          <div className="grid grid-cols-3 gap-0.5 rounded-2xl border border-white/40 bg-white/95 p-1 shadow-2xl backdrop-blur-2xl">
            <span />
            <HoldButton action="forward" onHold={onHold} label="Fly forward (W / Up)">
              <ArrowUp className="size-4" />
            </HoldButton>
            <span />
            <HoldButton action="left" onHold={onHold} label="Bank left (A / Left)">
              <ArrowLeft className="size-4" />
            </HoldButton>
            <button
              type="button"
              onClick={onToggleFlying}
              title={isFlying ? "Pause flight (Hover)" : "Resume cruise flight"}
              aria-label={isFlying ? "Pause flight" : "Resume flight"}
              className={cn(
                "flex size-9 items-center justify-center rounded-xl transition",
                isFlying ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-blue-50",
              )}
            >
              <Plane className="size-4 -rotate-45" />
            </button>
            <HoldButton action="right" onHold={onHold} label="Bank right (D / Right)">
              <ArrowRight className="size-4" />
            </HoldButton>
            <span />
            <HoldButton action="back" onHold={onHold} label="Reverse / slow (S / Down)">
              <ArrowDown className="size-4" />
            </HoldButton>
            <span />
          </div>
          <div className="flex gap-1 rounded-2xl border border-white/40 bg-white/95 p-1 shadow-2xl backdrop-blur-2xl">
            <button
              type="button"
              onClick={onToggle3D}
              title={is3D ? "Switch to 2D" : "Switch to 3D"}
              className={cn(
                "flex h-9 items-center gap-1 rounded-xl px-2.5 text-xs font-bold transition",
                is3D ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-blue-50",
              )}
            >
              <Box className="size-3.5" />
              {is3D ? "3D" : "2D"}
            </button>
            <button
              type="button"
              onClick={() => setShowHelp((v) => !v)}
              title="Flight keyboard controls"
              aria-label="Flight keyboard controls"
              className={cn(
                "flex size-9 items-center justify-center rounded-xl transition",
                showHelp ? "bg-slate-800 text-white" : "text-slate-700 hover:bg-blue-50",
              )}
            >
              <Keyboard className="size-4" />
            </button>
          </div>
          <label className="flex items-center gap-2 rounded-xl border border-white/50 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 shadow-xl">
            Camera
            <select
              value={cameraView}
              aria-label="Flight camera view"
              onChange={(event) => onCameraViewChange(event.target.value as FlightCameraView)}
              className="max-w-28 bg-transparent outline-none"
            >
              <option value="cockpit">Cockpit</option>
              <option value="chase-close">Close chase</option>
              <option value="chase-far">Far chase</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
