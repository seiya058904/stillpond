import { Minus, Plus } from "lucide-react";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import type { SettingInteraction } from "./settings/react";

const RANGE_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

/** The rounded, colored square that leads a row in iOS Settings. */
export function IconTile({color, children}: {color: string; children: ReactNode}) {
  return <span className="icon-tile" aria-hidden="true" style={{"--tile": color} as CSSProperties}>{children}</span>;
}

export function Stepper({value, min, max, onChange, decreaseLabel, increaseLabel}: {
  value: number; min: number; max: number; onChange: (value: number) => void; decreaseLabel: string; increaseLabel: string;
}) {
  return <div className="ios-stepper" data-base-ui-swipe-ignore>
    <button type="button" aria-label={decreaseLabel} disabled={value <= min} onClick={() => onChange(value - 1)}><Minus aria-hidden="true" /></button>
    <span className="ios-stepper__divider" aria-hidden="true" />
    <button type="button" aria-label={increaseLabel} disabled={value >= max} onClick={() => onChange(value + 1)}><Plus aria-hidden="true" /></button>
  </div>;
}

export function SegmentedControl<T extends string>({label, options, value, onChange}: {
  label: string; options: readonly {value: T; label: string}[]; value: T; onChange: (value: T) => void;
}) {
  const selected = options.findIndex(option => option.value === value);
  return <div className="ios-segmented" role="group" aria-label={label} data-base-ui-swipe-ignore
    style={{"--segments": options.length, "--selected": selected} as CSSProperties}>
    {selected >= 0 && <span className="ios-segmented__thumb" aria-hidden="true" />}
    {options.map(option => <button type="button" key={option.value} aria-pressed={option.value === value} onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>;
}

/** A native range input, so keyboard and screen-reader support come with it. */
export function RangeInput({id, min, max, step, value, onChange, ariaLabel, valueText, onInteractionStart, onInteractionEnd}: {
  id?: string; min: number; max: number; step: number; value: number; onChange: (value: number) => void; ariaLabel?: string; valueText?: string;
} & Partial<SettingInteraction>) {
  const held = useRef(false);
  const begin = () => {
    if (held.current) return;
    held.current = true;
    onInteractionStart?.();
  };
  const end = () => {
    if (!held.current) return;
    held.current = false;
    onInteractionEnd?.();
  };
  useEffect(() => {
    const finish = () => {
      if (!held.current) return;
      held.current = false;
      onInteractionEnd?.();
    };
    const visibility = () => { if (document.hidden) finish(); };
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("blur", finish);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      finish();
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", finish);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [onInteractionEnd]);
  const fill = max > min ? (value - min) / (max - min) * 100 : 0;
  return <input id={id} className="pond-range" type="range" min={min} max={max} step={step} value={value} aria-label={ariaLabel} aria-valuetext={valueText}
    onPointerDown={event => { if (event.isPrimary && event.button === 0) begin(); }} onBlur={end}
    onKeyDown={event => { if (RANGE_KEYS.has(event.key)) begin(); }}
    onKeyUp={event => { if (RANGE_KEYS.has(event.key)) end(); }}
    style={{"--range": `${fill}%`} as CSSProperties} onChange={event => onChange(Number(event.target.value))} />;
}
