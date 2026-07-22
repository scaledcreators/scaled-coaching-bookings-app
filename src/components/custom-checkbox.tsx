"use client";
import { Check } from "lucide-react";

export function CustomCheckbox({ checked, onChange, label, description }: { checked: boolean; onChange: (checked: boolean) => void; label: string; description?: string }) {
  return <label className={`custom-checkbox ${checked ? "checked" : ""}`}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)}/><span className="checkbox-box" aria-hidden>{checked && <Check size={14} strokeWidth={3}/>}</span><span className="checkbox-copy"><strong>{label}</strong>{description && <small>{description}</small>}</span></label>;
}
