export type Scores = {
	combined: number;
	geometry: number;
	visual: number;
	shapeMask: number;
	tokens: number;
	leftTokens: number;
	rightTokens: number;
};

export const CANVAS_SIZE = 160;

const SVG_ELEMENTS = new Set([
	'svg',
	'g',
	'path',
	'rect',
	'circle',
	'ellipse',
	'line',
	'polyline',
	'polygon'
]);
const GEOMETRY_ATTRS = new Set([
	'd',
	'x',
	'y',
	'x1',
	'y1',
	'x2',
	'y2',
	'cx',
	'cy',
	'r',
	'rx',
	'ry',
	'width',
	'height',
	'points'
]);
const STYLE_ATTRS = new Set([
	'fill',
	'stroke',
	'opacity',
	'fill-opacity',
	'stroke-opacity',
	'stroke-width',
	'fill-rule'
]);
const NON_RENDERED_SUBTREES = new Set([
	'defs',
	'clippath',
	'mask',
	'pattern',
	'lineargradient',
	'radialgradient',
	'filter',
	'marker',
	'symbol',
	'metadata',
	'title',
	'desc'
]);
const NUMERIC_ATTRS = new Set([
	'x',
	'y',
	'x1',
	'y1',
	'x2',
	'y2',
	'cx',
	'cy',
	'r',
	'rx',
	'ry',
	'width',
	'height',
	'stroke-width'
]);

export async function compareSvgTexts(leftText: string, rightText: string): Promise<Scores> {
	validateSvg(leftText);
	validateSvg(rightText);

	const leftTokens = extractTokens(leftText);
	const rightTokens = extractTokens(rightText);
	const [leftPixels, rightPixels] = await Promise.all([
		rasterizeSvg(leftText),
		rasterizeSvg(rightText)
	]);
	const tokens = tokenSimilarity(leftTokens, rightTokens);
	const shapeMask = shapeMaskSimilarity(leftPixels, rightPixels);
	const geometry = 0.7 * shapeMask + 0.3 * tokens;
	const visual = pixelSimilarity(leftPixels, rightPixels);

	return {
		combined: (geometry + visual) / 2,
		geometry,
		visual,
		shapeMask,
		tokens,
		leftTokens: leftTokens.length,
		rightTokens: rightTokens.length
	};
}

export function validateSvg(text: string) {
	const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
	const parseError = doc.querySelector('parsererror');

	if (parseError || doc.documentElement.nodeName.toLowerCase() !== 'svg') {
		throw new Error('This file is not valid SVG markup.');
	}

	if (hasRemoteReference(text)) {
		throw new Error('External SVG references are not supported for local-only comparison.');
	}
}

export function hasRemoteReference(text: string) {
	return (
		/(?:href|src|xlink:href)\s*=\s*["']\s*(?:https?:|\/\/|file:|javascript:)/i.test(text) ||
		/url\(\s*["']?\s*(?:https?:|\/\/|file:|javascript:)/i.test(text)
	);
}

export function extractTokens(text: string) {
	const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
	const svg = doc.documentElement;
	const scale = getSvgScale(svg);
	const tokens: string[] = [];

	walk(svg, (element) => {
		const tag = element.tagName.toLowerCase();

		if (!SVG_ELEMENTS.has(tag)) return;

		tokens.push(`tag:${tag}`);

		for (const [name, value] of effectiveAttributes(element)) {
			const attr = name.toLowerCase();

			if (GEOMETRY_ATTRS.has(attr) || STYLE_ATTRS.has(attr) || attr === 'viewbox') {
				tokens.push(`${tag}:${attr}:${normalizeAttribute(attr, value, scale)}`);
			}
		}
	});

	return tokens.sort();
}

function walk(element: Element, visit: (element: Element) => void) {
	if (NON_RENDERED_SUBTREES.has(element.tagName.toLowerCase())) return;

	visit(element);

	for (const child of Array.from(element.children)) {
		walk(child, visit);
	}
}

function effectiveAttributes(element: Element) {
	const attributes: Record<string, string> = {};

	for (const { name, value } of Array.from(element.attributes)) {
		attributes[name.toLowerCase()] = value;
	}

	for (const declaration of (attributes.style ?? '').split(';')) {
		const separator = declaration.indexOf(':');
		if (separator === -1) continue;

		const property = declaration.slice(0, separator).trim().toLowerCase();
		const value = declaration.slice(separator + 1).trim();
		if (STYLE_ATTRS.has(property) && value) attributes[property] = value;
	}

	delete attributes.style;
	delete attributes.transform;

	return Object.entries(attributes);
}

function getSvgScale(svg: Element) {
	const viewBox = svg.getAttribute('viewBox');
	const numbers = viewBox?.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];

	if (numbers.length === 4 && numbers[2] > 0 && numbers[3] > 0) {
		return Math.max(numbers[2], numbers[3]);
	}

	const width = parseNumeric(svg.getAttribute('width'));
	const height = parseNumeric(svg.getAttribute('height'));

	return Math.max(width || 1, height || 1, 1);
}

export function normalizeAttribute(attr: string, value: string, scale: number) {
	const trimmed = value.trim().toLowerCase();

	if (attr === 'd' || attr === 'points' || attr === 'viewbox') {
		return normalizeNumbers(trimmed, scale);
	}

	if (NUMERIC_ATTRS.has(attr)) {
		const numeric = parseNumeric(trimmed);
		return numeric === null ? trimmed : roundToken(numeric / scale);
	}

	if (attr.includes('opacity')) {
		const numeric = parseNumeric(trimmed);
		return numeric === null ? trimmed : roundToken(numeric);
	}

	return trimmed.replace(/\s+/g, ' ');
}

function normalizeNumbers(value: string, scale: number) {
	return value
		.replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, (match) => roundToken(Number(match) / scale))
		.replace(/[\s,]+/g, ' ')
		.trim();
}

function parseNumeric(value: string | null) {
	if (!value) return null;
	const match = value.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/i);
	return match ? Number(match[0]) : null;
}

