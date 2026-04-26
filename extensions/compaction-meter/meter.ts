import type { ContextUsage } from "@mariozechner/pi-coding-agent";
import type { CompactionMeterSettings } from "./settings";

export interface CompactionMeterSnapshot {
	enabled: boolean;
	tokens: number | null;
	contextWindow: number | null;
	reserveTokens: number;
	threshold: number | null;
	remainingTokens: number | null;
	percentToThreshold: number | null;
	usagePercentOfWindow: number | null;
	warnings: string[];
}

export function createSnapshot(
	usage: ContextUsage | undefined,
	settings: CompactionMeterSettings,
	warnings: string[] = [],
): CompactionMeterSnapshot {
	const contextWindow = usage?.contextWindow ?? null;
	const tokens = usage?.tokens ?? null;
	const threshold = contextWindow === null ? null : Math.max(0, contextWindow - settings.reserveTokens);
	const remainingTokens = tokens === null || threshold === null ? null : threshold - tokens;
	const percentToThreshold = tokens === null || threshold === null || threshold === 0 ? null : tokens / threshold;

	return {
		enabled: settings.enabled,
		tokens,
		contextWindow,
		reserveTokens: settings.reserveTokens,
		threshold,
		remainingTokens,
		percentToThreshold,
		usagePercentOfWindow: usage?.percent ?? null,
		warnings,
	};
}

export function formatTokenCount(value: number): string {
	const abs = Math.abs(value);
	if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}m`;
	if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}k`;
	return String(value);
}

export function formatStatus(snapshot: CompactionMeterSnapshot): string {
	if (!snapshot.enabled) return "compact:off";
	if (snapshot.remainingTokens === null) return "compact:? left";
	if (snapshot.remainingTokens < 0) return `compact:due ${formatTokenCount(-snapshot.remainingTokens)} over`;
	return `compact:${formatTokenCount(snapshot.remainingTokens)} left`;
}

function formatNumber(value: number | null): string {
	return value === null ? "unknown" : value.toLocaleString();
}

function formatPercent(value: number | null): string {
	return value === null ? "unknown" : `${(value * 100).toFixed(1)}%`;
}

export function formatDetails(snapshot: CompactionMeterSnapshot): string {
	const lines = [
		`Status: ${formatStatus(snapshot)}`,
		`Compaction enabled: ${snapshot.enabled ? "yes" : "no"}`,
		`Current context tokens: ${formatNumber(snapshot.tokens)}`,
		`Context window: ${formatNumber(snapshot.contextWindow)}`,
		`Reserve tokens: ${formatNumber(snapshot.reserveTokens)}`,
		`Compaction threshold: ${formatNumber(snapshot.threshold)}`,
		`Tokens until compaction: ${formatNumber(snapshot.remainingTokens)}`,
		`Usage of compaction threshold: ${formatPercent(snapshot.percentToThreshold)}`,
		`Usage of context window: ${formatPercent(snapshot.usagePercentOfWindow)}`,
	];

	if (snapshot.warnings.length > 0) {
		lines.push("", "Warnings:", ...snapshot.warnings.map((warning) => `- ${warning}`));
	}

	return lines.join("\n");
}
