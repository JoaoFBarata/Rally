import { describe, it, expect } from 'vitest';
import {
	getMinParticipantsDeadlineMs,
	isMinParticipantsRequirementMet,
	isMinParticipantsDeadlinePassed,
	getEventTemporalState,
	DEFAULT_MIN_PARTICIPANTS_DEADLINE_HOURS
} from './event-lifecycle.utils';
import { getEventPaymentSummary } from '$lib/services/event.service';
import type { SportEvent } from '$lib/schema';

describe('event-lifecycle minParticipants utils', () => {
	const baseEvent = {
		id: 'evt-1',
		title: 'Match',
		sport: 'football',
		creatorId: 'user-1',
		location: { name: 'Pitch' },
		startAt: { toMillis: () => 1700000000000 }, // timestamp
		maxParticipants: 10,
		participantIds: ['user-1', 'user-2'],
		visibility: 'public',
		status: 'open',
		createdAt: { toMillis: () => 1600000000000 },
		updatedAt: { toMillis: () => 1600000000000 }
	} as unknown as SportEvent;

	describe('getMinParticipantsDeadlineMs', () => {
		it('returns null if minParticipants is not set or 0', () => {
			expect(getMinParticipantsDeadlineMs(baseEvent)).toBeNull();
		});

		it('calculates deadline based on minParticipantsDeadlineHours (default 8h)', () => {
			const eventWithMin = { ...baseEvent, minParticipants: 4 };
			const startMs = 1700000000000;
			const expectedDeadline = startMs - 8 * 60 * 60 * 1000;
			expect(getMinParticipantsDeadlineMs(eventWithMin)).toBe(expectedDeadline);
		});

		it('calculates deadline with custom deadline hours (e.g. 4h)', () => {
			const eventWithCustomDeadline = {
				...baseEvent,
				minParticipants: 4,
				minParticipantsDeadlineHours: 4
			};
			const startMs = 1700000000000;
			const expectedDeadline = startMs - 4 * 60 * 60 * 1000;
			expect(getMinParticipantsDeadlineMs(eventWithCustomDeadline)).toBe(expectedDeadline);
		});
	});

	describe('isMinParticipantsRequirementMet', () => {
		it('returns true if no minParticipants is set', () => {
			expect(isMinParticipantsRequirementMet(baseEvent)).toBe(true);
		});

		it('returns false if participant count is lower than minParticipants', () => {
			const eventWithMin = { ...baseEvent, minParticipants: 4, participantIds: ['u1', 'u2'] };
			expect(isMinParticipantsRequirementMet(eventWithMin)).toBe(false);
		});

		it('returns true if participant count reaches minParticipants', () => {
			const eventWithMin = { ...baseEvent, minParticipants: 4, participantIds: ['u1', 'u2', 'u3', 'u4'] };
			expect(isMinParticipantsRequirementMet(eventWithMin)).toBe(true);
		});
	});

	describe('isMinParticipantsDeadlinePassed', () => {
		it('returns false when current time is before deadline', () => {
			const eventWithMin = { ...baseEvent, minParticipants: 4, minParticipantsDeadlineHours: 8 };
			const deadlineMs = 1700000000000 - 8 * 60 * 60 * 1000;
			expect(isMinParticipantsDeadlinePassed(eventWithMin, deadlineMs - 1000)).toBe(false);
		});

		it('returns true when current time is at or after deadline', () => {
			const eventWithMin = { ...baseEvent, minParticipants: 4, minParticipantsDeadlineHours: 8 };
			const deadlineMs = 1700000000000 - 8 * 60 * 60 * 1000;
			expect(isMinParticipantsDeadlinePassed(eventWithMin, deadlineMs)).toBe(true);
			expect(isMinParticipantsDeadlinePassed(eventWithMin, deadlineMs + 1000)).toBe(true);
		});
	});

	describe('getEventTemporalState with minParticipants', () => {
		it('returns cancelled if deadline passed and minimum participants requirement is not met', () => {
			const eventWithMin = { ...baseEvent, minParticipants: 4, minParticipantsDeadlineHours: 8, participantIds: ['u1'] };
			const deadlineMs = 1700000000000 - 8 * 60 * 60 * 1000;
			expect(getEventTemporalState(eventWithMin, deadlineMs + 500)).toBe('cancelled');
		});

		it('returns upcoming/live/starting_soon if deadline passed but minimum requirement IS met', () => {
			const eventWithMin = { ...baseEvent, minParticipants: 4, minParticipantsDeadlineHours: 8, participantIds: ['u1', 'u2', 'u3', 'u4'] };
			const deadlineMs = 1700000000000 - 8 * 60 * 60 * 1000;
			expect(getEventTemporalState(eventWithMin, deadlineMs + 500)).toBe('upcoming');
		});
	});

	describe('getEventPaymentSummary on cancelled / under-subscribed events', () => {
		it('removes payment requirement (pendingCount = 0, splitAmount = null, statuses = not_required) for cancelled events', () => {
			const paidEvent = {
				...baseEvent,
				priceTotal: 40,
				status: 'cancelled',
				participantIds: ['user-1', 'user-2', 'user-3']
			} as unknown as SportEvent;

			const summary = getEventPaymentSummary(paidEvent);
			expect(summary.pendingCount).toBe(0);
			expect(summary.splitAmount).toBeNull();
			expect(summary.statuses['user-2']).toBe('not_required');
			expect(summary.statuses['user-3']).toBe('not_required');
		});
	});
});
