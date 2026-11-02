# 09 — Tests et qualité

Les tests sont une exigence du projet, pas un bonus : un jeu pédagogique qui refuse une bonne réponse ou valide une mauvaise perd toute crédibilité.

## Pyramide des tests

| Niveau | Outil | Cible | Volume visé |
| --- | --- | --- | --- |
| Unitaires logique | Vitest (Node) | `src/core`, `src/engine`, `src/sims`, `src/content`, `src/game/systems/pathfinding.ts` | Plusieurs milliers |
| Contenu | Vitest + scripts | Tout `content/` : schémas, références, rejeu des solutions | 1 test par mission et par étape |
| Composants | Vitest + Testing Library + happy-dom | `src/ui` | Les composants à logique (Terminal, DialogueBox, MissionWindow, menus) |
| Intégration | Vitest | Moteur + simulateurs + store ensemble | Une par type d'étape |
| E2E | Playwright | Le jeu dans Chromium, Firefox, WebKit mobile | Parcours critiques (une dizaine) |
| Visuel (optionnel) | Playwright captures | Écrans clés | Écran titre, HUD, fenêtre de mission |

## Seuils de couverture

Dans `vitest.config.ts`, appliqués en CI :

```ts
coverage: {
  provider: 'v8',
  include: ['src/**/*.{ts,tsx}'],
  exclude: ['src/**/*.test.*', 'src/content/generated/**', 'src/game/scenes/**', 'src/main.tsx'],
  thresholds: {
    'src/sims/**': { lines: 90, branches: 85, functions: 90 },
    'src/engine/**': { lines: 90, branches: 85, functions: 90 },
    'src/core/**': { lines: 90, branches: 85, functions: 90 },
    'src/content/**': { lines: 85, branches: 80, functions: 85 },
    'src/ui/**': { lines: 70, branches: 60, functions: 70 },
  },
},
```

Les scènes Phaser sont exclues de la couverture : leur logique est extraite dans `src/game/systems` (testée) et elles sont couvertes par les E2E.

## Conventions d'écriture

- Fichier de test à côté du fichier testé : `chmod.ts` → `chmod.test.ts`.
- `describe` et `it` **en français**, au présent, décrivant un comportement observable.
- Structure *Préparer / Agir / Vérifier* avec une ligne vide entre les blocs.
- Pas de dépendance entre tests ; chaque test construit son état avec une fabrique.
- Fabriques de test dans `tests/fixtures/` : `debianServer({ … })`, `windowsClient({ … })`, `topology.twoSwitchesOneRouter()`.
- Instantanés (`toMatchInlineSnapshot`) pour les sorties formatées (`ls -l`, `df -h`, `show ip int brief`), jamais pour la logique.

## Exemples

### Simulateur Bash : une commande

```ts
import { describe, it, expect } from 'vitest';
import { debianServer } from '../../../tests/fixtures/machines';
import { runLine } from './test-utils';

describe('commande chmod', () => {
  it('applique un mode octal au fichier', () => {
    const machine = debianServer({ files: { '/srv/app.conf': { owner: 'hugo', mode: '0644' } }, user: 'hugo' });

    const { state, exitCode } = runLine(machine, 'chmod 640 /srv/app.conf');

    expect(exitCode).toBe(0);
    expect(state.fs.get('/srv/app.conf')?.mode).toBe(0o640);
  });

  it('accepte la notation symbolique équivalente', () => {
    const machine = debianServer({ files: { '/srv/app.conf': { owner: 'hugo', mode: '0644' } }, user: 'hugo' });

    const { state } = runLine(machine, 'chmod u=rw,g=r,o= /srv/app.conf');

    expect(state.fs.get('/srv/app.conf')?.mode).toBe(0o640);
  });

  it("refuse de modifier un fichier dont on n'est pas propriétaire", () => {
    const machine = debianServer({ files: { '/etc/shadow': { owner: 'root', mode: '0640' } }, user: 'hugo' });

    const { stderr, exitCode } = runLine(machine, 'chmod 777 /etc/shadow');

    expect(exitCode).toBe(1);
    expect(stderr).toBe("chmod: modification des droits de '/etc/shadow': Opération non permise\n");
  });
});
```

### Moteur réseau : une trace de paquet

