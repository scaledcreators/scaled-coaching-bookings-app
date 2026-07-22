"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export type SelectOption = { value: string; label: string };
export function CustomSelect({ value, options, onChange, placeholder = "Choose an option", disabled = false, ariaLabel }: { value: string; options: SelectOption[]; onChange: (value: string) => void; placeholder?: string; disabled?: boolean; ariaLabel?: string }) {
  const [open, setOpen] = useState(false); const root = useRef<HTMLDivElement>(null); const selected = options.find((option) => option.value === value);
  useEffect(() => { if (!open) return; const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); }; const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); }; document.addEventListener("pointerdown", close); document.addEventListener("keydown", escape); return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); }; }, [open]);
  return <div className={`custom-select ${open ? "open" : ""}`} ref={root}><button type="button" className="custom-select-trigger" aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel ?? placeholder} disabled={disabled} onClick={() => setOpen((current) => !current)}><span className={selected ? "" : "muted"}>{selected?.label ?? placeholder}</span><ChevronDown size={16}/></button>{open && <div className="custom-select-menu" role="listbox">{options.length ? options.map((option) => <button type="button" role="option" aria-selected={option.value === value} className={`custom-select-option ${option.value === value ? "selected" : ""}`} key={option.value || "__empty"} onClick={() => { onChange(option.value); setOpen(false); }}><span>{option.label}</span>{option.value === value && <Check size={15}/>}</button>) : <span className="custom-select-empty">No options available.</span>}</div>}</div>;
}
