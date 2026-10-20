import { useQuery } from "@tanstack/react-query";
import { api, type BridgeConfig, type BridgeStatus, type NamedList } from "@/lib/api";

export function useStatus() {
  return useQuery({ queryKey: ["status"], queryFn: () => api<BridgeStatus>("/api/status"), refetchInterval: 5000 });
}

export function useBridgeConfig() {
  return useQuery({ queryKey: ["config"], queryFn: () => api<BridgeConfig>("/api/config") });
}

// Names from the ChirpStack API; without an API key the lists are empty and IDs are typed
export function useApplications() {
  return useQuery({
    queryKey: ["chirpstack", "applications"],
    queryFn: () => api<NamedList>("/api/chirpstack/applications"),
    staleTime: 60_000,
  });
}

export function useGateways() {
  return useQuery({
    queryKey: ["chirpstack", "gateways"],
    queryFn: () => api<NamedList>("/api/chirpstack/gateways"),
    staleTime: 60_000,
  });
}
