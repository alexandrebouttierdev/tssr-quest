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
import { cp, mv } from './cp-mv';
import { find } from './find';
import { egrep, grep } from './grep';
import { head, tail } from './head-tail';
import {
  apropos,
  date,
  file,
  groups,
  history,
  id,
  nano,
  stat,
  type,
  uname,
  which,
  whatis,
  who,
} from './info';
import { ln } from './ln';
import { locate, updatedb } from './locate';
import { mkdir } from './mkdir';
import { rmdir } from './rmdir';
import { cut, less, more, printf, sleep, sort, tee, tr, uniq } from './text-tools';
import { touch } from './touch';
import { wc } from './wc';

/** Toutes les commandes du simulateur Bash, indexées par nom. */
export const BASH_COMMANDS: Readonly<Record<string, BashCommand>> = Object.fromEntries(
  [
    aide,
    apropos,
    cat,
    cd,
    clear,
    cp,
    curl,
    cut,
    date,
    df,
    du,
    echo,
    egrep,
    exit,
    exportCommand,
    falseCommand,
    file,
    find,
    grep,
    groups,
    head,
    history,
    hostname,
    id,
    journalctl,
    less,
    ln,
    locate,
    ls,
    man,
    mkdir,
    more,
    mv,
    nano,
    printf,
    pwd,
    rm,
    rmdir,
    sleep,
    sort,
    stat,
    sudo,
    systemctl,
    tail,
    tee,
    touch,
    tr,
    trueCommand,
    type,
    uname,
    uniq,
    updatedb,
    wc,
    whatis,
    which,
    who,
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
