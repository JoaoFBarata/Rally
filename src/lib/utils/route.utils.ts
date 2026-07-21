export type RoutePoint = { lat: number; lng: number };

export function calculateRouteDistanceKm(points: RoutePoint[] | null | undefined): number | null {
	if (!points || points.length < 2) return null;

	const earthRadiusKm = 6371;
	let totalKm = 0;
	for (let index = 1; index < points.length; index += 1) {
		const from = points[index - 1];
		const to = points[index];
		const latDelta = ((to.lat - from.lat) * Math.PI) / 180;
		const lngDelta = ((to.lng - from.lng) * Math.PI) / 180;
		const a = Math.sin(latDelta / 2) ** 2 + Math.cos((from.lat * Math.PI) / 180) * Math.cos((to.lat * Math.PI) / 180) * Math.sin(lngDelta / 2) ** 2;
		totalKm += 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
	}

	return totalKm;
}
