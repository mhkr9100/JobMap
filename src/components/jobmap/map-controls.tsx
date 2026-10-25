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
  Keyboard,
  Minus,
  Navigation2,
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

interface MapControlsProps {
  onHold: (action: CameraAction, active: boolean) => void;
  onResetNorth: () => void;
  onToggle3D: () => void;
  is3D: boolean;
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
  ["W A S D / Arrows", "Move"],
  ["Q / E", "Rotate 360°"],
  ["R / F", "Tilt camera"],
  ["Z / X or + / −", "Zoom"],
  ["Shift", "Move faster"],
  ["N", "Face north"],
  ["Right-drag / Ctrl-drag", "Orbit with mouse"],
];

export default function MapControls({
  onHold,
  onResetNorth,
  onToggle3D,
  is3D,
  compassRef,
}: MapControlsProps) {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="absolute bottom-6 right-6 z-20 flex flex-col items-end gap-2">
      {showHelp && (
        <div className="w-64 rounded-2xl border border-white/40 bg-white/95 p-3 text-xs shadow-2xl backdrop-blur-2xl">
          <p className="mb-2 font-bold text-slate-800">Map controls</p>
          <ul className="space-y-1">
            {SHORTCUTS.map(([keys, desc]) => (
              <li key={keys} className="flex justify-between gap-2">
                <span className="font-mono text-[11px] text-slate-600">{keys}</span>
                <span className="text-slate-500">{desc}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Rotation / tilt / zoom column */}
        <div className="flex flex-col items-center gap-0.5 rounded-2xl border border-white/40 bg-white/95 p-1 shadow-2xl backdrop-blur-2xl">
          <button
            type="button"
            onClick={onResetNorth}
            title="Face north"
            aria-label="Face north"
            className="flex size-9 items-center justify-center rounded-xl hover:bg-blue-50"
          >
            <span ref={compassRef} className="flex transition-transform duration-75">
              <Navigation2 className="size-4 fill-red-500 text-red-500" />
            </span>
          </button>
          <HoldButton action="rotateLeft" onHold={onHold} label="Rotate left (Q)">
            <RotateCcw className="size-4" />
          </HoldButton>
          <HoldButton action="rotateRight" onHold={onHold} label="Rotate right (E)">
            <RotateCw className="size-4" />
          </HoldButton>
          <div className="my-0.5 h-px w-6 bg-slate-200" />
          <HoldButton action="tiltUp" onHold={onHold} label="Tilt up (R)">
            <ChevronsUp className="size-4" />
          </HoldButton>
          <HoldButton action="tiltDown" onHold={onHold} label="Tilt down (F)">
            <ChevronsDown className="size-4" />
          </HoldButton>
          <div className="my-0.5 h-px w-6 bg-slate-200" />
          <HoldButton action="zoomIn" onHold={onHold} label="Zoom in (Z)">
            <Plus className="size-4" />
          </HoldButton>
          <HoldButton action="zoomOut" onHold={onHold} label="Zoom out (X)">
            <Minus className="size-4" />
          </HoldButton>
        </div>

        {/* D-pad + toggles */}
        <div className="flex flex-col items-center gap-2">
          <div className="grid grid-cols-3 gap-0.5 rounded-2xl border border-white/40 bg-white/95 p-1 shadow-2xl backdrop-blur-2xl">
            <span />
            <HoldButton action="forward" onHold={onHold} label="Move forward (W)">
              <ArrowUp className="size-4" />
            </HoldButton>
            <span />
            <HoldButton action="left" onHold={onHold} label="Move left (A)">
              <ArrowLeft className="size-4" />
            </HoldButton>
            <span className="flex size-9 items-center justify-center">
              <span className="size-2 rounded-full bg-slate-300" />
            </span>
            <HoldButton action="right" onHold={onHold} label="Move right (D)">
              <ArrowRight className="size-4" />
            </HoldButton>
            <span />
            <HoldButton action="back" onHold={onHold} label="Move back (S)">
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
              title="Keyboard shortcuts"
              aria-label="Keyboard shortcuts"
              className={cn(
                "flex size-9 items-center justify-center rounded-xl transition",
                showHelp ? "bg-slate-800 text-white" : "text-slate-700 hover:bg-blue-50",
              )}
            >
              <Keyboard className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
