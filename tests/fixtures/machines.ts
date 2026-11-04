/**
 * Fabriques de machines pour les tests (docs/09-tests-qualite.md) : chaque test construit
 * son état sans dépendre des autres.
 */
import {
  createDebianServer,
  type DebianServerOptions,
  type DiskSpec,
  type FileSpec,
  type PackagesSpec,
  type ServiceSpec,
} from '@sims/shared/factories';
import type { Machine } from '@sims/shared/types';

/** Options simplifiées d'un serveur Debian de test. */
export interface DebianFixtureOptions {
  /** Comptes à créer (par défaut : hugo et julie). */
  readonly users?: readonly string[];
  readonly groups?: Readonly<Record<string, readonly string[]>>;
  readonly files?: Readonly<Record<string, FileSpec | null>>;
  readonly disks?: readonly DiskSpec[];
  readonly services?: Readonly<Record<string, ServiceSpec | null>>;
  /** Compte de la session ouverte (par défaut : hugo). */
  readonly user?: string;
  readonly cwd?: string;
  readonly sudoers?: readonly string[];
  readonly hostname?: string;
  readonly now?: number;
  /** Paquets installés en plus, mises à jour publiées, dpkg interrompu. */
  readonly packages?: PackagesSpec;
  /** Disques supplémentaires vierges (sdb, sdc…). */
  readonly extraDisks?: DebianServerOptions['extraDisks'];
}

/**
 * Serveur Debian de test : hugo (sudoer) et julie, session ouverte pour hugo.
 *
 * @param options - Personnalisation.
 * @returns Une machine prête pour un test.
 */
export function debianServer(options: DebianFixtureOptions): Machine {
  const users = options.users ?? ['hugo', 'julie'];
  const full: DebianServerOptions = {
    hostname: options.hostname ?? 'srv-web01',
    users,
    sudoers: options.sudoers ?? ['hugo'],
    session: {
      user: options.user ?? users[0] ?? 'root',
      ...(options.cwd ? { cwd: options.cwd } : {}),
    },
    ...(options.groups ? { groups: options.groups } : {}),
    ...(options.files ? { files: options.files } : {}),
    ...(options.disks ? { disks: options.disks } : {}),
    ...(options.services ? { services: options.services } : {}),
    ...(options.now !== undefined ? { now: options.now } : {}),
    ...(options.packages ? { packages: options.packages } : {}),
    ...(options.extraDisks ? { extraDisks: options.extraDisks } : {}),
  };
  return createDebianServer(full);
}
