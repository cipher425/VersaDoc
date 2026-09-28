import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: false });

/**
 * Markdown -> safe HTML. DOMPurify removes <script>, onerror= and other XSS payloads, so a
 * malicious collaborator can't run JavaScript in other people's browsers through a document.
 */
export const renderMarkdown = (text) => DOMPurify.sanitize(marked.parse(text || ''));
