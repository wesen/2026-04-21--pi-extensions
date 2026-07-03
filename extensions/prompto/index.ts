import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { registerPiExtension } from "../_shared/registry";
import { describePlugin } from "./plugin";
import { runPrompto } from "./run";
import { PromptStore } from "./store";

const EXTENSION_DIR = dirname(fileURLToPath(import.meta.url));

function loadDoc(relativePath: string): string {
	try {
		return readFileSync(join(EXTENSION_DIR, relativePath), "utf-8");
	} catch (error) {
		return `Could not load ${relativePath}: ${error instanceof Error ? error.message : String(error)}`;
	}
}

export default function prompto(pi: ExtensionAPI): void {
	const store = new PromptStore(describePlugin);

	registerPiExtension({
		id: "prompto",
		name: "Prompto",
		description: "Prompt template expansion with modal forms (templates in .pi/prompts and ~/.pi/agent/prompts)",
		commands: ["prompto"],
		tags: ["prompts", "templates", "forms"],
		run: (ctx) => runPrompto(pi, store, "", ctx),
		docs: [
			{ id: "authoring", title: "Authoring prompto templates", load: () => loadDoc("docs/authoring.md") },
			{ id: "plugin-protocol", title: "JSONL plugin protocol", load: () => loadDoc("docs/plugin-protocol.md") },
		],
	});

	pi.registerCommand("prompto", {
		description: "Expand a prompt template through a form (/prompto [name] | reload)",
		getArgumentCompletions: (prefix: string) => {
			const trimmed = prefix.trim();
			const items = store
				.list()
				.filter((t) => t.name.startsWith(trimmed))
				.slice(0, 20)
				.map((t) => ({ value: t.name, label: t.name, description: t.title ?? t.description ?? "" }));
			if ("reload".startsWith(trimmed)) items.push({ value: "reload", label: "reload", description: "Rescan template directories" });
			return items.length > 0 ? items : null;
		},
		handler: async (args: string, ctx) => {
			await runPrompto(pi, store, args.trim(), ctx);
		},
	});
}
