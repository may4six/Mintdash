"use client";

import { formatUnits } from "viem";
import { FormField, Input } from "@/components/ui/form-elements";

export function GasSettings({
  suggestedMaxFeeWei,
  suggestedPriorityFeeWei,
  maxFeeGwei,
  priorityFeeGwei,
  onChange,
}: {
  suggestedMaxFeeWei?: string;
  suggestedPriorityFeeWei?: string;
  maxFeeGwei: string;
  priorityFeeGwei: string;
  onChange: (next: { maxFeeGwei: string; priorityFeeGwei: string }) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <FormField
        label="Max fee (gwei)"
        hint={suggestedMaxFeeWei ? `Suggested: ${formatUnits(BigInt(suggestedMaxFeeWei), 9)}` : undefined}
      >
        <Input
          inputMode="decimal"
          value={maxFeeGwei}
          onChange={(e) => onChange({ maxFeeGwei: e.target.value, priorityFeeGwei })}
        />
      </FormField>
      <FormField
        label="Priority fee (gwei)"
        hint={suggestedPriorityFeeWei ? `Suggested: ${formatUnits(BigInt(suggestedPriorityFeeWei), 9)}` : undefined}
      >
        <Input
          inputMode="decimal"
          value={priorityFeeGwei}
          onChange={(e) => onChange({ maxFeeGwei, priorityFeeGwei: e.target.value })}
        />
      </FormField>
    </div>
  );
}
