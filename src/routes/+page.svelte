<script lang="ts">
	import {
		CANVAS_SIZE,
		compareSvgTexts,
		formatPercent,
		validateSvg,
		type Scores
	} from '$lib/svg-comparison';
	import { onDestroy } from 'svelte';

	type Side = 'left' | 'right';
	type UploadState = {
		fileName: string;
		text: string;
		previewUrl: string;
		error: string | null;
	};
	let left = $state<UploadState | null>(null);
	let right = $state<UploadState | null>(null);
	let scores = $state<Scores | null>(null);
	let comparing = $state(false);
	let compareError = $state<string | null>(null);
	let dragTarget = $state<Side | null>(null);

	let canCompare = $derived(Boolean(left?.text && right?.text && !left.error && !right.error));

	onDestroy(() => {
		revokePreview(left);
		revokePreview(right);
	});

	async function handleInput(side: Side, event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];

		if (file) {
			await loadFile(side, file);
		}

		input.value = '';
	}

	async function handleDrop(side: Side, event: DragEvent) {
		event.preventDefault();
		dragTarget = null;
		const file = event.dataTransfer?.files?.[0];

		if (file) {
			await loadFile(side, file);
		}
	}

	function handleDragOver(side: Side, event: DragEvent) {
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
		dragTarget = side;
	}

	function handleDragLeave(side: Side, event: DragEvent) {
		const currentTarget = event.currentTarget as HTMLElement;
		const relatedTarget = event.relatedTarget as Node | null;

		if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
			dragTarget = dragTarget === side ? null : dragTarget;
		}
	}

	async function loadFile(side: Side, file: File) {
		clearResult();

		if (!isSvgFile(file)) {
			setUpload(side, {
				fileName: file.name || 'Unsupported file',
				text: '',
				previewUrl: '',
				error: 'Choose a .svg file.'
			});
			return;
		}

		try {
			const text = await file.text();
			validateSvg(text);

			const previewUrl = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
			setUpload(side, { fileName: file.name || 'Untitled SVG', text, previewUrl, error: null });
		} catch (error) {
			setUpload(side, {
				fileName: file.name || 'Invalid SVG',
				text: '',
				previewUrl: '',
				error: error instanceof Error ? error.message : 'Could not read this SVG.'
			});
		}
	}

	function setUpload(side: Side, upload: UploadState) {
		if (side === 'left') {
			revokePreview(left);
			left = upload;
		} else {
			revokePreview(right);
			right = upload;
		}
	}

	function revokePreview(upload: UploadState | null) {
		if (upload?.previewUrl) URL.revokeObjectURL(upload.previewUrl);
	}

	function isSvgFile(file: File) {
		return file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
	}

	async function compare() {
		if (!left || !right || !canCompare) return;

		comparing = true;
		compareError = null;
		scores = null;

		try {
			scores = await compareSvgTexts(left.text, right.text);
		} catch (error) {
			compareError = error instanceof Error ? error.message : 'Comparison failed.';
		} finally {
			comparing = false;
		}
	}

	function reset() {
		revokePreview(left);
		revokePreview(right);
		left = null;
		right = null;
		dragTarget = null;
		clearResult();
	}

	function clearResult() {
		scores = null;
		compareError = null;
	}
</script>

<svelte:head>
	<title>SVG Comparer</title>
	<meta
		name="description"
		content="Compare two SVG files locally with geometry and visual similarity scores."
	/>
</svelte:head>

