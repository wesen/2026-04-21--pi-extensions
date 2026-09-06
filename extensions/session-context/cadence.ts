/** Independent per-channel cadence, counted in submitted prompts, not tool turns. */
export class MetadataCadence {
	private key: string | undefined;
	private skipped = 0;

	reset(): void {
		this.key = undefined;
		this.skipped = 0;
	}

	next(key: string, interval: number): { emit: boolean; identityChanged: boolean } {
		const identityChanged = this.key !== key;
		if (identityChanged || ++this.skipped >= interval) {
			this.key = key;
			this.skipped = 0;
			return { emit: true, identityChanged };
		}
		return { emit: false, identityChanged: false };
	}
}
