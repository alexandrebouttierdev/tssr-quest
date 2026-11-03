import { useState } from 'react';
import type { StepView } from '@core/store/mission-run.slice';
import { STRINGS } from '../strings/fr';
import styles from './MissionWindow.module.css';

/** Saisie envoyée au moteur. */
type Submit = (payload: unknown) => void;

/**
 * Étape à choix : une ou plusieurs options, puis « Valider ».
 *
 * @param props - Vue de l'étape et envoi de la réponse.
 * @returns Le formulaire.
 */
export function ChoiceStepView({
  step,
  onSubmit,
  disabled,
}: {
  step: Extract<StepView, { type: 'choice' }>;
  onSubmit: Submit;
  disabled: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string) =>
    setSelected((s) =>
      step.multiple ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : [id],
    );
  return (
    <form
      className={styles['form']}
      onSubmit={(e) => {
        e.preventDefault();
        if (selected.length) onSubmit({ options: selected.map(Number) });
      }}
    >
      <fieldset className={styles['fieldset']}>
        <legend className={styles['question']}>{step.question}</legend>
        {step.options.map((option) => (
          <label key={option.id} className={styles['option']}>
            <input
              type={step.multiple ? 'checkbox' : 'radio'}
              name={`choice-${step.id}`}
              checked={selected.includes(option.id)}
              onChange={() => toggle(option.id)}
              disabled={disabled}
            />
            <span>{option.text}</span>
          </label>
        ))}
      </fieldset>
      <button
        type="submit"
        className={styles['primary']}
        disabled={disabled || selected.length === 0}
      >
        {STRINGS.mission.validate}
      </button>
    </form>
  );
}

/**
 * Étape de saisie libre.
 *
 * @param props - Vue de l'étape et envoi de la réponse.
 * @returns Le formulaire.
 */
export function InputStepView({
  step,
  onSubmit,
  disabled,
}: {
  step: Extract<StepView, { type: 'input' }>;
  onSubmit: Submit;
  disabled: boolean;
}) {
  const [text, setText] = useState('');
  return (
    <form
      className={styles['form']}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ text });
      }}
    >
      <label className={styles['question']} htmlFor={`input-${step.id}`}>
        {step.question}
      </label>
      <input
        id={`input-${step.id}`}
        className={styles['text']}
        value={text}
        disabled={disabled}
        autoComplete="off"
        placeholder={STRINGS.mission.answer}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <button type="submit" className={styles['primary']} disabled={disabled || !text.trim()}>
        {STRINGS.mission.validate}
      </button>
    </form>
  );
}

/**
 * Étape d'ordre : monter et descendre les éléments au clavier ou au toucher.
 *
 * @param props - Vue de l'étape et envoi de la réponse.
 * @returns La liste ordonnable.
 */
export function OrderingStepView({
  step,
  onSubmit,
  disabled,
}: {
  step: Extract<StepView, { type: 'ordering' }>;
  onSubmit: Submit;
  disabled: boolean;
}) {
  const [items, setItems] = useState(step.items);
  const move = (index: number, delta: number) =>
    setItems((list) => {
      const next = [...list];
      const target = index + delta;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  return (
    <form
      className={styles['form']}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ order: items.map((i) => i.id) });
      }}
    >
      <p className={styles['question']}>{step.question}</p>
      <ol className={styles['ordering']}>
        {items.map((item, index) => (
          <li key={item.id}>
            <span>{item.text}</span>
            <button
              type="button"
              onClick={() => move(index, -1)}
              disabled={disabled || index === 0}
              aria-label={`${STRINGS.mission.moveUp} : ${item.text}`}
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => move(index, 1)}
              disabled={disabled || index === items.length - 1}
              aria-label={`${STRINGS.mission.moveDown} : ${item.text}`}
            >
              ↓
            </button>
          </li>
        ))}
      </ol>
      <button type="submit" className={styles['primary']} disabled={disabled}>
        {STRINGS.mission.validate}
      </button>
    </form>
  );
}
