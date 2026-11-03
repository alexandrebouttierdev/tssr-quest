import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from './bus';

describe("bus d'événements", () => {
  it("transmet l'événement émis aux abonnés de son type", () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.on('world/interact', handler);

    bus.emit({ type: 'world/interact', targetId: 'hugo' });

    expect(handler).toHaveBeenCalledWith({ type: 'world/interact', targetId: 'hugo' });
  });

  it("n'appelle pas les abonnés d'un autre type", () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.on('mission/abandon', handler);

    bus.emit({ type: 'world/interact', targetId: 'hugo' });

    expect(handler).not.toHaveBeenCalled();
  });

  it("appelle les abonnés dans l'ordre d'abonnement", () => {
    const bus = createEventBus();
    const calls: string[] = [];
    bus.on('mission/abandon', () => calls.push('a'));
    bus.on('mission/abandon', () => calls.push('b'));

    bus.emit({ type: 'mission/abandon' });

    expect(calls).toEqual(['a', 'b']);
  });

  it('désabonne avec la fonction renvoyée par on', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    const unsubscribe = bus.on('mission/abandon', handler);

    unsubscribe();
    bus.emit({ type: 'mission/abandon' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('désabonne avec off', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.on('mission/abandon', handler);

    bus.off('mission/abandon', handler);
    bus.emit({ type: 'mission/abandon' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('ne fait rien quand on retire un abonné inconnu', () => {
    const bus = createEventBus();

    expect(() => bus.off('mission/abandon', () => undefined)).not.toThrow();
  });

  it("n'appelle un abonné once qu'une seule fois", () => {
    const bus = createEventBus();
    const handler = vi.fn();
    bus.once('progression/level-up', handler);

    bus.emit({ type: 'progression/level-up', level: 2 });
    bus.emit({ type: 'progression/level-up', level: 3 });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ type: 'progression/level-up', level: 2 });
  });

  it("permet d'annuler un abonnement once avant son déclenchement", () => {
    const bus = createEventBus();
    const handler = vi.fn();
    const cancel = bus.once('mission/abandon', handler);

    cancel();
    bus.emit({ type: 'mission/abandon' });

    expect(handler).not.toHaveBeenCalled();
  });

  it("n'appelle pas pendant l'émission un abonné ajouté par un autre abonné", () => {
    const bus = createEventBus();
    const late = vi.fn();
    bus.on('mission/abandon', () => {
      bus.on('mission/abandon', late);
    });

    bus.emit({ type: 'mission/abandon' });

    expect(late).not.toHaveBeenCalled();
  });

  it('transmet tous les événements aux abonnés onAny', () => {
    const bus = createEventBus();
    const seen: string[] = [];
    const stop = bus.onAny((event) => seen.push(event.type));

    bus.emit({ type: 'mission/abandon' });
    bus.emit({ type: 'world/zone-entered', zoneId: 'dsi' });
    stop();
    bus.emit({ type: 'mission/abandon' });

    expect(seen).toEqual(['mission/abandon', 'world/zone-entered']);
  });

  it("continue d'appeler les autres abonnés quand l'un d'eux lève une erreur", () => {
    const onError = vi.fn();
    const bus = createEventBus({ onError });
    const second = vi.fn();
    bus.on('mission/abandon', () => {
      throw new Error('boum');
    });
    bus.on('mission/abandon', second);

    bus.emit({ type: 'mission/abandon' });

    expect(second).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.any(Error), { type: 'mission/abandon' });
  });

  it("relance l'erreur d'un abonné quand aucun gestionnaire d'erreur n'est fourni", () => {
    const bus = createEventBus();
    bus.on('mission/abandon', () => {
      throw new Error('boum');
    });

    expect(() => bus.emit({ type: 'mission/abandon' })).toThrow('boum');
  });

  it('vide tous les abonnements avec clear', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    const any = vi.fn();
    bus.on('mission/abandon', handler);
    bus.onAny(any);

    bus.clear();
    bus.emit({ type: 'mission/abandon' });

    expect(handler).not.toHaveBeenCalled();
    expect(any).not.toHaveBeenCalled();
  });
});
