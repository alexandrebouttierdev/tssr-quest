import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import { canAccess, canDeleteEntry, userGroups } from './permissions';
import type { FsNode } from './types';

/** Construit un nœud fichier pour les tests de droits. */
function file(owner: string, group: string, mode: number): FsNode {
  return { type: 'file', owner, group, mode, mtime: 0, content: '' };
}

describe('droits sur les fichiers', () => {
  const machine = debianServer({ users: ['hugo', 'julie'], groups: { web: ['julie'] } });

  it('applique les droits du propriétaire au propriétaire', () => {
    const node = file('hugo', 'hugo', 0o600);

    expect(canAccess(machine, 'hugo', node, 'read')).toBe(true);
    expect(canAccess(machine, 'hugo', node, 'write')).toBe(true);
    expect(canAccess(machine, 'hugo', node, 'exec')).toBe(false);
  });

  it("n'applique que les droits du propriétaire même si le groupe a plus de droits", () => {
    const node = file('hugo', 'hugo', 0o070);

    expect(canAccess(machine, 'hugo', node, 'read')).toBe(false);
  });

  it('applique les droits du groupe à un membre secondaire', () => {
    const node = file('hugo', 'web', 0o640);

    expect(canAccess(machine, 'julie', node, 'read')).toBe(true);
    expect(canAccess(machine, 'julie', node, 'write')).toBe(false);
  });

  it('applique les droits du groupe au groupe principal', () => {
    const node = file('root', 'hugo', 0o040);

    expect(canAccess(machine, 'hugo', node, 'read')).toBe(true);
  });

  it('applique les droits des autres à un compte sans lien', () => {
    const node = file('hugo', 'web', 0o604);

    expect(canAccess(machine, 'www-data', node, 'read')).toBe(true);
    expect(canAccess(machine, 'www-data', node, 'write')).toBe(false);
  });

  it('laisse root lire et écrire sans tenir compte des droits', () => {
    const node = file('hugo', 'hugo', 0o000);

    expect(canAccess(machine, 'root', node, 'read')).toBe(true);
    expect(canAccess(machine, 'root', node, 'write')).toBe(true);
  });

  it("n'autorise root à exécuter un fichier que si un bit x est posé", () => {
    expect(canAccess(machine, 'root', file('hugo', 'hugo', 0o644), 'exec')).toBe(false);
    expect(canAccess(machine, 'root', file('hugo', 'hugo', 0o744), 'exec')).toBe(true);
  });

  it('laisse root traverser un répertoire sans bit x', () => {
    const dir: FsNode = { type: 'dir', owner: 'hugo', group: 'hugo', mode: 0o700, mtime: 0 };

    expect(canAccess(machine, 'root', dir, 'exec')).toBe(true);
  });

  it("liste les groupes effectifs d'un compte", () => {
    expect(userGroups(machine, 'julie')).toEqual(['julie', 'web']);
    expect(userGroups(machine, 'inconnu')).toEqual([]);
  });
});

describe('suppression dans un répertoire', () => {
  const machine = debianServer({ users: ['hugo', 'julie'] });
  const tmp: FsNode = { type: 'dir', owner: 'root', group: 'root', mode: 0o1777, mtime: 0 };
  const shared: FsNode = { type: 'dir', owner: 'root', group: 'root', mode: 0o777, mtime: 0 };

  it('autorise la suppression avec w et x sur le répertoire parent', () => {
    expect(canDeleteEntry(machine, 'julie', shared, file('hugo', 'hugo', 0o644))).toBe(true);
  });

  it("refuse la suppression sans droit d'écriture sur le parent", () => {
    const readOnly: FsNode = { ...shared, mode: 0o755 };

    expect(canDeleteEntry(machine, 'julie', readOnly, file('julie', 'julie', 0o644))).toBe(false);
  });

  it("avec le sticky bit, refuse de supprimer le fichier d'un autre", () => {
    expect(canDeleteEntry(machine, 'julie', tmp, file('hugo', 'hugo', 0o666))).toBe(false);
  });

  it('avec le sticky bit, autorise le propriétaire du fichier', () => {
    expect(canDeleteEntry(machine, 'hugo', tmp, file('hugo', 'hugo', 0o600))).toBe(true);
  });

  it('avec le sticky bit, autorise le propriétaire du répertoire et root', () => {
    const ownedTmp: FsNode = { ...tmp, owner: 'julie' };

    expect(canDeleteEntry(machine, 'julie', ownedTmp, file('hugo', 'hugo', 0o600))).toBe(true);
    expect(canDeleteEntry(machine, 'root', tmp, file('hugo', 'hugo', 0o600))).toBe(true);
  });
});