function roundToken(value: number) {
	return Number.isFinite(value) ? value.toFixed(3).replace(/\.?0+$/, '') : '0';
}

export function tokenSimilarity(leftTokens: string[], rightTokens: string[]) {
	if (!leftTokens.length && !rightTokens.length) return 1;

	const counts: Record<string, number> = {};
	let matches = 0;

	for (const token of leftTokens) {
		counts[token] = (counts[token] ?? 0) + 1;
	}

	for (const token of rightTokens) {
		const count = counts[token] ?? 0;

		if (count > 0) {
			matches += 1;
			counts[token] = count - 1;
		}
	}

	return (2 * matches) / (leftTokens.length + rightTokens.length);
}

export async function rasterizeSvg(text: string) {
	const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));

	try {
		const image = new Image();
		image.decoding = 'async';
		image.src = url;
		await image.decode();

		const canvas = document.createElement('canvas');
		canvas.width = CANVAS_SIZE;
		canvas.height = CANVAS_SIZE;

		const context = canvas.getContext('2d', { willReadFrequently: true });
		if (!context) throw new Error('Could not create a canvas for visual comparison.');

		const width = image.naturalWidth || CANVAS_SIZE;
		const height = image.naturalHeight || CANVAS_SIZE;
		const scale = Math.min(CANVAS_SIZE / width, CANVAS_SIZE / height);
		const drawWidth = width * scale;
		const drawHeight = height * scale;

		context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
		context.drawImage(
			image,
			(CANVAS_SIZE - drawWidth) / 2,
			(CANVAS_SIZE - drawHeight) / 2,
			drawWidth,
			drawHeight
		);

		return context.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE).data;
	} catch {
		throw new Error('Could not render one of the SVGs for visual comparison.');
	} finally {
		URL.revokeObjectURL(url);
	}
}

export function pixelSimilarity(leftPixels: Uint8ClampedArray, rightPixels: Uint8ClampedArray) {
	let totalDifference = 0;

	for (let i = 0; i < leftPixels.length; i += 1) {
		totalDifference += Math.abs(leftPixels[i] - rightPixels[i]);
	}

	return 1 - totalDifference / (leftPixels.length * 255);
}

export function shapeMaskSimilarity(leftPixels: Uint8ClampedArray, rightPixels: Uint8ClampedArray) {
	let overlap = 0;
	let total = 0;

	for (let i = 3; i < leftPixels.length; i += 4) {
		const leftAlpha = leftPixels[i] / 255;
		const rightAlpha = rightPixels[i] / 255;

		overlap += Math.min(leftAlpha, rightAlpha);
		total += leftAlpha + rightAlpha;
	}

	return total === 0 ? 1 : (2 * overlap) / total;
}

export function formatPercent(value: number) {
	return `${Math.round(value * 100)}%`;
}