```ts
describe('routage inter-VLAN', () => {
  it("fait passer un ping entre deux VLAN par la sous-interface du routeur", () => {
    const topo = topology.routerOnAStick({ vlans: [10, 20] });

    const trace = simulatePacket(topo, { from: 'pc-vlan10', to: '192.168.20.11', proto: 'icmp' });

    expect(trace.delivered).toBe(true);
    expect(trace.hops.map((h) => h.device)).toEqual(['pc-vlan10', 'sw1', 'r1', 'sw1', 'pc-vlan20']);
  });

  it("bloque le ping quand l'ACL refuse le VLAN 20 vers le VLAN 10", () => {
    const topo = withAcl(topology.routerOnAStick({ vlans: [10, 20] }), 'r1', 'deny ip 192.168.20.0 0.0.0.255 192.168.10.0 0.0.0.255');

    const trace = simulatePacket(topo, { from: 'pc-vlan20', to: '192.168.10.11', proto: 'icmp' });

    expect(trace.delivered).toBe(false);
    expect(trace.droppedBy).toEqual({ device: 'r1', reason: 'acl' });
  });
});
```

### Composant React : le terminal

```tsx
describe('<Terminal>', () => {
  it("exécute la commande saisie et affiche sa sortie", async () => {
    const user = userEvent.setup();
    render(<Terminal sim={fakeSim({ 'whoami': 'hugo' })} />);

    await user.type(screen.getByRole('textbox', { name: 'Commande' }), 'whoami{Enter}');

    expect(screen.getByText('hugo')).toBeInTheDocument();
  });

  it("rappelle la commande précédente avec la flèche haut", async () => {
    const user = userEvent.setup();
    render(<Terminal sim={fakeSim({ 'pwd': '/home/hugo' })} />);
    const input = screen.getByRole('textbox', { name: 'Commande' });

    await user.type(input, 'pwd{Enter}{ArrowUp}');

    expect(input).toHaveValue('pwd');
  });
});
```

### Contenu : chaque mission est résolvable

```ts
describe.each(allMissions())('mission $id', (mission) => {
  it.each(stepsWithSolution(mission))("l'étape $id est résolue par sa solution de référence", (step) => {
    const run = startStep(mission, step.id);
    expect(objectivesMet(run)).toBe(false);          // pas trivial au départ

    const done = replay(run, step.solution);

    expect(objectivesMet(done)).toBe(true);
  });
});
```

## Tests E2E

Le jeu expose, **uniquement en mode test** (`import.meta.env.MODE === 'test'`), un objet `window.__TSSR_DEBUG__` pour piloter les parcours : `teleport(zoneId, x, y)`, `startMission(id)`, `setFlag(name)`, `loadSave(fixture)`.

Parcours couverts :

1. Nouvelle partie : création du personnage, arrivée dans le bureau de la DSI, premier dialogue.
2. Déplacement clavier et tactile, changement de zone par une porte.
3. Mission terminal complète (intranet tombé) : objectifs qui se cochent, XP gagnée, montée de niveau.
4. Mission à choix et à saisie.
5. Sauvegarde puis rechargement : position, inventaire, progression restaurés.
6. Ouverture de chaque menu au clavier uniquement (accessibilité).
7. Mode mobile (viewport 390 × 844) : joystick, bouton d'action, fenêtre de mission plein écran.
8. Fonctionnement hors ligne après une première visite (PWA).

## Intégration continue

`.github/workflows/ci.yml`, à chaque push et pull request :

```yaml
name: CI
on: [push, pull_request]
jobs:
  qualite:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run content:build
      - run: npm run test:coverage
      - run: npm run test:content
      - run: npm run build
  e2e:
    needs: qualite
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
```

## Avant chaque commit

`simple-git-hooks` + `lint-staged` : Prettier et ESLint sur les fichiers modifiés, puis `vitest related` sur les tests liés.

## Tests de jeu humains

- À chaque jalon, une session de test avec 3 à 5 joueurs (apprenants de la promo) : observation, chronométrage, questionnaire court.
- Retours collectés dans des issues GitHub étiquetées `retour-joueur`.
- Un formateur ou un pair relit le contenu pédagogique de chaque chapitre avant publication (étiquette `relu-pedagogie`).
