import React, { useState } from 'react';
import { X, ClipboardPaste, AlertCircle, ArrowRight } from 'lucide-react';
import { DocumentData } from '../types';
import { normalizeUploadedJson } from '../utils/treeUtils';

interface PasteJsonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadJson: (data: DocumentData) => void;
}

export const PasteJsonModal: React.FC<PasteJsonModalProps> = ({
  isOpen,
  onClose,
  onLoadJson,
}) => {
  const [pastedText, setPastedText] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setPastedText(text);
        setError(null);
      }
    } catch (err) {
      // If clipboard permission is denied, focus the textarea so the user can paste manually
      const textarea = document.getElementById('paste-json-textarea');
      if (textarea) textarea.focus();
    }
  };

  const handleLoad = () => {
    if (!pastedText.trim()) {
      setError('Please paste your JSON text before submitting.');
      return;
    }

    try {
      const parsed = JSON.parse(pastedText.trim());
      const normalized = normalizeUploadedJson(parsed);
      onLoadJson(normalized);
      setPastedText('');
      setError(null);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Invalid JSON syntax. Please check your JSON format.');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleLoad();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-[#e2e8e4] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#e5ebe7] flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#e8f3ee] text-[#154734] flex items-center justify-center shrink-0">
              <ClipboardPaste className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-neutral-900 text-sm tracking-tight">
                Paste JSON
              </h3>
              <p className="text-[11px] text-neutral-400">
                Paste raw tree JSON to load and render immediately
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePasteFromClipboard}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-[#154734] bg-[#e8f3ee] hover:bg-[#d8ebd1] rounded-xl transition cursor-pointer"
              title="Paste content from clipboard"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              <span>Paste from Clipboard</span>
            </button>
            <button
              onClick={() => {
                setError(null);
                setPastedText('');
                onClose();
              }}
              className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-[#f2f7f4] rounded-xl transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 flex-1 flex flex-col overflow-y-auto bg-[#fafbfa]">
          {error && (
            <div className="mb-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2 shrink-0">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{error}</div>
            </div>
          )}

          <div className="flex-1 flex flex-col min-h-[260px]">
            <textarea
              id="paste-json-textarea"
              value={pastedText}
              onChange={(e) => {
                setPastedText(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder={`Paste your JSON here, e.g.:\n{\n  "root": {\n    "id": "root",\n    "title": "Document Title",\n    "text": "seed",\n    "depth": 0,\n    "children": [...]\n  }\n}`}
              className="w-full flex-1 min-h-[240px] bg-white border border-[#d8e2dc] focus:border-[#154734] focus:ring-1.5 focus:ring-[#154734] rounded-xl p-3.5 font-mono text-xs text-neutral-800 leading-relaxed focus:outline-none resize-none select-text shadow-2xs"
              autoFocus
              spellCheck={false}
            />
          </div>

          <div className="mt-2 text-[11px] text-neutral-400 flex items-center justify-between">
            <span>Tip: Press <kbd className="px-1.5 py-0.5 bg-white border border-neutral-200 rounded text-[10px] text-neutral-600 font-mono">Ctrl+Enter</kbd> to load quickly</span>
            {pastedText && <span>{pastedText.length.toLocaleString()} characters</span>}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#e5ebe7] flex items-center justify-end gap-2 bg-white shrink-0">
          <button
            onClick={() => {
              setError(null);
              setPastedText('');
              onClose();
            }}
            className="px-3.5 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-[#f2f7f4] rounded-xl transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleLoad}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-[#154734] hover:bg-[#0f382c] rounded-xl shadow-xs transition cursor-pointer"
          >
            <span>Load JSON</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
