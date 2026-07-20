<script lang="ts">
	import { onMount } from 'svelte';
	import gsap from 'gsap';

	interface CardSwapItem {
		src: string;
		alt?: string;
	}

	interface Slot {
		x: number;
		y: number;
		z: number;
		zIndex: number;
	}

	let {
		items,
		width = 500,
		height = 400,
		cardDistance = 60,
		verticalDistance = 70,
		delay = 5000,
		pauseOnHover = false,
		skewAmount = 6,
		easing = 'elastic',
		onCardClick
	}: {
		items: CardSwapItem[];
		width?: number | string;
		height?: number | string;
		cardDistance?: number;
		verticalDistance?: number;
		delay?: number;
		pauseOnHover?: boolean;
		skewAmount?: number;
		easing?: 'linear' | 'elastic';
		onCardClick?: (idx: number) => void;
	} = $props();

	let container = $state<HTMLDivElement | null>(null);
	let cardEls: HTMLDivElement[] = [];

	function makeSlot(i: number, distX: number, distY: number, total: number): Slot {
		return {
			x: i * distX,
			y: -i * distY,
			z: -i * distX * 1.5,
			zIndex: total - i
		};
	}

	function placeNow(el: HTMLElement, slot: Slot, skew: number) {
		gsap.set(el, {
			x: slot.x,
			y: slot.y,
			z: slot.z,
			xPercent: -50,
			yPercent: -50,
			skewY: skew,
			transformOrigin: 'center center',
			zIndex: slot.zIndex,
			force3D: true
		});
	}

	onMount(() => {
		const config =
			easing === 'elastic'
				? {
						ease: 'elastic.out(0.6,0.9)',
						durDrop: 2,
						durMove: 2,
						durReturn: 2,
						promoteOverlap: 0.9,
						returnDelay: 0.05
					}
				: {
						ease: 'power1.inOut',
						durDrop: 0.8,
						durMove: 0.8,
						durReturn: 0.8,
						promoteOverlap: 0.45,
						returnDelay: 0.2
					};

		const total = cardEls.length;
		let order = Array.from({ length: total }, (_, i) => i);
		let tl: gsap.core.Timeline | null = null;
		let intervalId = 0;

		cardEls.forEach((el, i) => placeNow(el, makeSlot(i, cardDistance, verticalDistance, total), skewAmount));

		function swap() {
			if (order.length < 2) return;

			const [front, ...rest] = order;
			const elFront = cardEls[front];
			tl = gsap.timeline();

			tl.to(elFront, {
				y: '+=500',
				duration: config.durDrop,
				ease: config.ease
			});

			tl.addLabel('promote', `-=${config.durDrop * config.promoteOverlap}`);
			rest.forEach((idx, i) => {
				const el = cardEls[idx];
				const slot = makeSlot(i, cardDistance, verticalDistance, cardEls.length);
				tl!.set(el, { zIndex: slot.zIndex }, 'promote');
				tl!.to(
					el,
					{
						x: slot.x,
						y: slot.y,
						z: slot.z,
						duration: config.durMove,
						ease: config.ease
					},
					`promote+=${i * 0.15}`
				);
			});

			const backSlot = makeSlot(cardEls.length - 1, cardDistance, verticalDistance, cardEls.length);
			tl.addLabel('return', `promote+=${config.durMove * config.returnDelay}`);
			tl.call(
				() => {
					gsap.set(elFront, { zIndex: backSlot.zIndex });
				},
				undefined,
				'return'
			);
			tl.to(
				elFront,
				{
					x: backSlot.x,
					y: backSlot.y,
					z: backSlot.z,
					duration: config.durReturn,
					ease: config.ease
				},
				'return'
			);

			tl.call(() => {
				order = [...rest, front];
			});
		}

		swap();
		intervalId = window.setInterval(swap, delay);

		let pause: (() => void) | undefined;
		let resume: (() => void) | undefined;

		if (pauseOnHover && container) {
			pause = () => {
				tl?.pause();
				clearInterval(intervalId);
			};
			resume = () => {
				tl?.play();
				intervalId = window.setInterval(swap, delay);
			};
			container.addEventListener('mouseenter', pause);
			container.addEventListener('mouseleave', resume);
		}

		return () => {
			clearInterval(intervalId);
			if (pauseOnHover && container && pause && resume) {
				container.removeEventListener('mouseenter', pause);
				container.removeEventListener('mouseleave', resume);
			}
		};
	});
</script>

<div
	bind:this={container}
	class="card-swap-container"
	style={`width:${typeof width === 'number' ? `${width}px` : width}; height:${typeof height === 'number' ? `${height}px` : height};`}
>
	{#each items as item, i (item.src)}
		<div
			bind:this={cardEls[i]}
			class="card"
			style={`width:${typeof width === 'number' ? `${width}px` : width}; height:${typeof height === 'number' ? `${height}px` : height};`}
			role={onCardClick ? 'button' : 'img'}
			tabindex={onCardClick ? 0 : -1}
			onclick={() => onCardClick?.(i)}
			onkeydown={(e) => {
				if (onCardClick && (e.key === 'Enter' || e.key === ' ')) {
					e.preventDefault();
					onCardClick(i);
				}
			}}
		>
			<img src={item.src} alt={item.alt ?? ''} />
		</div>
	{/each}
</div>

<style>
	.card-swap-container {
		position: absolute;
		bottom: 0;
		right: 0;
		transform: translate(5%, 20%);
		transform-origin: bottom right;

		perspective: 900px;
		overflow: visible;
	}

	.card {
		position: absolute;
		top: 50%;
		left: 50%;
		overflow: hidden;
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		background: #000;
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.35);

		transform-style: preserve-3d;
		will-change: transform;
		backface-visibility: hidden;
		-webkit-backface-visibility: hidden;
	}

	.card img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: top center;
		display: block;
	}

	@media (max-width: 768px) {
		.card-swap-container {
			transform: scale(0.75) translate(25%, 25%);
		}
	}

	@media (max-width: 480px) {
		.card-swap-container {
			transform: scale(0.55) translate(25%, 25%);
		}
	}
</style>
