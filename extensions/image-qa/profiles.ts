import { execFileSync } from "child_process";

export interface PinocchioProfile {
	profile: string;
	display_name: string;
	effective_chat_engine: string;
	effective_chat_api_type: string;
	description: string;
	selected: boolean;
	default: boolean;
}

/** Machine value, display label, dim description. */
export interface CuratedProfile {
	value: string;
	label: string;
	desc: string;
}

let cachedProfiles: PinocchioProfile[] | undefined;

/**
 * Curated vision-capable profiles in the user's preferred order.
 * These appear first in the settings dropdown.
 */
export const CURATED_PROFILES: readonly CuratedProfile[] = [
	{ value: "gpt-5-nano-low", label: "GPT-5 Nano Low",   desc: "GPT-5 Nano, low reasoning effort (fastest, cheapest)" },
	{ value: "gpt-5-low",      label: "GPT-5 Low",        desc: "GPT-5, low reasoning effort" },
	{ value: "gpt-5-mini-low", label: "GPT-5 Mini Low",   desc: "GPT-5 Mini, low reasoning effort" },
	{ value: "gpt-5-mini",     label: "GPT-5 Mini",       desc: "GPT-5 Mini" },
	{ value: "gpt-5-nano",     label: "GPT-5 Nano",       desc: "GPT-5 Nano" },
	{ value: "haiku",          label: "Claude Haiku 4.5", desc: "Anthropic Claude Haiku 4.5" },
	{ value: "sonnet",         label: "Claude Sonnet",    desc: "Anthropic Claude Sonnet 4.6" },
	{ value: "sonnet-low",     label: "Claude Sonnet Low",desc: "Anthropic Claude Sonnet 4.6, low reasoning" },
] as const;

export function discoverPinocchioProfiles(): PinocchioProfile[] {
	if (cachedProfiles) return cachedProfiles;
	try {
		const raw = execFileSync("pinocchio", ["profiles", "list", "--output", "json"], {
			encoding: "utf-8",
			timeout: 10_000,
		});
		// pinocchio outputs concatenated JSON objects; wrap in array
		const cleaned = "[" + raw.replace(/\}\s*,\s*\{/g, "},{").replace(/\}\s*\{/g, "},{") + "]";
		cachedProfiles = JSON.parse(cleaned);
		return cachedProfiles ?? [];
	} catch {
		return [];
	}
}

export function getSelectedProfile(): string | undefined {
	const all = discoverPinocchioProfiles();
	return all.find((p) => p.selected)?.profile ?? all.find((p) => p.default)?.profile;
}

export function invalidateProfileCache(): void {
	cachedProfiles = undefined;
}
