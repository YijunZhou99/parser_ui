import { OutlineNode, DocumentData } from '../types';
import { generateNodeId, recomputeDepths } from './treeUtils';

export type BlockType = 'paragraph' | 'heading-1' | 'heading-2' | 'heading-3';

export interface DocBlock {
  id: string;
  type: BlockType;
  label: string;
  text: string;
}

/**
 * Parses raw text into an initial set of blocks,
 * auto-detecting common heading formats if present.
 * Ensures zero dropped text and robustly handles any line break formats!
 */
export function parseTextToBlocks(
  rawText: string,
  currentTitle = 'Untitled Document'
): { docTitle: string; blocks: DocBlock[] } {
  if (!rawText.trim()) {
    return { docTitle: currentTitle, blocks: [] };
  }

  // Split into segments by double newlines or single newlines
  const rawDoubleSegments = rawText
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const segments =
    rawDoubleSegments.length <= 1 && rawText.includes('\n')
      ? rawText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
      : rawDoubleSegments;

  let docTitle = currentTitle;
  const blocks: DocBlock[] = [];

  const mdRegex = /^(#{1,3})\s+(.+)$/;
  const numRegex = /^(\(?\d+(?:\.\d+)*(?:\.\([a-zA-Z0-9]+\))?\)|\([a-zA-Z0-9]+\))\s*(?:[-:.]\s*|\s+)(.+)$/;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    // Check if the very first segment is a short document title (no heading prefix, no ending period)
    if (
      i === 0 &&
      (!docTitle || docTitle === 'Untitled Document') &&
      seg.length < 80 &&
      !seg.endsWith('.') &&
      !mdRegex.test(seg) &&
      !numRegex.test(seg)
    ) {
      docTitle = seg;
      continue;
    }

    const mdMatch = seg.match(mdRegex);
    const numMatch = seg.match(numRegex);

    if (mdMatch || numMatch) {
      let type: BlockType = 'heading-1';
      let label = '';
      let text = '';

      if (mdMatch) {
        const hashes = mdMatch[1].length;
        type = hashes === 1 ? 'heading-1' : hashes === 2 ? 'heading-2' : 'heading-3';
        const rest = mdMatch[2].trim();
        const innerNum = rest.match(numRegex);
        if (innerNum) {
          label = innerNum[1].replace(/[.)]$/, '');
          text = innerNum[2].trim();
        } else {
          text = rest;
        }
      } else if (numMatch) {
        label = numMatch[1].replace(/[.)]$/, '');
        text = numMatch[2].trim();
        const dots = (label.match(/\./g) || []).length;
        type =
          dots === 0 && !label.includes('(')
            ? 'heading-1'
            : dots === 1
            ? 'heading-2'
            : 'heading-3';
      }

      blocks.push({
        id: generateNodeId(label || 'h'),
        type,
        label,
        text,
      });
    } else {
      blocks.push({
        id: generateNodeId('p'),
        type: 'paragraph',
        label: '',
        text: seg,
      });
    }
  }

  // Failsafe: if blocks ended up empty for any reason, create a block with the raw text
  if (blocks.length === 0 && rawText.trim()) {
    blocks.push({
      id: generateNodeId('p'),
      type: 'paragraph',
      label: '',
      text: rawText.trim(),
    });
  }

  return { docTitle, blocks };
}

/**
 * Builds the hierarchical Golden Data DocumentData tree from blocks.
 * Core rule: Text between headings is automatically the body of the preceding heading!
 * Text before the first heading is the root's text.
 */
export function buildTreeFromBlocks(docTitle: string, blocks: DocBlock[]): DocumentData {
  const root: OutlineNode = {
    id: 'root',
    label: '',
    title: docTitle || 'Untitled Document',
    text: '',
    depth: 0,
    children: [],
  };

  const stack: { node: OutlineNode; depth: number }[] = [{ node: root, depth: 0 }];
  const preambleParagraphs: string[] = [];
  let headingEncountered = false;

  for (const block of blocks) {
    if (block.type === 'paragraph') {
      if (!headingEncountered) {
        preambleParagraphs.push(block.text);
      } else {
        // Belongs to the current innermost heading in the stack
        const currentTop = stack[stack.length - 1].node;
        currentTop.text = currentTop.text
          ? `${currentTop.text}\n\n${block.text}`
          : block.text;
      }
    } else {
      // It's a heading block!
      headingEncountered = true;
      let depth = 1;
      if (block.type === 'heading-2') depth = 2;
      if (block.type === 'heading-3') depth = 3;

      // Extract label if not set
      let label = block.label || '';
      let title = block.text.trim();

      const numMatch = title.match(
        /^(\(?\d+(?:\.\d+)*(?:\.\([a-zA-Z0-9]+\))?\)|\([a-zA-Z0-9]+\))\s*(?:[-:.]\s*|\s+)(.+)$/
      );
      if (numMatch && !label) {
        label = numMatch[1].replace(/[.)]$/, '');
        title = numMatch[2].trim();
      }

      const newNode: OutlineNode = {
        id: block.id || generateNodeId(label || 'h'),
        label,
        title: title || 'Untitled Section',
        text: '',
        depth,
        children: [],
      };

      // Pop stack until parent depth is strictly smaller than this depth
      while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
        stack.pop();
      }

      const parentEntry = stack[stack.length - 1];
      parentEntry.node.children.push(newNode);
      stack.push({ node: newNode, depth });
    }
  }

  root.text = preambleParagraphs.join('\n\n').trim() || 'seed';

  return { root: recomputeDepths(root, 0) };
}

/**
 * Converts an existing DocumentData tree into editable DocBlocks
 */
export function convertTreeToBlocks(data: DocumentData): { docTitle: string; blocks: DocBlock[] } {
  const blocks: DocBlock[] = [];
  const docTitle = data.root.title || 'Untitled Document';

  if (data.root.text && data.root.text !== 'seed') {
    blocks.push({
      id: generateNodeId('p'),
      type: 'paragraph',
      label: '',
      text: data.root.text,
    });
  }

  function walk(node: OutlineNode) {
    for (const child of node.children) {
      const type: BlockType =
        child.depth === 1 ? 'heading-1' : child.depth === 2 ? 'heading-2' : 'heading-3';

      blocks.push({
        id: child.id,
        type,
        label: child.label || '',
        text: child.title || '',
      });

      if (child.text && child.text.trim()) {
        const paragraphs = child.text.split(/\n\s*\n/);
        for (const p of paragraphs) {
          if (p.trim()) {
            blocks.push({
              id: generateNodeId('p'),
              type: 'paragraph',
              label: '',
              text: p.trim(),
            });
          }
        }
      }

      walk(child);
    }
  }

  walk(data.root);
  return { docTitle, blocks };
}
