import type Phaser from 'phaser';
import type { EventBus } from '@core/events/bus';
import type { GameStoreApi } from '@core/store/create-store';
import type { ContentIndex } from '@content/loader';

/** Services partagés entre React, le moteur et Phaser (store, bus, contenu). */
export interface WorldServices {
  readonly store: GameStoreApi;
  readonly bus: EventBus;
  readonly content: ContentIndex;
}

/** Clé du registre Phaser où sont rangés les services. */
const REGISTRY_KEY = 'tssr-services';

/**
 * Range les services dans le registre du jeu Phaser (appelé par `GameCanvas`).
 *
 * @param game - Instance Phaser.
 * @param services - Store, bus et contenu.
 */
export function provideServices(game: Phaser.Game, services: WorldServices): void {
  game.registry.set(REGISTRY_KEY, services);
}

/**
 * Récupère les services depuis une scène.
 *
 * @param scene - Scène Phaser.
 * @returns Les services.
 * @throws {Error} Si `provideServices` n'a pas été appelé.
 */
export function servicesOf(scene: Phaser.Scene): WorldServices {
  const services = scene.registry.get(REGISTRY_KEY) as WorldServices | undefined;
  if (!services) throw new Error('Services du monde absents du registre Phaser');
  return services;
}
