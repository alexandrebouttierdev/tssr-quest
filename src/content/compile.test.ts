import { describe, expect, it } from 'vitest';
import { VALID_CONTENT_FILES } from '@tests/fixtures/content';
import { compileContent, parseSheet } from './compile';
import { indexContent, loadContent } from './loader';
import { englishWords, missionMaxXp, validateBundle } from './validate';

describe('compilation du contenu', () => {
  it('compile un contenu valide sans erreur', () => {
    const { bundle, errors } = compileContent(VALID_CONTENT_FILES);

    expect(errors).toEqual([]);
    expect(bundle.missions.map((m) => m.id)).toEqual(['test.panne', 'test.suite']);
    expect(bundle.sheets).toEqual([
      { id: 'fiche-a', title: 'Fiche A', body: 'Le corps de la fiche.' },
    ]);
    expect(validateBundle(bundle)).toEqual([]);
  });

  it('signale un YAML mal formé', () => {
    const { errors } = compileContent({ 'npcs/x.npc.yaml': 'id: [' });

    expect(errors[0]?.message).toMatch(/^YAML invalide/);
  });

  it('signale un champ invalide avec son chemin', () => {
    const { errors } = compileContent({
      ...VALID_CONTENT_FILES,
      'npcs/hugo.npc.yaml': 'id: Hugo\nname: Hugo\nrole: r\nzone: salle\ndescription: d',
    });

    expect(errors).toContainEqual({
      file: 'npcs/hugo.npc.yaml',
      message: 'id : identifiant en kebab-case attendu',
    });
  });

  it('signale un fichier inattendu, une liste attendue et un nom de dialogue incohérent', () => {
    const { errors } = compileContent({
      'divers.txt': 'x',
      'zones/zones.yaml': 'id: salle',
      'dialogues/autre.dialogue.yaml': 'npc: hugo\nnodes:\n  default:\n    - say: Bonjour.',
    });

    expect(errors.map((e) => e.message)).toEqual([
      "le fichier doit s'appeler hugo.dialogue.yaml",
      'fichier inattendu dans content/ (nom ou emplacement à revoir)',
      'une liste est attendue',
    ]);
  });

  it('vérifie les règles des étapes et des missions', () => {
    const broken = VALID_CONTENT_FILES['chapters/05-test/panne.mission.yaml']!.replace(
      'id: test.panne',
      'id: autre.panne',
    )
      .replace('machine: srv', 'machine: absente')
      .replace('{ text: rm -rf, feedback: Surtout pas. }', '{ text: rm -rf, correct: true }');
    const { errors } = compileContent({ 'chapters/05-test/panne.mission.yaml': broken });

    expect(errors.map((e) => e.message)).toEqual(
      expect.arrayContaining(['steps.1 : une seule bonne option sans « multiple: true »']),
    );
  });

  it('lit une fiche sans titre', () => {
    expect(parseSheet('x', 'corps seul')).toEqual({ id: 'x', title: '', body: 'corps seul' });
  });
});

