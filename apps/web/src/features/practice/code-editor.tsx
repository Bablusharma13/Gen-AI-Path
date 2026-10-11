'use client';

import { python } from '@codemirror/lang-python';
import CodeMirror from '@uiw/react-codemirror';
import { useVizMode } from '@/components/viz/palette';

/** Python editor (CodeMirror 6, bundled locally — no CDN). Esc then Tab leaves the editor. */
export function CodeEditor({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const mode = useVizMode();
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={[python()]}
      theme={mode}
      height="320px"
      aria-label={label}
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: true,
        autocompletion: false,
      }}
      className="overflow-hidden rounded-lg border text-sm"
    />
  );
}
