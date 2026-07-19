<!-- src/lib/components/ImageCropperModal.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { i18n } from '$lib/services/i18n.svelte';

	let {
		imageSrc = '',
		aspectRatio = 1, // width / height (e.g. 1 for profile, 16/9 for banner)
		shape = 'circle', // 'circle' | 'rect'
		onConfirm,
		onCancel
	}: {
		imageSrc: string;
		aspectRatio?: number;
		shape?: 'circle' | 'rect';
		onConfirm: (file: File) => void;
		onCancel: () => void;
	} = $props();

	let containerEl = $state<HTMLDivElement | null>(null);
	let imgEl = $state<HTMLImageElement | null>(null);

	// Image transformations
	let scale = $state(1);
	let minScale = $state(1);
	let maxScale = $state(3);
	let translateX = $state(0);
	let translateY = $state(0);

	// Dragging state
	let isDragging = $state(false);
	let startX = 0;
	let startY = 0;
	let initialTranslateX = 0;
	let initialTranslateY = 0;

	// Crop box sizing (computed reactively based on container size and aspect ratio)
	let containerWidth = $state(0);
	let containerHeight = $state(0);

	let cropWidth = $derived.by(() => {
		if (!containerWidth || !containerHeight) return 200;
		const maxW = containerWidth * 0.85;
		const maxH = containerHeight * 0.65;
		let w = maxW;
		let h = w / aspectRatio;
		if (h > maxH) {
			h = maxH;
			w = h * aspectRatio;
		}
		return w;
	});

	let cropHeight = $derived(cropWidth / aspectRatio);

	$effect(() => {
		if (containerEl) {
			const rect = containerEl.getBoundingClientRect();
			containerWidth = rect.width;
			containerHeight = rect.height;
		}
	});

	function handleImageLoad() {
		if (!imgEl || !containerWidth || !containerHeight) return;

		const imgW = imgEl.naturalWidth;
		const imgH = imgEl.naturalHeight;

		// Calculate minScale so the image covers the entire crop box
		const scaleX = cropWidth / imgW;
		const scaleY = cropHeight / imgH;
		minScale = Math.max(scaleX, scaleY);
		scale = minScale;

		// Center the image
		translateX = 0;
		translateY = 0;
	}

	let activePointers: PointerEvent[] = [];
	let initialPinchDistance = 0;
	let initialPinchScale = 1;

	function handlePointerDown(e: PointerEvent) {
		activePointers.push(e);

		if (activePointers.length === 1) {
			isDragging = true;
			startX = e.clientX;
			startY = e.clientY;
			initialTranslateX = translateX;
			initialTranslateY = translateY;
			if (containerEl) {
				containerEl.setPointerCapture(e.pointerId);
			}
		} else if (activePointers.length === 2) {
			isDragging = false;
			initialPinchDistance = Math.hypot(
				activePointers[0].clientX - activePointers[1].clientX,
				activePointers[0].clientY - activePointers[1].clientY
			);
			initialPinchScale = scale;
		}
	}

	function handlePointerMove(e: PointerEvent) {
		const idx = activePointers.findIndex((p) => p.pointerId === e.pointerId);
		if (idx !== -1) {
			activePointers[idx] = e;
		}

		if (activePointers.length === 2) {
			const dist = Math.hypot(
				activePointers[0].clientX - activePointers[1].clientX,
				activePointers[0].clientY - activePointers[1].clientY
			);
			if (initialPinchDistance > 0) {
				const factor = dist / initialPinchDistance;
				scale = Math.max(minScale, Math.min(maxScale, initialPinchScale * factor));
			}
		} else if (activePointers.length === 1 && isDragging && imgEl) {
			const dx = e.clientX - startX;
			const dy = e.clientY - startY;

			translateX = initialTranslateX + dx;
			translateY = initialTranslateY + dy;

			keepInBounds();
		}
	}

	function handlePointerUp(e: PointerEvent) {
		activePointers = activePointers.filter((p) => p.pointerId !== e.pointerId);

		if (activePointers.length === 0) {
			isDragging = false;
			if (containerEl) {
				try {
					containerEl.releasePointerCapture(e.pointerId);
				} catch {}
			}
		} else if (activePointers.length === 1) {
			const rem = activePointers[0];
			startX = rem.clientX;
			startY = rem.clientY;
			initialTranslateX = translateX;
			initialTranslateY = translateY;
			isDragging = true;
		}
	}

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		const zoomFactor = 0.05;
		if (e.deltaY < 0) {
			scale = Math.min(maxScale, scale + zoomFactor);
		} else {
			scale = Math.max(minScale, scale - zoomFactor);
		}
	}

	function keepInBounds() {
		if (!imgEl) return;
		const imgW = imgEl.naturalWidth * scale;
		const imgH = imgEl.naturalHeight * scale;

		// Limit dragging so the image always covers the crop box area
		const maxLimitX = (imgW - cropWidth) / 2;
		const maxLimitY = (imgH - cropHeight) / 2;

		translateX = Math.max(-maxLimitX, Math.min(maxLimitX, translateX));
		translateY = Math.max(-maxLimitY, Math.min(maxLimitY, translateY));
	}

	$effect(() => {
		if (scale && imgEl) {
			keepInBounds();
		}
	});

	let isHiding = $state(false);

	function handleConfirm() {
		if (!imgEl) return;
		isHiding = true;

		const canvas = document.createElement('canvas');
		canvas.width = cropWidth * 2; // high resolution crop
		canvas.height = cropHeight * 2;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		// Calculate coordinates on the original image
		const imgNaturalW = imgEl.naturalWidth;
		const imgNaturalH = imgEl.naturalHeight;

		// Scaled width and height in UI coordinate space
		const uiImgW = imgNaturalW * scale;
		const uiImgH = imgNaturalH * scale;

		// Translate offset of center of image relative to center of crop box
		const sourceCenterX = imgNaturalW / 2 - (translateX / scale);
		const sourceCenterY = imgNaturalH / 2 - (translateY / scale);

		const sourceCropW = cropWidth / scale;
		const sourceCropH = cropHeight / scale;

		const sourceX = sourceCenterX - sourceCropW / 2;
		const sourceY = sourceCenterY - sourceCropH / 2;

		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = 'high';

		ctx.drawImage(
			imgEl,
			sourceX,
			sourceY,
			sourceCropW,
			sourceCropH,
			0,
			0,
			canvas.width,
			canvas.height
		);

		canvas.toBlob((blob) => {
			if (blob) {
				const croppedFile = new File([blob], 'cropped-image.png', { type: 'image/png' });
				onConfirm(croppedFile);
			}
		}, 'image/png');
	}
