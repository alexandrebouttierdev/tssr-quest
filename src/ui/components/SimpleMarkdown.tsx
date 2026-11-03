import type { ReactNode } from 'react';

/** Rend le gras (`**x**`) et le code (`` `x` ``) d'une ligne, sans HTML brut. */
function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    return part;
  });
}

/**
 * Affiche le Markdown simple des fiches « À retenir » : paragraphes, listes à puces,
 * gras et code. Aucun HTML n'est injecté.
 *
 * @param props - Texte Markdown.
 * @returns Les éléments React.
 */
export function SimpleMarkdown({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        if (lines.every((l) => l.startsWith('- '))) {
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.slice(2))}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{inline(lines.join(' '))}</p>;
      })}
    </>
  );
}
