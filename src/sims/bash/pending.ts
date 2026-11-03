import { syncAccountFiles } from '@sims/shared/factories';
import type { Machine, PendingPrompt, SimContext, UserAccount } from '@sims/shared/types';

/** Résultat du traitement d'une réponse. */
export interface PendingResult {
  readonly machine: Machine;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/** Gestionnaire d'une question en attente. */
type PendingHandler = (
  machine: Machine,
  answer: string,
  prompt: PendingPrompt,
  ctx: SimContext,
) => PendingResult;

/** Pose (ou retire) la question en attente de la session. */
export function withPending(machine: Machine, pending: PendingPrompt | undefined): Machine {
  const { pending: _old, ...session } = machine.session;
  return { ...machine, session: pending ? { ...session, pending } : session };
}

/** Jour courant en jours depuis 1970 (champ « dernier changement » de /etc/shadow). */
function today(ctx: SimContext): number {
  return Math.floor(ctx.now.getTime() / 86_400_000);
}

/** Met à jour un compte et régénère /etc/passwd, /etc/group, /etc/shadow. */
export function updateUser(
  machine: Machine,
  name: string,
  change: Partial<UserAccount>,
  ctx: SimContext,
): Machine {
  const user = machine.users[name];
  if (!user) return machine;
  return syncAccountFiles(
    { ...machine, users: { ...machine.users, [name]: { ...user, ...change } } },
    ctx.now.getTime(),
  );
}

/** Fin d'un échange : question retirée. */
function done(machine: Machine, stdout: string, stderr = '', exitCode = 0): PendingResult {
  return { machine: withPending(machine, undefined), stdout, stderr, exitCode };
}

/** Pose la question suivante. */
function ask(machine: Machine, prompt: PendingPrompt, stdout = ''): PendingResult {
  return { machine: withPending(machine, prompt), stdout, stderr: '', exitCode: 0 };
}

/** Questions de adduser pour les informations GECOS (Debian 12). */
const GECOS_FIELDS = [
  'NOM',
  'Numéro de chambre',
  'Téléphone professionnel',
  'Téléphone personnel',
  'Autre',
] as const;

/** Gestionnaires des questions, par type. */
const HANDLERS: Readonly<Record<string, PendingHandler>> = {
  'passwd-current': (machine, answer, prompt) => {
    const user = prompt.data['user'] ?? '';
    if (machine.users[user]?.password !== answer) {
      return done(
        machine,
        '',
        "passwd : Erreur d'authentification\npasswd : le mot de passe n'a pas été changé\n",
        10,
      );
    }
    return ask(machine, {
      kind: 'passwd-new',
      prompt: 'Nouveau mot de passe : ',
      secret: true,
      data: prompt.data,
    });
  },
  'passwd-new': (machine, answer, prompt) => {
    if (answer.length < 1)
      return done(
        machine,
        '',
        "Aucun mot de passe n'a été fourni.\npasswd : Erreur de manipulation du jeton d'authentification\npasswd : le mot de passe n'a pas été changé\n",
        10,
      );
    return ask(machine, {
      kind: 'passwd-retype',
      prompt: 'Retapez le nouveau mot de passe : ',
      secret: true,
      data: { ...prompt.data, first: answer },
    });
  },
  'passwd-retype': (machine, answer, prompt, ctx) => {
    const user = prompt.data['user'] ?? '';
    if (answer !== prompt.data['first']) {
      return done(
        machine,
        '',
        "Les mots de passe ne correspondent pas.\npasswd : Erreur de manipulation du jeton d'authentification\npasswd : le mot de passe n'a pas été changé\n",
        10,
      );
    }
    const updated = updateUser(machine, user, { password: answer, lastChange: today(ctx) }, ctx);
    const message = 'passwd : le mot de passe a été mis à jour avec succès\n';
    if (prompt.data['then'] === 'adduser') {
      const next: PendingPrompt = {
        kind: 'adduser-gecos',
        prompt: `\t${GECOS_FIELDS[0]} []: `,
        secret: false,
        data: { user, field: '0' },
      };
      return ask(
        updated,
        next,
        `${message}Modifier les informations associées à un utilisateur pour ${user}\nEntrer la nouvelle valeur, ou appuyer sur ENTER pour la valeur par défaut\n`,
      );
    }
    return done(updated, message);
  },
  'adduser-gecos': (machine, answer, prompt, ctx) => {
    const user = prompt.data['user'] ?? '';
    const field = Number(prompt.data['field'] ?? '0');
    const values = { ...prompt.data, [`f${field}`]: answer };
    if (field + 1 < GECOS_FIELDS.length) {
      return ask(machine, {
        kind: 'adduser-gecos',
        prompt: `\t${GECOS_FIELDS[field + 1] ?? ''} []: `,
        secret: false,
        data: { ...values, field: String(field + 1) },
      });
    }
    const gecos = GECOS_FIELDS.map((_, i) => values[`f${i}`] ?? '').join(',');
    return ask(updateUser(machine, user, { gecos }, ctx), {
      kind: 'adduser-confirm',
      prompt: 'Cette information est-elle correcte ? [O/n] ',
      secret: false,
      data: { user },
    });
  },
  'adduser-confirm': (machine, answer, prompt) => {
    if (/^n/i.test(answer.trim())) {
      return ask(machine, {
        kind: 'adduser-gecos',
        prompt: `\t${GECOS_FIELDS[0]} []: `,
        secret: false,
        data: { user: prompt.data['user'] ?? '', field: '0' },
      });
    }
    const user = prompt.data['user'] ?? '';
    return done(
      machine,
      `Ajout du nouvel utilisateur « ${user} » aux groupes supplémentaires « users » ...\nAjout de l'utilisateur « ${user} » au groupe « users » ...\n`,
    );
  },
  su: (machine, answer, prompt) => {
    const target = prompt.data['user'] ?? 'root';
    const account = machine.users[target];
    if (!account || account.locked || account.password === null || account.password !== answer) {
      return done(machine, '', "su: Échec de l'authentification\n", 1);
    }
    return {
      machine: switchUser(withPending(machine, undefined), target, prompt.data['login'] === 'true'),
      stdout: '',
      stderr: '',
      exitCode: 0,
    };
  },
};

/**
 * Ouvre une session imbriquée sous un autre compte (su, sudo -i) ; `exit` y mettra fin.
 *
 * @param machine - Machine simulée.
 * @param target - Compte cible.
 * @param login - Vrai pour un shell de connexion (`su -`, `sudo -i`) : dossier personnel du compte.
 * @returns La machine avec la nouvelle session.
 */
export function switchUser(machine: Machine, target: string, login: boolean): Machine {
  const account = machine.users[target];
  if (!account) return machine;
  const parent = machine.session;
  const cwd = login ? account.home : parent.cwd;
  const path =
    target === 'root'
      ? '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
      : '/usr/local/bin:/usr/bin:/bin:/usr/local/games:/usr/games';
  return {
    ...machine,
    session: {
      ...parent,
      user: target,
      cwd,
      previousCwd: null,
      parent,
      env: {
        ...parent.env,
        USER: target,
        LOGNAME: target,
        HOME: account.home,
        SHELL: account.shell,
        PWD: cwd,
        ...(login ? { PATH: path } : {}),
      },
    },
  };
}

/**
 * Traite la réponse du joueur à la question en attente.
 *
 * @param machine - Machine dont la session a une question en attente.
 * @param answer - Ligne tapée.
 * @param ctx - Contexte de simulation.
 * @returns Le résultat (question suivante ou fin de l'échange).
 */
export function answerPending(machine: Machine, answer: string, ctx: SimContext): PendingResult {
  const prompt = machine.session.pending;
  const handler = prompt ? HANDLERS[prompt.kind] : undefined;
  if (!prompt || !handler) return done(machine, '');
  return handler(machine, answer, prompt, ctx);
}
