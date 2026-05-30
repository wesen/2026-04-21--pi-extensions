import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { CacheTraceRecord } from "./state";

const SPARK = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

export interface SeriesSpec {
	label: string;
	values: number[];
	marker: string;
}

export function sparkline(values: number[], width: number): string {
	if (width <= 0) return "";
	const sampled = sample(values, width);
	if (sampled.length === 0) return "";
	const min = Math.min(...sampled);
	const max = Math.max(...sampled);
	if (max === min) return SPARK[0].repeat(sampled.length);
	return sampled.map((value) => SPARK[Math.max(0, Math.min(SPARK.length - 1, Math.round(((value - min) / (max - min)) * (SPARK.length - 1))))]).join("");
}

export function plotSeries(series: SeriesSpec[], options: { width: number; height: number; yLabelWidth?: number }): string[] {
	const width = Math.max(10, options.width);
	const height = Math.max(3, options.height);
	const yLabelWidth = options.yLabelWidth ?? 7;
	const plotWidth = Math.max(5, width - yLabelWidth - 2);
	const allValues = series.flatMap((s) => s.values.filter((v) => Number.isFinite(v)));
	if (allValues.length === 0) return ["No numeric values to plot."];
	const min = Math.min(0, ...allValues);
	const max = Math.max(...allValues, 1);
	const grid = Array.from({ length: height }, () => Array.from({ length: plotWidth }, () => " "));
	for (const spec of series) {
		const sampled = sample(spec.values, plotWidth);
		for (let x = 0; x < sampled.length; x++) {
			const value = sampled[x];
			const ratio = max === min ? 0 : (value - min) / (max - min);
			const y = height - 1 - Math.max(0, Math.min(height - 1, Math.round(ratio * (height - 1))));
			grid[y][x] = spec.marker;
		}
	}
	const lines: string[] = [];
	for (let row = 0; row < height; row++) {
		const ratio = height === 1 ? 1 : 1 - row / (height - 1);
		const label = formatAxis(min + ratio * (max - min), yLabelWidth);
		lines.push(`${label} │${grid[row].join("")}`);
	}
	lines.push(`${" ".repeat(yLabelWidth)} └${"─".repeat(plotWidth)}`);
	return lines.map((line) => truncateToWidth(line, width, ""));
}

export function cacheTracePlot(records: CacheTraceRecord[], width: number, height: number): string[] {
	const plotWidth = Math.max(20, width);
	const recent = records.slice(-Math.max(1, plotWidth - 10));
	return plotSeries(
		[
			{ label: "cacheRead", values: recent.map((r) => r.usage.cacheRead), marker: "●" },
			{ label: "cacheWrite", values: recent.map((r) => r.usage.cacheWrite), marker: "◆" },
			{ label: "input", values: recent.map((r) => r.usage.input), marker: "·" },
		],
		{ width, height },
	);
}

export function legend(width: number): string {
	return fit(`● cacheRead   ◆ cacheWrite   · input tokens`, width);
}

export function fit(value: string, width: number): string {
	if (visibleWidth(value) >= width) return truncateToWidth(value, width, "…");
	return value + " ".repeat(width - visibleWidth(value));
}

function sample(values: number[], maxPoints: number): number[] {
	const clean = values.filter((v) => Number.isFinite(v));
	if (clean.length <= maxPoints) return clean;
	const result: number[] = [];
	for (let i = 0; i < maxPoints; i++) {
		const start = Math.floor((i / maxPoints) * clean.length);
		const end = Math.max(start + 1, Math.floor(((i + 1) / maxPoints) * clean.length));
		const bucket = clean.slice(start, end);
		result.push(bucket.reduce((sum, value) => sum + value, 0) / bucket.length);
	}
	return result;
}

function formatAxis(value: number, width: number): string {
	let text: string;
	if (Math.abs(value) >= 1_000_000) text = `${(value / 1_000_000).toFixed(1)}m`;
	else if (Math.abs(value) >= 1_000) text = `${(value / 1_000).toFixed(0)}k`;
	else text = value.toFixed(0);
	if (text.length > width) text = text.slice(0, width);
	return text.padStart(width, " ");
}
