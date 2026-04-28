import { prisma } from "@/lib/prisma";

export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function findNearestStores(userLat: number, userLng: number, limit = 5) {
  const stores = await prisma.janAushadhiStore.findMany({
    where: { lat: { not: null }, lng: { not: null } },
  });

  return stores
    .map((store) => ({
      ...store,
      distanceKm: haversineDistance(userLat, userLng, store.lat!, store.lng!),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}
