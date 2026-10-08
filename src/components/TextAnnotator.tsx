import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Sparkles,
  ClipboardPaste,
  FileText,
  X,
  Undo2,
  Check,
  Split,
  CornerDownLeft,
} from 'lucide-react';
import { DocumentData } from '../types';
import {
  DocBlock,
  BlockType,
  buildTreeFromBlocks,
  parseTextToBlocks,
  convertTreeToBlocks,
} from '../utils/blockUtils';
import { generateNodeId } from '../utils/treeUtils';
import { SAMPLE_ARTICLE_TEXT } from '../sampleData';

interface TextAnnotatorProps {
  data: DocumentData;
  activeNodeId: string | null;
  onUpdateData: (newData: DocumentData) => void;
  onSelectNode: (id: string) => void;
}

interface SelectionState {
  blockId: string;
  start: number;
  end: number;
  selectedText: string;
  x: number;
  y: number;
}

export const TextAnnotator: React.FC<TextAnnotatorProps> = ({
  data,
  activeNodeId,
  onUpdateData,
  onSelectNode,
}) => {
  // Initialize blocks
  const [docTitle, setDocTitle] = useState(() => data.root.title || 'Paid Time Off Policy');
  const [blocks, setBlocks] = useState<DocBlock[]>(() => {
    const converted = convertTreeToBlocks(data);
    if (converted.blocks.length > 0) return converted.blocks;
    return parseTextToBlocks(SAMPLE_ARTICLE_TEXT).blocks;
  });

  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [selectionState, setSelectionState] = useState<SelectionState | null>(null);
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pastedArticleText, setPastedArticleText] = useState('');
  const [notification, setNotification] = useState<string | null>(null);

  const paperRef = useRef<HTMLDivElement>(null);
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  // Auto-resize textareas as user types
  const autoResizeTextarea = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(32, el.scrollHeight)}px`;
  };

  // Rebuild DocumentData whenever docTitle or blocks change
  useEffect(() => {
    const newTree = buildTreeFromBlocks(docTitle, blocks);
    onUpdateData(newTree);
  }, [docTitle, blocks]);

  // Scroll to block when activeNodeId changes from outline
  useEffect(() => {
    if (activeNodeId && activeNodeId !== 'root') {
      const el = document.getElementById(`block-${activeNodeId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [activeNodeId]);

  // Helper to show temporary notification
  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 2500);
  };

  // Capture selection in a block's textarea
  const updateSelectionFromTextarea = (blockId: string, target: HTMLTextAreaElement) => {
    const start = target.selectionStart;
    const end = target.selectionEnd;

    if (start !== end && start >= 0 && end > start) {
      const rawSelected = target.value.slice(start, end).trim();
      if (rawSelected.length > 0 && rawSelected.length < 250) {
        const rect = target.getBoundingClientRect();
        setSelectionState({
          blockId,
          start,
          end,
          selectedText: rawSelected,
          x: Math.max(20, rect.left + 30),
          y: Math.max(10, rect.top - 48),
        });
        return;
      }
    }
    setSelectionState(null);
  };

  // Core Slicing Engine: Slices ONLY the selected text into a Heading!
  // Leaves text before as body, and text after as body!
  const sliceSelectionIntoHeading = (
    blockId: string,
    type: BlockType,
    start: number,
    end: number,
    selectedText: string
  ) => {
    // Detect label if present in selection (e.g. "1. Scope" -> label "1", title "Scope")
    let label = '';
    let title = selectedText.trim();
    const numMatch = selectedText.match(
      /^(\(?\d+(?:\.\d+)*(?:\.\([a-zA-Z0-9]+\))?\)|\([a-zA-Z0-9]+\))\s*(?:[-:.]\s*|\s+)(.+)$/
    );
    if (numMatch) {
      label = numMatch[1].replace(/[.)]$/, '');
      title = numMatch[2].trim();
    }

    setBlocks((prev) => {
      const blockIndex = prev.findIndex((b) => b.id === blockId);
      if (blockIndex === -1) return prev;

      const targetBlock = prev[blockIndex];
      const beforeText = targetBlock.text.slice(0, start).trim();
      const afterText = targetBlock.text.slice(end).trim();

      const createdBlocks: DocBlock[] = [];

      // 1. Text before selection stays as normal body paragraph
      if (beforeText) {
        createdBlocks.push({
          id: generateNodeId('p'),
          type: 'paragraph',
          label: '',
          text: beforeText,
        });
      }

      // 2. ONLY the selected text becomes the Heading!
      const newHeadingId = generateNodeId(label || 'h');
      createdBlocks.push({
        id: newHeadingId,
        type,
        label,
        text: title,
      });

      // 3. Text after selection stays as normal body paragraph!
      if (afterText) {
        createdBlocks.push({
          id: generateNodeId('p'),
          type: 'paragraph',
          label: '',
          text: afterText,
        });
      }

      const updated = [...prev];
      updated.splice(blockIndex, 1, ...createdBlocks);
      onSelectNode(newHeadingId);
      showToast(`Created ${type === 'heading-1' ? 'H1' : type === 'heading-2' ? 'H2' : 'H3'}: "${title}"`);
      return updated;
    });

    setSelectionState(null);
  };

  // Handler triggered by ANY Heading button for a block
  const handleApplyHeadingToBlock = (blockId: string, type: BlockType) => {
    // Check if the user currently has text selected in this block's textarea!
    const textarea = textareaRefs.current[blockId];
    let start = 0;
    let end = 0;
    let selectedText = '';

    if (textarea && textarea.selectionStart !== textarea.selectionEnd) {
      start = textarea.selectionStart;
      end = textarea.selectionEnd;
      selectedText = textarea.value.slice(start, end).trim();
    } else if (selectionState && selectionState.blockId === blockId) {
      start = selectionState.start;
      end = selectionState.end;
      selectedText = selectionState.selectedText;
    }

    // IF text IS selected: SLICE ONLY THAT WORD/PHRASE!
    if (selectedText && selectedText.length > 0) {
      sliceSelectionIntoHeading(blockId, type, start, end, selectedText);
      return;
    }

    // IF NO text is selected: ONLY then change the block type directly
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId) return b;
        return {
          ...b,
          type,
          label: type === 'paragraph' ? '' : b.label,
        };
      })
    );
    if (type !== 'paragraph') {
      onSelectNode(blockId);
    }
  };

  // REVERT HEADING TO BODY AND AUTOMATICALLY MERGE INTO PARAGRAPH BELOW
  const handleRevertHeadingToBody = (blockId: string) => {
    setBlocks((prev) => {
      const index = prev.findIndex((b) => b.id === blockId);
      if (index === -1) return prev;

      const currentBlock = prev[index];
      const headingContent = (currentBlock.label ? `${currentBlock.label} ` : '') + currentBlock.text;

      // Check if the block immediately below is a paragraph
      const nextBlock = prev[index + 1];
      if (nextBlock && nextBlock.type === 'paragraph') {
        // Automatically merge heading text into the beginning of the paragraph below!
        const mergedText = headingContent + (nextBlock.text ? `\n${nextBlock.text}` : '');
        const updated = [...prev];
        updated[index + 1] = {
          ...nextBlock,
          text: mergedText,
        };
        // Remove the heading block
        updated.splice(index, 1);
        showToast(`Reverted "${currentBlock.text}" and merged into paragraph below`);
        return updated;
      } else {
        // If there's no paragraph below, simply convert this block into a normal paragraph
        const updated = [...prev];
        updated[index] = {
          ...currentBlock,
          type: 'paragraph',
          label: '',
          text: headingContent,
        };
        showToast(`Reverted "${currentBlock.text}" to body paragraph`);
        return updated;
      }
    });
  };

  // Block updates
  const handleUpdateBlockText = (id: string, text: string) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, text } : b))
    );
  };

  const handleUpdateBlockLabel = (id: string, label: string) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, label } : b))
    );
  };

  const handleDeleteBlock = (id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  };

  const handleAddBlockBelow = (index: number) => {
    const newBlock: DocBlock = {
      id: generateNodeId('p'),
      type: 'paragraph',
      label: '',
      text: '',
    };
    setBlocks((prev) => {
      const updated = [...prev];
      updated.splice(index + 1, 0, newBlock);
      return updated;
    });
    setActiveBlockId(newBlock.id);
  };

  // Full article paste handler - robustly populates document with all paragraphs
  const handleLoadPastedArticle = () => {
    if (!pastedArticleText.trim()) return;
    const parsed = parseTextToBlocks(pastedArticleText, docTitle);
    if (parsed.docTitle && parsed.docTitle !== 'Untitled Document') {
      setDocTitle(parsed.docTitle);
    }
    setBlocks(parsed.blocks);
    setIsPasteModalOpen(false);
    setPastedArticleText('');
    showToast(`Loaded ${parsed.blocks.length} paragraphs into document!`);
  };

  // Auto-detect headings in current blocks
  const handleAutoDetect = () => {
    const raw = blocks.map((b) => (b.label ? `${b.label} ` : '') + b.text).join('\n\n');
    const parsed = parseTextToBlocks(raw, docTitle);
    setBlocks(parsed.blocks);
    showToast('Auto-detected headings');
  };

  return (
    <main
      ref={paperRef}
      className="flex-1 overflow-y-auto bg-[#f2f5f3] w-full min-w-0 p-4 sm:p-8 relative"
    >
      {/* Toast notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#154734] text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-xl border border-emerald-800 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <Check className="w-4 h-4 text-emerald-300" />
          <span>{notification}</span>
        </div>
      )}

      {/* Floating Selection Tooltip: Slices ONLY the selected word into a Heading! */}
      {selectionState && (
        <div
          id="selection-heading-toolbar"
          style={{
            position: 'fixed',
            left: `${selectionState.x}px`,
            top: `${selectionState.y}px`,
          }}
          className="z-50 flex items-center gap-1.5 bg-[#154734] text-white p-1.5 rounded-xl shadow-2xl border border-emerald-900 animate-in fade-in zoom-in-95 duration-100 select-none"
        >
          <div className="px-2 py-0.5 text-[11px] font-mono text-emerald-200 border-r border-emerald-700/60 truncate max-w-[130px]">
            "{selectionState.selectedText}"
          </div>

          <button
            onMouseDown={(e) => {
              e.preventDefault();
              handleApplyHeadingToBlock(selectionState.blockId, 'heading-1');
            }}
            className="px-2.5 py-1 text-xs font-semibold bg-emerald-800 hover:bg-emerald-700 rounded-lg transition cursor-pointer flex items-center gap-1"
            title="Slice ONLY this selected word into H1 (remaining text stays as body)"
          >
            <span>+ H1</span>
          </button>

          <button
            onMouseDown={(e) => {
              e.preventDefault();
              handleApplyHeadingToBlock(selectionState.blockId, 'heading-2');
            }}
            className="px-2.5 py-1 text-xs font-semibold bg-emerald-800 hover:bg-emerald-700 rounded-lg transition cursor-pointer flex items-center gap-1"
            title="Slice ONLY this selected word into H2 (remaining text stays as body)"
          >
            <span>+ H2</span>
          </button>

          <button
            onMouseDown={(e) => {
              e.preventDefault();
              handleApplyHeadingToBlock(selectionState.blockId, 'heading-3');
            }}
            className="px-2.5 py-1 text-xs font-semibold bg-emerald-800 hover:bg-emerald-700 rounded-lg transition cursor-pointer flex items-center gap-1"
            title="Slice ONLY this selected word into H3 (remaining text stays as body)"
          >
            <span>+ H3</span>
          </button>

          <button
            onMouseDown={(e) => {
              e.preventDefault();
              setSelectionState(null);
            }}
            className="p-1 text-emerald-300 hover:text-white rounded-md transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Paper Canvas (Centered with mx-auto to guarantee 100% full background coverage) */}
      <div className="w-full max-w-4xl mx-auto bg-white shadow-[0_4px_24px_rgba(21,71,52,0.06)] border border-[#e2e8e4] rounded-2xl p-8 sm:p-14 min-h-[960px] flex flex-col mb-16">
        {/* Document Top Header */}
        <div className="mb-6 pb-6 border-b border-[#e5ebe7]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#154734]">
                Text Annotator Canvas
              </span>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#e8f3ee] text-[#154734]">
                {blocks.filter((b) => b.type !== 'paragraph').length} Headings · {blocks.filter((b) => b.type === 'paragraph').length} Body Paragraphs
              </span>
            </div>

            {/* Top Toolbar Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleAutoDetect}
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 text-[#154734] bg-[#e8f3ee] hover:bg-[#d8ebd1] rounded-xl transition cursor-pointer shadow-2xs"
                title="Automatically detect standard numbered headings like 1. Scope, 2. Accrual"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Auto-Detect</span>
              </button>

              <button
                onClick={() => setIsPasteModalOpen(true)}
                className="flex items-center gap-1 text-xs font-semibold px-3 py-1 text-neutral-700 hover:text-[#154734] bg-white hover:bg-[#f2f7f4] border border-[#d8e2dc] rounded-xl transition cursor-pointer shadow-2xs"
                title="Paste complete article text into document"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
                <span>Paste Full Article</span>
              </button>
            </div>
          </div>

          {/* Document Title input */}
          <input
            type="text"
            value={docTitle}
            placeholder="Document Title (e.g. Paid Time Off Policy)"
            onChange={(e) => setDocTitle(e.target.value)}
            className="w-full text-3xl font-bold text-neutral-900 border-none hover:bg-[#f6f9f7] focus:bg-white focus:outline-none focus:ring-1.5 focus:ring-[#154734] rounded-xl px-2 py-1 tracking-tight"
          />

          <div className="mt-2.5 p-2.5 bg-[#f7faf8] border border-[#e2efe9] rounded-xl text-xs text-neutral-600 flex items-center gap-2">
            <span className="text-[#154734] font-bold">✨ How to annotate:</span>
            <span>
              Highlight any word or phrase (e.g. <strong>Scope</strong>) and click <span className="font-semibold text-[#154734]">+ H1</span>. <strong>Only the selected word becomes the heading</strong>, and the rest stays as body! Click <strong>"Revert to Body"</strong> on any heading to merge it back into the paragraph below!
            </span>
          </div>
        </div>

        {/* Document Blocks: Headings & Body Paragraphs */}
        <div className="space-y-3 flex-1">
          {blocks.length === 0 ? (
            <div className="py-20 text-center border-2 border-dashed border-[#d8e2dc] rounded-2xl">
              <p className="text-neutral-500 text-sm mb-3">No document content yet.</p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setIsPasteModalOpen(true)}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-[#154734] hover:bg-[#0f382c] rounded-xl transition shadow-xs cursor-pointer"
                >
                  Paste Article
                </button>
                <button
                  onClick={() => {
                    const parsed = parseTextToBlocks(SAMPLE_ARTICLE_TEXT, docTitle);
                    setBlocks(parsed.blocks);
                  }}
                  className="px-3.5 py-1.5 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-xl transition cursor-pointer"
                >
                  Insert Sample Policy
                </button>
              </div>
            </div>
          ) : (
            blocks.map((block, index) => {
              const isHeading = block.type !== 'paragraph';
              const isActive = activeNodeId === block.id || activeBlockId === block.id;
              const hasSelectionInThisBlock =
                selectionState && selectionState.blockId === block.id;

              return (
                <div
                  key={block.id}
                  id={`block-${block.id}`}
                  onClick={() => {
                    setActiveBlockId(block.id);
                    if (isHeading) onSelectNode(block.id);
                  }}
                  className={`group relative pl-3 pr-2 py-1.5 rounded-xl transition-all duration-150 ${
                    isHeading
                      ? isActive
                        ? 'bg-[#e8f3ee]/90 border-l-4 border-[#154734] shadow-2xs'
                        : 'bg-[#f7faf8] border-l-4 border-[#2d6a4f] hover:bg-[#f0f5f2]'
                      : isActive
                      ? 'bg-neutral-50/80 border-l-2 border-[#154734]'
                      : 'border-l-2 border-transparent hover:border-neutral-200'
                  }`}
                >
                  {isHeading ? (
                    /* Heading Block */
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-[10px] font-mono uppercase font-bold px-1.5 py-0.5 rounded bg-[#154734] text-white shrink-0">
                            {block.type === 'heading-1'
                              ? 'H1'
                              : block.type === 'heading-2'
                              ? 'H2'
                              : 'H3'}
                          </span>

                          <input
                            type="text"
                            value={block.label || ''}
                            placeholder="Label"
                            title="Heading label (e.g. 1, 2.1)"
                            onChange={(e) => handleUpdateBlockLabel(block.id, e.target.value)}
                            className="font-mono text-xs w-16 px-1.5 py-0.5 bg-white border border-[#d8e2dc] rounded-lg text-[#154734] font-bold focus:outline-none focus:border-[#154734] shrink-0"
                          />

                          <input
                            type="text"
                            value={block.text}
                            placeholder="Section Title..."
                            onChange={(e) => handleUpdateBlockText(block.id, e.target.value)}
                            className={`flex-1 bg-transparent border-b border-transparent hover:border-[#d8e2dc] focus:border-[#154734] focus:outline-none pb-0.5 text-neutral-900 ${
                              block.type === 'heading-1'
                                ? 'text-xl font-bold tracking-tight'
                                : block.type === 'heading-2'
                                ? 'text-lg font-semibold'
                                : 'text-base font-medium'
                            }`}
                          />
                        </div>

                        {/* Format Switching Bar on Hover */}
                        <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-1 bg-white border border-[#e2efe9] shadow-2xs p-1 rounded-xl shrink-0">
                          <button
                            onClick={() => handleApplyHeadingToBlock(block.id, 'heading-1')}
                            className={`px-1.5 py-0.5 text-[11px] font-semibold rounded-md transition ${
                              block.type === 'heading-1'
                                ? 'bg-[#154734] text-white'
                                : 'text-neutral-600 hover:bg-[#e8f3ee]'
                            }`}
                            title="Set as Heading 1"
                          >
                            H1
                          </button>
                          <button
                            onClick={() => handleApplyHeadingToBlock(block.id, 'heading-2')}
                            className={`px-1.5 py-0.5 text-[11px] font-semibold rounded-md transition ${
                              block.type === 'heading-2'
                                ? 'bg-[#154734] text-white'
                                : 'text-neutral-600 hover:bg-[#e8f3ee]'
                            }`}
                            title="Set as Heading 2"
                          >
                            H2
                          </button>
                          <button
                            onClick={() => handleApplyHeadingToBlock(block.id, 'heading-3')}
                            className={`px-1.5 py-0.5 text-[11px] font-semibold rounded-md transition ${
                              block.type === 'heading-3'
                                ? 'bg-[#154734] text-white'
                                : 'text-neutral-600 hover:bg-[#e8f3ee]'
                            }`}
                            title="Set as Heading 3"
                          >
                            H3
                          </button>

                          {/* REVERT TO BODY & MERGE BUTTON */}
                          <button
                            onClick={() => handleRevertHeadingToBody(block.id)}
                            className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-md transition"
                            title="Revert heading to body text and merge automatically into paragraph below"
                          >
                            <Undo2 className="w-3 h-3 text-amber-700" />
                            <span>Revert to Body</span>
                          </button>

                          <div className="w-[1px] h-3.5 bg-neutral-200 mx-0.5" />
                          <button
                            onClick={() => handleAddBlockBelow(index)}
                            className="p-1 text-neutral-500 hover:text-[#154734] hover:bg-[#e8f3ee] rounded-md transition"
                            title="Add body paragraph below"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteBlock(block.id)}
                            className="p-1 text-rose-500 hover:bg-rose-50 rounded-md transition"
                            title="Delete heading block"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Normal Body Paragraph Block */
                    <div className="relative">
                      <div className="flex items-start justify-between gap-2">
                        {/* Fully editable Paragraph Textarea */}
                        <textarea
                          ref={(el) => {
                            textareaRefs.current[block.id] = el;
                            autoResizeTextarea(el);
                          }}
                          value={block.text}
                          placeholder="Type or edit body text..."
                          onChange={(e) => {
                            handleUpdateBlockText(block.id, e.target.value);
                            autoResizeTextarea(e.currentTarget);
                          }}
                          onSelect={(e) => updateSelectionFromTextarea(block.id, e.currentTarget)}
                          onMouseUp={(e) => updateSelectionFromTextarea(block.id, e.currentTarget)}
                          onKeyUp={(e) => updateSelectionFromTextarea(block.id, e.currentTarget)}
                          rows={Math.max(1, block.text.split('\n').length)}
                          className="w-full text-sm text-neutral-700 bg-transparent border border-transparent hover:border-neutral-200 focus:border-[#154734] focus:bg-white rounded-lg p-2 focus:outline-none resize-y leading-relaxed font-sans transition"
                        />

                        {/* Format Switching Bar on Hover */}
                        <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-1 bg-white border border-[#e2efe9] shadow-2xs p-1 rounded-xl shrink-0 mt-1">
                          <button
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleApplyHeadingToBlock(block.id, 'heading-1');
                            }}
                            className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition flex items-center gap-1 ${
                              hasSelectionInThisBlock
                                ? 'bg-[#154734] text-white shadow-xs'
                                : 'text-[#154734] bg-[#e8f3ee] hover:bg-[#d8ebd1]'
                            }`}
                            title={
                              hasSelectionInThisBlock
                                ? `Slice "${selectionState.selectedText}" into H1`
                                : 'Convert line to H1'
                            }
                          >
                            <span>+ H1</span>
                            {hasSelectionInThisBlock && (
                              <span className="text-[10px] font-mono opacity-80 truncate max-w-[60px]">
                                "{selectionState.selectedText}"
                              </span>
                            )}
                          </button>

                          <button
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleApplyHeadingToBlock(block.id, 'heading-2');
                            }}
                            className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition flex items-center gap-1 ${
                              hasSelectionInThisBlock
                                ? 'bg-[#154734] text-white shadow-xs'
                                : 'text-[#154734] bg-[#e8f3ee] hover:bg-[#d8ebd1]'
                            }`}
                            title={
                              hasSelectionInThisBlock
                                ? `Slice "${selectionState.selectedText}" into H2`
                                : 'Convert line to H2'
                            }
                          >
                            <span>+ H2</span>
                          </button>

                          <button
                            onClick={() => handleAddBlockBelow(index)}
                            className="p-1 text-neutral-500 hover:text-[#154734] hover:bg-[#e8f3ee] rounded-md transition"
                            title="Add paragraph below"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteBlock(block.id)}
                            className="p-1 text-rose-500 hover:bg-rose-50 rounded-md transition"
                            title="Delete paragraph"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Add Paragraph */}
        <div className="mt-8 pt-4 border-t border-[#e5ebe7] flex items-center justify-between text-xs text-neutral-400">
          <button
            onClick={() => handleAddBlockBelow(blocks.length - 1)}
            className="inline-flex items-center gap-1 text-[#154734] hover:text-[#0f382c] font-semibold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Paragraph Block</span>
          </button>
          <span>Text following a heading automatically belongs to its body in the tree</span>
        </div>
      </div>

      {/* Paste Full Article Modal */}
      {isPasteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 select-none">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-[#e2e8e4] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-[#e5ebe7] flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#e8f3ee] text-[#154734] flex items-center justify-center shrink-0">
                  <ClipboardPaste className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 text-sm tracking-tight">
                    Paste Full Article
                  </h3>
                  <p className="text-[11px] text-neutral-400">
                    Paste raw text to populate the document; all paragraphs will remain fully editable
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPasteModalOpen(false)}
                className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-[#f2f7f4] rounded-xl transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 flex-1 flex flex-col bg-[#fafbfa]">
              <div className="mb-2 flex items-center justify-between text-xs text-neutral-600">
                <span>Paste your raw document:</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      try {
                        const txt = await navigator.clipboard.readText();
                        if (txt) setPastedArticleText(txt);
                      } catch (err) {}
                    }}
                    className="text-[#154734] font-semibold hover:underline"
                  >
                    Paste from Clipboard
                  </button>
                  <span>·</span>
                  <button
                    onClick={() => setPastedArticleText(SAMPLE_ARTICLE_TEXT)}
                    className="text-[#154734] font-semibold hover:underline"
                  >
                    Insert Sample Policy
                  </button>
                </div>
              </div>

              <textarea
                value={pastedArticleText}
                onChange={(e) => setPastedArticleText(e.target.value)}
                placeholder="Paste article paragraphs here..."
                rows={16}
                className="w-full flex-1 min-h-[300px] p-3.5 bg-white border border-[#d8e2dc] focus:border-[#154734] focus:ring-1.5 focus:ring-[#154734] rounded-xl font-mono text-xs text-neutral-800 leading-relaxed focus:outline-none resize-none select-text shadow-2xs"
                autoFocus
              />
            </div>

            <div className="px-5 py-3 border-t border-[#e5ebe7] flex items-center justify-end gap-2 bg-white shrink-0">
              <button
                onClick={() => setIsPasteModalOpen(false)}
                className="px-3.5 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-[#f2f7f4] rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleLoadPastedArticle}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-[#154734] hover:bg-[#0f382c] rounded-xl transition cursor-pointer shadow-xs"
              >
                Populate Document
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
