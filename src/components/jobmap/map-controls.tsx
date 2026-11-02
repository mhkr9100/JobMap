"use client";

import { ArrowLeft, ArrowRight, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

export type CameraAction = "left" | "right";
export type FlightCameraView = "cockpit" | "chase-close" | "chase-far";

interface MapControlsProps {
  onHold: (action: CameraAction, active: boolean) => void;
  isHolding: boolean;
  onToggleHold: () => void;
  onHoldBrake: (active: boolean) => void;
  cameraView: FlightCameraView;
  onCameraViewChange: (view: FlightCameraView) => void;
}

function TurnButton({
  action,
  onHold,
  label,
  children,
}: {
  action: CameraAction;
  onHold: MapControlsProps["onHold"];
  label: string;
  children: React.ReactNode;
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
      onBlur={() => onHold(action, false)}
      onContextMenu={(e) => e.preventDefault()}
      className="flex h-12 min-w-24 select-none items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 shadow-xl transition hover:bg-blue-50 hover:text-blue-700 active:scale-95 active:bg-blue-600 active:text-white"
    >
      {children}
    </button>
  );
}

export default function MapControls({
  onHold,
  isHolding,
  onToggleHold,
  onHoldBrake,
  cameraView,
  onCameraViewChange,
}: MapControlsProps) {
  return (
    <div className="absolute bottom-6 left-6 z-20 flex flex-col items-start gap-2">
      <div className="flex items-center gap-2 rounded-3xl border border-slate-200/90 bg-white/95 p-2 shadow-2xl">
        <TurnButton action="left" onHold={onHold} label="Bank left (A or Left Arrow)">
          <ArrowLeft className="size-4" />
          Left
        </TurnButton>

        <button
          type="button"
          aria-pressed={isHolding}
          title="Hold position (Space)"
          onClick={onToggleHold}
          onPointerDown={(e) => {
            if (e.pointerType === "touch") {
              onHoldBrake(true);
            }
          }}
          onPointerUp={(e) => {
            if (e.pointerType === "touch") {
              onHoldBrake(false);
            }
          }}
          className={cn(
            "flex h-12 min-w-24 select-none items-center justify-center gap-1.5 rounded-2xl px-4 text-sm font-bold shadow-lg transition active:scale-95",
            isHolding
              ? "bg-amber-500 text-slate-950 hover:bg-amber-400"
              : "bg-blue-600 text-white hover:bg-blue-700",
          )}
        >
          {isHolding ? <Play className="size-4 fill-current" /> : <Pause className="size-4 fill-current" />}
          {isHolding ? "Fly" : "Hold"}
        </button>

        <TurnButton action="right" onHold={onHold} label="Bank right (D or Right Arrow)">
          Right
          <ArrowRight className="size-4" />
        </TurnButton>
      </div>

      <label className="flex items-center gap-2 rounded-xl border border-slate-200/90 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-lg">
        Camera
        <select
          value={cameraView}
          aria-label="Flight camera view"
          onChange={(event) => onCameraViewChange(event.target.value as FlightCameraView)}
          className="bg-transparent outline-none"
        >
          <option value="cockpit">Cockpit</option>
          <option value="chase-close">Close chase</option>
          <option value="chase-far">Far chase</option>
        </select>
      </label>
    </div>
  );
}
