import { INPUT_MARKER, SYSTEM_MARKER } from "./format";

export function isAlreadyAnnotated(text: string): boolean {
	return text.includes(INPUT_MARKER);
}

export function isSlashCommandOrTemplate(text: string): boolean {
	return /^\s*\/(?:skill:|template:|prompt:|new\b|resume\b|compact\b|tree\b|model\b|session-context\b)/i.test(text);
}

export function appendInputMetadata(text: string, block: string): string {
	return `${text.trimEnd()}\n\n${block}`;
}

export function appendSystemMetadata(systemPrompt: string, block: string): string {
	if (systemPrompt.includes(SYSTEM_MARKER)) return systemPrompt;
	return `${systemPrompt.trimEnd()}\n\n${block}`;
}
