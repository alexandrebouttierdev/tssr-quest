import type { SliceCreator } from './types';

/** Tranche `inventory` : objets possédés (une collection, pas de quantité ni de poids). */
export interface InventoryState {
  readonly items: readonly string[];
}

/** Actions de la tranche `inventory`. */
export interface InventoryActions {
  addItem(itemId: string): void;
  removeItem(itemId: string): void;
}

/**
 * Inventaire vide.
 *
 * @returns Un nouvel état de la tranche `inventory`.
 */
export function initialInventoryState(): InventoryState {
  return { items: [] };
}

/** Fabrique de la tranche `inventory`. */
export const createInventorySlice: SliceCreator<
  { inventory: InventoryState } & InventoryActions
> = (set) => ({
  inventory: initialInventoryState(),
  addItem: (itemId) =>
    set((s) => {
      if (!s.inventory.items.includes(itemId)) s.inventory.items.push(itemId);
    }),
  removeItem: (itemId) =>
    set((s) => {
      s.inventory.items = s.inventory.items.filter((id) => id !== itemId);
    }),
});