<main class="shell">
	<header class="masthead" aria-labelledby="page-title">
		<div>
			<p class="eyebrow">Local SVG comparison</p>
			<h1 id="page-title">Compare two SVGs</h1>
		</div>
		<button class="secondary" type="button" onclick={reset} disabled={!left && !right && !scores}>
			New comparison
		</button>
	</header>

	<section class="workspace" aria-label="SVG inputs">
		<div
			class={`dropzone ${dragTarget === 'left' ? 'is-dragging' : ''} ${left?.previewUrl ? 'has-preview' : ''}`}
			role="group"
			aria-labelledby="left-title"
			ondragover={(event) => handleDragOver('left', event)}
			ondragleave={(event) => handleDragLeave('left', event)}
			ondrop={(event) => handleDrop('left', event)}
		>
			<label for="left-svg">
				<input
					id="left-svg"
					name="left-svg"
					type="file"
					accept=".svg,image/svg+xml"
					onchange={(event) => handleInput('left', event)}
				/>

				<span class="pane-header">
					<span id="left-title" class="pane-title">Original</span>
					<span class="pane-action">Choose or drop</span>
				</span>

				<span class="preview-box" aria-live="polite">
					{#if left?.previewUrl}
						<img src={left.previewUrl} alt="Original SVG preview" />
					{:else}
						<span class="placeholder">Drop an SVG here</span>
					{/if}
				</span>

				<span class="file-name">{left?.fileName ?? 'No file selected'}</span>
			</label>

			{#if left?.error}
				<p class="error">{left.error}</p>
			{/if}
		</div>

		<div
			class={`dropzone ${dragTarget === 'right' ? 'is-dragging' : ''} ${right?.previewUrl ? 'has-preview' : ''}`}
			role="group"
			aria-labelledby="right-title"
			ondragover={(event) => handleDragOver('right', event)}
			ondragleave={(event) => handleDragLeave('right', event)}
			ondrop={(event) => handleDrop('right', event)}
		>
			<label for="right-svg">
				<input
					id="right-svg"
					name="right-svg"
					type="file"
					accept=".svg,image/svg+xml"
					onchange={(event) => handleInput('right', event)}
				/>

				<span class="pane-header">
					<span id="right-title" class="pane-title">Comparison</span>
					<span class="pane-action">Choose or drop</span>
				</span>

				<span class="preview-box" aria-live="polite">
					{#if right?.previewUrl}
						<img src={right.previewUrl} alt="Comparison SVG preview" />
					{:else}
						<span class="placeholder">Drop an SVG here</span>
					{/if}
				</span>

				<span class="file-name">{right?.fileName ?? 'No file selected'}</span>
			</label>

			{#if right?.error}
				<p class="error">{right.error}</p>
			{/if}
		</div>
	</section>

	<section class="command-bar" aria-label="Comparison controls">
		<button class="primary" type="button" onclick={compare} disabled={!canCompare || comparing}>
			{comparing ? 'Comparing…' : 'Compare SVGs'}
		</button>
		<p>Previews use object URLs. Raw SVG markup is never injected.</p>
	</section>

	{#if compareError}
		<p class="error result-error">{compareError}</p>
	{/if}

	{#if scores}
		<section class="scores" aria-label="Similarity scores">
			<div class="score score-primary">
				<span>Combined</span>
				<strong>{formatPercent(scores.combined)}</strong>
				<small>50% structure + 50% visual</small>
			</div>

			<div class="score">
				<span>Structure</span>
				<strong>{formatPercent(scores.geometry)}</strong>
				<small>
					{formatPercent(scores.shapeMask)} mask + {formatPercent(scores.tokens)} tokens ({scores.leftTokens}
					vs {scores.rightTokens})
				</small>
			</div>

			<div class="score">
				<span>Visual</span>
				<strong>{formatPercent(scores.visual)}</strong>
				<small>{CANVAS_SIZE}px normalized canvas diff</small>
			</div>
		</section>
	{/if}
</main>

<style>
	:global(*) {
		box-sizing: border-box;
	}

	:global(body) {
		margin: 0;
		background: #ffffff;
		color: #18181b;
		font-family:
			Inter,
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
	}

	.shell {
		isolation: isolate;
		width: min(1180px, calc(100vw - 32px));
		margin: 0 auto;
		padding: 24px 0 40px;
	}

	.masthead {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 16px;
		padding-bottom: 16px;
		border-bottom: 1px solid rgba(24, 24, 27, 0.1);
	}

	.eyebrow {
		margin: 0 0 6px;
		color: #71717a;
		font-size: 1rem;
		line-height: 1.5;
	}

	h1 {
		margin: 0;
		font-size: clamp(2rem, 5vw, 3rem);
		font-weight: 600;
		letter-spacing: -0.05em;
	}

	.workspace {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1px;
		margin-top: 16px;
		border: 1px solid rgba(24, 24, 27, 0.1);
		background: rgba(24, 24, 27, 0.1);
	}

	.dropzone {
		position: relative;
		min-width: 0;
		background: #fff;
		transition:
			background 120ms ease,
			outline-color 120ms ease;
	}

	.dropzone:hover,
	.dropzone.is-dragging {
		background: #fafafa;
	}

	.dropzone.is-dragging {
		outline: 2px solid #18181b;
		outline-offset: -2px;
	}

	input[type='file'] {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		clip-path: inset(50%);
		white-space: nowrap;
	}

	label {
		display: grid;
		grid-template-rows: auto 1fr auto;
		gap: 12px;
		min-height: 460px;
		padding: 16px;
		cursor: pointer;
	}

	label:focus-within {
		outline: 2px solid #18181b;
		outline-offset: -2px;
	}

	.pane-header,
	.command-bar,
	.scores {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.pane-title,
	.score span {
		color: #18181b;
		font-size: 1rem;
		font-weight: 600;
		line-height: 1.4;
	}

	.pane-action,
	.file-name,
	small,
	.command-bar p {
		color: #71717a;
		font-size: 1rem;
		line-height: 1.45;
	}

	.preview-box {
		display: grid;
		min-height: 340px;
		place-items: center;
		border: 1px dashed rgba(24, 24, 27, 0.2);
		background: #fafafa;
	}

	.has-preview .preview-box {
		border-style: solid;
		background:
			linear-gradient(45deg, #f4f4f5 25%, transparent 25%),
			linear-gradient(-45deg, #f4f4f5 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, #f4f4f5 75%),
			linear-gradient(-45deg, transparent 75%, #f4f4f5 75%), #fff;
		background-position:
			0 0,
			0 8px,
			8px -8px,
			-8px 0;
		background-size: 16px 16px;
	}

	img {
		display: block;
		width: 100%;
		height: 340px;
		padding: 20px;
		object-fit: contain;
	}

	.placeholder {
		color: #52525b;
		font-size: 1rem;
		line-height: 1.5;
	}

	.file-name {
		overflow-wrap: anywhere;
	}

	.command-bar {
		margin-top: 16px;
		padding: 16px 0;
		border-bottom: 1px solid rgba(24, 24, 27, 0.1);
	}

	.command-bar p {
		max-width: 48ch;
		margin: 0;
		text-align: right;
	}

	button {
		border: 0;
		border-radius: 4px;
		font: inherit;
		font-size: 1rem;
		font-weight: 600;
		line-height: 1.2;
		cursor: pointer;
		transition:
			background 120ms ease,
			border-color 120ms ease,
			opacity 120ms ease;
	}

	button:focus-visible {
		outline: 2px solid #18181b;
		outline-offset: 2px;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}

	.primary {
		min-width: 144px;
		padding: 11px 14px;
		background: #18181b;
		color: #fff;
	}

	.primary:not(:disabled):hover {
		background: #3f3f46;
	}

	.secondary {
		flex: 0 0 auto;
		padding: 9px 12px;
		border: 1px solid rgba(24, 24, 27, 0.16);
		background: #fff;
		color: #18181b;
	}

	.secondary:not(:disabled):hover {
		background: #fafafa;
		border-color: rgba(24, 24, 27, 0.28);
	}

	.error {
		margin: 0;
		padding: 0 16px 16px;
		color: #b42318;
		font-size: 1rem;
		line-height: 1.45;
	}

	.result-error {
		padding: 16px 0 0;
	}

	.scores {
		align-items: stretch;
		margin-top: 16px;
		border: 1px solid rgba(24, 24, 27, 0.1);
	}

	.score {
		display: grid;
		flex: 1 1 0;
		gap: 6px;
		min-width: 0;
		padding: 14px 16px;
	}

	.score + .score {
		border-left: 1px solid rgba(24, 24, 27, 0.1);
	}

	.score strong {
		font-size: clamp(2rem, 6vw, 3.25rem);
		font-weight: 600;
		line-height: 1;
		letter-spacing: -0.06em;
	}

	.score-primary strong {
		font-size: clamp(3rem, 8vw, 5rem);
	}

	@media (min-width: 640px) {
		.eyebrow,
		.pane-title,
		.pane-action,
		.file-name,
		.placeholder,
		.command-bar p,
		.error,
		small,
		button,
		.score span {
			font-size: 0.875rem;
		}
	}

	@media (max-width: 760px) {
		.shell {
			width: min(100vw - 24px, 1180px);
			padding: 16px 0 28px;
		}

		.masthead,
		.command-bar {
			align-items: stretch;
			flex-direction: column;
		}

		.command-bar p {
			max-width: none;
			text-align: left;
		}

		.workspace {
			grid-template-columns: 1fr;
		}

		label {
			min-height: 360px;
		}

		.preview-box,
		img {
			height: 260px;
			min-height: 260px;
		}

		.secondary,
		.primary {
			width: 100%;
		}

		.scores {
			display: grid;
		}

		.score + .score {
			border-top: 1px solid rgba(24, 24, 27, 0.1);
			border-left: 0;
		}
	}
</style>
