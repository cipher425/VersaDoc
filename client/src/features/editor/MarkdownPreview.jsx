import { useMemo } from 'react';
import { renderMarkdown } from '../../lib/markdown';

export function MarkdownPreview({ text, className = '' }) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  return <article className={`prose-doc ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