describe('validation des références', () => {
  /** Compile le contenu valide avec un fichier remplacé. */
  const withFile = (path: string, text: string) =>
    compileContent({ ...VALID_CONTENT_FILES, [path]: text }).bundle;

  it('signale les références inconnues', () => {
    const bundle = withFile(
      'chapters/05-test/suite.mission.yaml',
      VALID_CONTENT_FILES['chapters/05-test/suite.mission.yaml']!.replace(
        'giver: hugo',
        'giver: fantome',
      )
        .replace('zone: salle', 'zone: nulle-part')
        .replace(
          'requires: { missions: [test.panne] }',
          'requires: { missions: [test.absente], items: [rien] }',
        )
        .replace('rewards: {}', 'rewards: { items: [rien], sheets: [rien] }')
        .replace('"hugo#outro"', '"hugo#absent"'),
    );

    expect(validateBundle(bundle).map((e) => e.message)).toEqual(
      expect.arrayContaining([
        'PNJ inconnu : fantome',
        'zone inconnue : nulle-part',
        'prérequis inconnu : test.absente',
        'objet requis inconnu : rien',
        'objet inconnu : rien',
        'fiche inconnue : rien',
        'nœud de dialogue introuvable : hugo#absent',
      ]),
    );
  });

  it('détecte un cycle de prérequis', () => {
    const bundle = withFile(
      'chapters/05-test/panne.mission.yaml',
      VALID_CONTENT_FILES['chapters/05-test/panne.mission.yaml']!.replace(
        'zone: salle\nticket',
        'zone: salle\nrequires: { missions: [test.suite] }\nticket',
      ),
    );

    expect(validateBundle(bundle).some((e) => e.message.startsWith('cycle de prérequis'))).toBe(
      true,
    );
  });

  it('signale une mission absente de son chapitre et des références de chapitre inconnues', () => {
    const bundle = withFile(
      'chapters/05-test/chapter.yaml',
      VALID_CONTENT_FILES['chapters/05-test/chapter.yaml']!.replace(
        'missions: [test.panne, test.suite]',
        'missions: [test.panne, test.fantome]',
      )
        .replace('unlocks: { zones: [salle], items: [cle] }', 'unlocks: { zones: [z], items: [i] }')
        .replace('mentor: hugo', 'mentor: personne'),
    );

    expect(validateBundle(bundle).map((e) => e.message)).toEqual(
      expect.arrayContaining([
        'mission absente de la liste du chapitre test',
        'mission inconnue : test.fantome',
        'mentor inconnu : personne',
        'zone inconnue : z',
        'objet inconnu : i',
      ]),
    );
  });

  it('vérifie les effets et conditions des dialogues', () => {
    const bundle = withFile(
      'dialogues/hugo.dialogue.yaml',
      `npc: hugo
nodes:
  intro: [{ say: Bonjour., effects: [{ giveItem: x }, { takeItem: y }, { startMission: a.b }, { unlockSheet: s }, { unlockZone: z }] }]
  outro: [{ say: Fin., if: { missionDone: a.c } }]
  abandon: [{ say: Please click the button. }]
  default: [{ say: Salut. }]
`,
    );

    expect(validateBundle(bundle).map((e) => e.message)).toEqual(
      expect.arrayContaining([
        'objet inconnu : x',
        'objet inconnu : y',
        'mission inconnue : a.b',
        'fiche inconnue : s',
        'zone inconnue : z',
        'mission inconnue : a.c',
        'texte en anglais ? (click, please, the) : « Please click the button. »',
      ]),
    );
  });

  it("vérifie la fourchette d'XP", () => {
    const bundle = withFile(
      'chapters/05-test/suite.mission.yaml',
      VALID_CONTENT_FILES['chapters/05-test/suite.mission.yaml']!.replace(
        'rewards: {}',
        'rewards: { xp: 2000 }',
      ),
    );

    expect(validateBundle(bundle).map((e) => e.message)).toContain(
      'XP maximale hors fourchette (60 à 600) : 2030',
    );
  });
});

describe("détection de l'anglais", () => {
  it('repère une phrase anglaise et accepte du français technique', () => {
    expect(englishWords('Please restart the server')).toEqual(['please', 'the']);
    expect(englishWords('Relance le service avec `sudo systemctl restart apache2`.')).toEqual([]);
    expect(englishWords('Tape df -h puis ls -lh /var/log')).toEqual([]);
    expect(englishWords('error')).toEqual([]);
  });

  it("calcule l'XP maximale d'une mission", () => {
    const { bundle } = compileContent(VALID_CONTENT_FILES);

    expect(missionMaxXp(bundle.missions[0]!)).toBe(4 * 30 + 100);
  });
});

describe('chargeur de contenu', () => {
  it('valide et indexe le JSON compilé', () => {
    const { bundle } = compileContent(VALID_CONTENT_FILES);

    const index = loadContent(JSON.parse(JSON.stringify(bundle)));

    expect(index.missions.get('test.panne')?.title).toBe('La panne');
    expect(index.dialogues.get('hugo')?.npc).toBe('hugo');
    expect(index.npcs.get('hugo')?.name).toBe('Hugo');
    expect(index.chapters.get('test')?.number).toBe(5);
    expect(index.zones.get('salle')).toBeDefined();
    expect(index.items.get('cle')).toBeDefined();
    expect(index.sheets.get('fiche-a')).toBeDefined();
    expect(indexContent(bundle).bundle).toBe(bundle);
  });

  it('refuse un JSON invalide', () => {
    expect(() => loadContent({ missions: 'non' })).toThrow(/Contenu invalide/);
  });
});
