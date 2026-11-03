import { useId, useState, type CSSProperties, type FormEvent } from 'react';
import type { Pronouns } from '@core/model';
import { STRINGS } from '../strings/fr';
import styles from './TitleScreen.module.css';

/** Identité choisie pour une nouvelle partie. */
export interface NewGameIdentity {
  readonly name: string;
  readonly pronouns: Pronouns;
}

/** Propriétés de l'écran titre. */
export interface TitleScreenProps {
  /** Une sauvegarde automatique existe : « Continuer » est proposé. */
  readonly hasSave: boolean;
  /** Prénom de la sauvegarde, pour le bouton « Continuer ». */
  readonly savedName?: string;
  readonly onContinue: () => void;
  readonly onNewGame: (identity: NewGameIdentity) => void;
}

/** Nombre de baies visibles derrière la vitre, et de LED par baie. */
const RACKS = 9;
const LEDS = 10;

/** Ordre d'affichage des pronoms. */
const PRONOUNS: readonly Pronouns[] = ['elle', 'il', 'iel'];

/**
 * Décor : LabCorp de nuit, la salle serveurs qui clignote derrière une vitre, la pluie
 * (docs/07, « Écrans clés »). Purement décoratif, entièrement en CSS.
 */
function NightScene() {
  return (
    <div className={styles['scene']} aria-hidden="true">
      <div className={styles['stars']} />
      <div className={styles['building']}>
        <div className={styles['floors']} />
        <div className={styles['window']}>
          {Array.from({ length: RACKS }, (_, rack) => (
            <div key={rack} className={styles['rack']}>
              {Array.from({ length: LEDS }, (_, led) => (
                <span
                  key={led}
                  className={styles['led']}
                  data-tone={(rack * 7 + led * 3) % 11 === 0 ? 'amber' : 'green'}
                  style={{ '--delay': `${((rack * 37 + led * 53) % 23) / 10}s` } as CSSProperties}
                />
              ))}
            </div>
          ))}
          <div className={styles['reflection']} />
        </div>
        <p className={styles['sign']}>LabCorp</p>
      </div>
      <div className={styles['rain']} />
      <div className={styles['rain-far']} />
      <div className={styles['ground']} />
    </div>
  );
}

/**
 * Écran titre (docs/08) : décor de nuit, logo, nouvelle partie avec prénom et pronoms,
 * reprise de la sauvegarde, rappel des contrôles.
 *
 * @param props - Sauvegarde disponible et actions.
 * @returns L'écran titre.
 */
export function TitleScreen({ hasSave, savedName, onContinue, onNewGame }: TitleScreenProps) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [pronouns, setPronouns] = useState<Pronouns>('iel');
  const nameId = useId();
  const t = STRINGS.title;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onNewGame({ name: name.trim(), pronouns });
  };

  return (
    <main className={styles['title']} aria-label={STRINGS.appTitle}>
      <NightScene />
      <div className={styles['content']}>
        <header className={styles['logo']}>
          <p className={styles['company']}>{t.company}</p>
          <h1 className={styles['name']}>
            TSSR <span>Quest</span>
          </h1>
          <p className={styles['tagline']}>{t.tagline}</p>
        </header>

        {creating ? (
          <form className={styles['panel']} onSubmit={submit}>
            <label className={styles['label']} htmlFor={nameId}>
              {t.nameLabel}
            </label>
            <input
              id={nameId}
              className={styles['input']}
              value={name}
              maxLength={20}
              autoComplete="off"
              placeholder={t.namePlaceholder}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <fieldset className={styles['pronouns']}>
              <legend className={styles['label']}>{t.pronounsLabel}</legend>
              {PRONOUNS.map((p) => (
                <label key={p} className={styles['choice']}>
                  <input
                    type="radio"
                    name="pronouns"
                    value={p}
                    checked={pronouns === p}
                    onChange={() => setPronouns(p)}
                  />
                  <span>{t.pronouns[p]}</span>
                </label>
              ))}
            </fieldset>
            {hasSave && <p className={styles['warning']}>{t.overwrite}</p>}
            <div className={styles['actions']}>
              <button type="submit" className={styles['primary']}>
                {t.start}
              </button>
              <button
                type="button"
                className={styles['secondary']}
                onClick={() => setCreating(false)}
              >
                {t.back}
              </button>
            </div>
          </form>
        ) : (
          <nav className={styles['panel']} aria-label={t.menu}>
            {hasSave && (
              <button type="button" className={styles['primary']} onClick={onContinue} autoFocus>
                {t.continue}
                {savedName ? <small> · {savedName}</small> : null}
              </button>
            )}
            <button
              type="button"
              className={hasSave ? styles['secondary'] : styles['primary']}
              onClick={() => setCreating(true)}
              autoFocus={!hasSave}
            >
              {t.newGame}
            </button>
            <section className={styles['controls']} aria-label={t.controlsTitle}>
              <h2>{t.controlsTitle}</h2>
              <dl>
                {t.controls.map(([keys, action]) => (
                  <div key={keys}>
                    <dt>
                      <kbd>{keys}</kbd>
                    </dt>
                    <dd>{action}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </nav>
        )}
      </div>
      <p className={styles['footer']}>{t.footer}</p>
    </main>
  );
}
