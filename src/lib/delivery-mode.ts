import type { DeliveryMode } from "@/lib/types";

export const DELIVERY_MODE_OPTIONS: Array<{
  value: DeliveryMode;
  label: string;
}> = [
  { value: "in_person", label: "In person" },
  { value: "video", label: "Video call" },
  { value: "phone", label: "Phone call" },
  { value: "decided_later", label: "Decided after approval" },
];

export function deliveryModeLabel(mode: DeliveryMode | undefined) {
  return (
    DELIVERY_MODE_OPTIONS.find((option) => option.value === mode)?.label ??
    "Decided after approval"
  );
}