</script>

<div
	class="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm {isHiding ? 'hidden' : ''}"
>
	<div
		class="w-full max-w-lg overflow-hidden rounded-3xl bg-white p-5 shadow-2xl dark:bg-slate-950 sm:p-6"
	>
		<div class="flex items-center justify-between pb-3">
			<h3 class="text-lg font-black text-slate-950 dark:text-white">
				{i18n.t('adjust_image') || 'Adjust image'}
			</h3>
			<button
				type="button"
				onclick={onCancel}
				class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
			>
				×
			</button>
		</div>

		<!-- Crop Area Container -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			bind:this={containerEl}
			onpointerdown={handlePointerDown}
			onpointermove={handlePointerMove}
			onpointerup={handlePointerUp}
			onpointercancel={handlePointerUp}
			onwheel={handleWheel}
			class="relative flex h-80 w-full items-center justify-center overflow-hidden rounded-2xl bg-slate-900 select-none touch-none"
			style="cursor: grab;"
		>
			{#if imageSrc}
				<img
					bind:this={imgEl}
					src={imageSrc}
					alt=""
					onload={handleImageLoad}
					class="absolute max-w-none origin-center pointer-events-none"
					style="transform: translate({translateX}px, {translateY}px) scale({scale});"
				/>
			{/if}

			<!-- Mask Overlay -->
			<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
				<!-- Top dark overlay (uses pure pixel units for maximum browser compatibility) -->
				<div
					class="absolute inset-0 bg-slate-950/60"
					style="clip-path: polygon(
						0px 0px, 
						{containerWidth}px 0px, 
						{containerWidth}px {containerHeight}px, 
						0px {containerHeight}px,
						0px { (containerHeight - cropHeight) / 2 }px,
						{ (containerWidth - cropWidth) / 2 }px { (containerHeight - cropHeight) / 2 }px,
						{ (containerWidth - cropWidth) / 2 }px { (containerHeight + cropHeight) / 2 }px,
						{ (containerWidth + cropWidth) / 2 }px { (containerHeight + cropHeight) / 2 }px,
						{ (containerWidth + cropWidth) / 2 }px { (containerHeight - cropHeight) / 2 }px,
						{ (containerWidth - cropWidth) / 2 }px { (containerHeight - cropHeight) / 2 }px,
						0px { (containerHeight - cropHeight) / 2 }px
					);"
				></div>

				<!-- Visual border cut-out ring -->
				<div
					class="border-2 border-dashed border-white shadow-2xl"
					style="
						width: {cropWidth}px; 
						height: {cropHeight}px;
						border-radius: {shape === 'circle' ? '9999px' : '1.5rem'};
					"
				></div>
			</div>
		</div>

		<!-- Zoom Control -->
		<div class="mt-5 flex items-center gap-4">
			<span class="text-xs font-bold text-slate-400">Zoom</span>
			<input
				type="range"
				min={minScale}
				max={maxScale}
				step="0.01"
				bind:value={scale}
				class="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-slate-200 dark:bg-slate-800"
			/>
		</div>

		<!-- Bottom buttons -->
		<div class="mt-6 flex justify-end gap-3">
			<button
				type="button"
				onclick={onCancel}
				class="rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
			>
				{i18n.t('cancel') || 'Cancel'}
			</button>
			<button
				type="button"
				onclick={handleConfirm}
				class="rounded-2xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
			>
				{i18n.t('crop') || 'Crop'}
			</button>
		</div>
	</div>
</div>

<style>
	input[type='range']::-webkit-slider-thumb {
		appearance: none;
		width: 1.25rem;
		height: 1.25rem;
		border-radius: 50%;
		background: #2563eb;
		cursor: pointer;
		box-shadow: 0 4px 6px -1px rgb(37 99 235 / 0.3);
	}
	input[type='range']::-moz-range-thumb {
		width: 1.25rem;
		height: 1.25rem;
		border-radius: 50%;
		background: #2563eb;
		border: none;
		cursor: pointer;
		box-shadow: 0 4px 6px -1px rgb(37 99 235 / 0.3);
	}
</style>
