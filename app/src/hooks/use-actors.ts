import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface Actor {
  id: string;
  legalName: string;
  officialProfileImageUrl: string | null;
  chatDisplayName: string;
  chatProfileImageUrl: string | null;
  monthlyPriceCents: number;
}

export function useActors(query: string) {
  return useQuery({
    queryKey: ['actors', query],
    queryFn: () => apiClient.get<Actor[]>(`/actors${query ? `?q=${encodeURIComponent(query)}` : ''}`),
  });
}

export function useActor(id: string) {
  return useQuery({
    queryKey: ['actors', id],
    queryFn: () => apiClient.get<Actor>(`/actors/${id}`),
    enabled: !!id,
  });
}
