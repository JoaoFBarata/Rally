import { describe, expect, it } from 'vitest';
import { calculateVisibleDotIndexes } from './carousel.utils';

describe('calculateVisibleDotIndexes', () => {
	it('returns sequential indexes when event count is 7 or fewer', () => {
		expect(calculateVisibleDotIndexes(5, 0)).toEqual([0, 1, 2, 3, 4]);
		expect(calculateVisibleDotIndexes(7, 3)).toEqual([0, 1, 2, 3, 4, 5, 6]);
	});

	it('guarantees unique keys without duplicate indices when event count is greater than 7', () => {
		for (let eventCount = 8; eventCount <= 12; eventCount++) {
			for (let currentIndex = 0; currentIndex < eventCount; currentIndex++) {
				const dots = calculateVisibleDotIndexes(eventCount, currentIndex);
				const uniqueDots = new Set(dots);
				expect(dots.length).toBe(uniqueDots.size);
			}
		}
	});

	it('correctly calculates dot positions at boundary currentIndex 0', () => {
		const dots = calculateVisibleDotIndexes(10, 0);
		expect(dots).toEqual([0, 1, 9]);
		expect(new Set(dots).size).toBe(dots.length);
	});
});
