export function calculateVisibleDotIndexes(eventCount: number, currentIndex: number): number[] {
	if (eventCount <= 0) return [];
	if (eventCount <= 7) return Array.from({ length: eventCount }, (_, index) => index);

	const rawIndexes = [
		0,
		eventCount - 1,
		(currentIndex - 1 + eventCount) % eventCount,
		currentIndex,
		(currentIndex + 1) % eventCount
	];

	const uniqueIndexes = new Set<number>(rawIndexes);
	return [...uniqueIndexes].sort((a, b) => a - b);
}
