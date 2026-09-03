"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AutomationSettingsDTO } from "@/types";

async function fetchSettings(): Promise<AutomationSettingsDTO> {
  const res = await fetch("/api/automation/settings");
  if (!res.ok) throw new Error("Failed to load automation settings");
  const data = (await res.json()) as { settings: AutomationSettingsDTO };
  return data.settings;
}

export interface UpdateAutomationSettingsInput {
  automationEnabled: boolean;
  maxSpendPerDayWei?: string | null;
  maxGasPriceWei?: string | null;
  maxConcurrentRuns?: number;
}

async function updateSettings(input: UpdateAutomationSettingsInput): Promise<AutomationSettingsDTO> {
  const res = await fetch("/api/automation/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to update automation settings");
  return data.settings as AutomationSettingsDTO;
}

/** The kill switch. automationEnabled is false until a user explicitly
 * flips it on — every sniper/copy rule's monitoring loop checks this. */
export function useAutomationSettings() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["automation-settings"], queryFn: fetchSettings });

  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: (settings) => {
      queryClient.setQueryData(["automation-settings"], settings);
    },
  });

  return {
    settings: query.data,
    isLoading: query.isLoading,
    update: mutation.mutate,
    isUpdating: mutation.isPending,
  };
}
