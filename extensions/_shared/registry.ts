import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

export interface PiExtensionRegistration {
	id: string;
	name: string;
	description: string;
	commands?: string[];
	tags?: string[];
	run?: (ctx: ExtensionCommandContext) => Promise<void> | void;
}

interface RegistryState {
	extensions: Map<string, PiExtensionRegistration>;
}

const REGISTRY_KEY = Symbol.for("wesen.pi.extensions.registry.v1");

function registryState(): RegistryState {
	const globalWithRegistry = globalThis as typeof globalThis & { [REGISTRY_KEY]?: RegistryState };
	if (!globalWithRegistry[REGISTRY_KEY]) {
		globalWithRegistry[REGISTRY_KEY] = { extensions: new Map() };
	}
	return globalWithRegistry[REGISTRY_KEY];
}

export function registerPiExtension(registration: PiExtensionRegistration): void {
	registryState().extensions.set(registration.id, registration);
}

export function unregisterPiExtension(id: string): void {
	registryState().extensions.delete(id);
}

export function listPiExtensions(): PiExtensionRegistration[] {
	return [...registryState().extensions.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function clearPiExtensionRegistry(): void {
	registryState().extensions.clear();
}
