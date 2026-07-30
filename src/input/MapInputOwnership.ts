export type MapInputOwnerId = 'tactical-orders' | 'combat-lab-authoring' | (string & {});

export interface MapInputLease {
  readonly ownerId: MapInputOwnerId;
  release(): void;
}

/**
 * Coordinates exclusive gesture ownership for the shared tactical map canvas.
 * A lease is idempotent and may only release the owner that acquired it.
 */
export class MapInputOwnership {
  private ownerId: MapInputOwnerId | null = null;
  private revision = 0;

  get currentOwnerId(): MapInputOwnerId | null {
    return this.ownerId;
  }

  isOwnedBy(ownerId: MapInputOwnerId): boolean {
    return this.ownerId === ownerId;
  }

  isAvailableTo(ownerId: MapInputOwnerId): boolean {
    return this.ownerId === null || this.ownerId === ownerId;
  }

  acquire(ownerId: MapInputOwnerId): MapInputLease | null {
    if (!this.isAvailableTo(ownerId)) return null;
    this.ownerId = ownerId;
    const leaseRevision = ++this.revision;
    let released = false;
    return Object.freeze({
      ownerId,
      release: () => {
        if (released) return;
        released = true;
        if (this.ownerId === ownerId && this.revision === leaseRevision) this.ownerId = null;
      },
    });
  }

  release(ownerId: MapInputOwnerId): void {
    if (this.ownerId !== ownerId) return;
    this.ownerId = null;
    this.revision += 1;
  }
}
