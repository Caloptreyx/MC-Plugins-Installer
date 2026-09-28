/**
 * Renders Modrinth Markdown or CurseForge HTML through the panel's sanitizing Markdown renderer.
 * Indentation is stripped from HTML so nested tags are not mistaken for Markdown code blocks.
 */
export default function RichText({ content, format }: { content: string; format: 'markdown' | 'html' }) {
  const source = format === 'html' ? content.replace(/^[ \t]+/gm, '') : content;

  return <div className='mcpi-rich-text'>{source.md({ html: true })}</div>;
}
