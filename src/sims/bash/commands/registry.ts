import type { BashCommand } from '../command';
import { aide } from './aide';
import { cat } from './cat';
import { cd } from './cd';
import { clear } from './clear';
import { curl } from './curl';
import { df } from './df';
import { du } from './du';
import { echo } from './echo';
import { exit } from './exit';
import { exportCommand } from './export';
import { hostname } from './hostname';
import { journalctl } from './journalctl';
import { ls } from './ls';
import { man } from './man';
import { pwd } from './pwd';
import { rm } from './rm';
import { sudo } from './sudo';
import { systemctl } from './systemctl';
import { falseCommand, trueCommand } from './true-false';
import { whoami } from './whoami';

/** Toutes les commandes du simulateur Bash, indexées par nom. */
export const BASH_COMMANDS: Readonly<Record<string, BashCommand>> = Object.fromEntries(
  [
    aide,
    cat,
    cd,
    clear,
    curl,
    df,
    du,
    echo,
    exit,
    exportCommand,
    falseCommand,
    hostname,
    journalctl,
    ls,
    man,
    pwd,
    rm,
    sudo,
    systemctl,
    trueCommand,
    whoami,
  ].map((c) => [c.name, c]),
);

/** Alias : `help` et `?` affichent l'aide du jeu, `logout` ferme la session. */
export const BASH_ALIASES: Readonly<Record<string, BashCommand>> = {
  help: { ...aide, name: 'help' },
  '?': { ...aide, name: '?' },
  logout: { ...exit, name: 'logout' },
};

/** Commandes et alias réunis. */
export const ALL_BASH_COMMANDS: Readonly<Record<string, BashCommand>> = {
  ...BASH_COMMANDS,
  ...BASH_ALIASES,
};
