import { describe, expect, it } from 'vitest';
import { SERVICE_CATALOG } from './service-catalog';

describe('catalogue des services', () => {
  it.each(Object.values(SERVICE_CATALOG))(
    'décrit $name avec une unité, un paquet et des messages de panne',
    (def) => {
      expect(def.unitPath).toBe(`/lib/systemd/system/${def.name}.service`);
      expect(def.package.version).not.toBe('');
      expect(def.processes.length).toBeGreaterThan(0);
      expect(def.noSpaceMessages.length).toBeGreaterThan(0);
      const portMessages = def.portInUseMessages(def.ports[0] ?? 0);
      if (def.ports.length > 0) {
        expect(portMessages.join('\n')).toMatch(/Address already in use|98/);
      } else {
        expect(portMessages).toEqual([]);
      }
    },
  );
});
