"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CampaignDTO } from "@/types";

async function fetchCampaigns(chainId?: number): Promise<CampaignDTO[]> {
  const params = new URLSearchParams();
  if (chainId) params.set("chainId", String(chainId));
  const res = await fetch(`/api/campaigns?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to load campaigns");
  const data = (await res.json()) as { campaigns: CampaignDTO[] };
  return data.campaigns;
}

async function fetchCampaign(id: string): Promise<CampaignDTO> {
  const res = await fetch(`/api/campaigns/${id}`);
  if (!res.ok) throw new Error("Failed to load campaign");
  const data = (await res.json()) as { campaign: CampaignDTO };
  return data.campaign;
}

export function useCampaigns(chainId?: number) {
  return useQuery({
    queryKey: ["campaigns", chainId ?? "all"],
    queryFn: () => fetchCampaigns(chainId),
  });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: ["campaign", id],
    queryFn: () => fetchCampaign(id),
    enabled: !!id,
  });
}

export function useInvalidateCampaigns() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["campaigns"] });
}
