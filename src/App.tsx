import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DocumentData, OutlineNode, DropPosition } from './types';
import { PTO_POLICY_DATA, SAMPLE_ARTICLE_TEXT } from './sampleData';
import {
  updateNodeInTree,
  addNodeToTree,
  deleteNodeFromTree,
  moveNodeInTree,
  indentNode,
  outdentNode,
  normalizeUploadedJson,
  parseRawTextToTree,
} from './utils/treeUtils';
import { Navbar } from './components/Navbar';
import { OutlineSidebar } from './components/OutlineSidebar';
import { DocumentEditor } from './components/DocumentEditor';
import { TextAnnotator } from './components/TextAnnotator';
import { JsonPreviewModal } from './components/JsonPreviewModal';
import { PasteJsonModal } from './components/PasteJsonModal';

const STORAGE_KEY_TREE = 'outline_annotator_data_tree_v2';
const STORAGE_KEY_ANNOTATOR_DATA = 'outline_annotator_data_annotator_v2';
const STORAGE_KEY_ARTICLE = 'outline_annotator_article_text_v2';

export default function App() {
  const [activeTab, setActiveTab] = useState<'tree' | 'annotator'>('tree');

  // Tree Editor Tab Data
  const [data, setData] = useState<DocumentData>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TREE);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.root?.children) {
          return normalizeUploadedJson(parsed);
        }
      }
    } catch (e) {}
    return PTO_POLICY_DATA;
  });

  // Text Annotator Tab Data Flow
  const [annotatorArticle, setAnnotatorArticle] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ARTICLE);
      if (saved) return saved;
    } catch (e) {}
    return SAMPLE_ARTICLE_TEXT;
  });

  const [annotatorData, setAnnotatorData] = useState<DocumentData>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ANNOTATOR_DATA);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.root) {
          return normalizeUploadedJson(parsed);
        }
      }
    } catch (e) {}
    // Initial parse of sample article
    return parseRawTextToTree(SAMPLE_ARTICLE_TEXT, 'Paid Time Off Policy');
  });

  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState('All changes saved');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);

  // Active dataset depending on activeTab
  const currentData = activeTab === 'tree' ? data : annotatorData;
  const setCurrentData = activeTab === 'tree' ? setData : setAnnotatorData;

  // Auto-save to localStorage
  const saveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    setSaveStatus('Saving...');
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY_TREE, JSON.stringify(data));
        localStorage.setItem(STORAGE_KEY_ANNOTATOR_DATA, JSON.stringify(annotatorData));
        localStorage.setItem(STORAGE_KEY_ARTICLE, annotatorArticle);
        setSaveStatus('All changes saved');
      } catch (err) {
        setSaveStatus('Save error');
      }
    }, 300);

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [data, annotatorData, annotatorArticle]);

  // Upload JSON file handler
  const handleUploadJson = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const parsed = JSON.parse(content);
          const normalized = normalizeUploadedJson(parsed);
          setCurrentData(normalized);
          setActiveNodeId(null);
          setSaveStatus(`Loaded ${file.name}`);
        } catch (err: any) {
          alert(`Failed to load JSON: ${err.message || 'Invalid format'}`);
        }
      };
      reader.readAsText(file);
    },
    [setCurrentData]
  );

  // Save / Download JSON file
  const handleDownloadJson = useCallback(() => {
    const cleanTitle = (currentData.root.title || 'outline_tree')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_');
    const filename = `${cleanTitle || 'outline'}.json`;

    const jsonStr = JSON.stringify(currentData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setSaveStatus('JSON downloaded');
  }, [currentData]);

  // Reset to default PTO policy
  const handleResetSeed = useCallback(() => {
    if (window.confirm('Reset outline to default seed?')) {
      if (activeTab === 'tree') {
        setData(PTO_POLICY_DATA);
      } else {
        setAnnotatorArticle(SAMPLE_ARTICLE_TEXT);
        setAnnotatorData(parseRawTextToTree(SAMPLE_ARTICLE_TEXT, 'Paid Time Off Policy'));
      }
      setActiveNodeId(null);
      setSaveStatus('Reset to seed');
    }
  }, [activeTab]);

  // Drag & drop file onto the browser window
  useEffect(() => {
    const handleWindowDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
      }
    };

    const handleWindowDrop = (e: DragEvent) => {
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.name.endsWith('.json') || file.type === 'application/json') {
          e.preventDefault();
          handleUploadJson(file);
        }
      }
    };

    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('drop', handleWindowDrop);
    return () => {
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, [handleUploadJson]);

  // Keyboard shortcut Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleDownloadJson();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDownloadJson]);

  // Tree mutations for current tab
  const handleUpdateTitle = useCallback(
    (title: string) => {
      setCurrentData((prev) => ({
        ...prev,
        root: { ...prev.root, title },
      }));
    },
    [setCurrentData]
  );

  const handleUpdateRoot = useCallback(
    (updates: { title?: string; text?: string }) => {
      setCurrentData((prev) => ({
        ...prev,
        root: { ...prev.root, ...updates },
      }));
    },
    [setCurrentData]
  );

  const handleUpdateNode = useCallback(
    (nodeId: string, updates: Partial<OutlineNode>) => {
      setCurrentData((prev) => ({
        ...prev,
        root: updateNodeInTree(prev.root, nodeId, updates),
      }));
    },
    [setCurrentData]
  );

  const handleAddChild = useCallback(
    (parentId: string) => {
      setCurrentData((prev) => {
        const res = addNodeToTree(prev.root, parentId, 'asChild');
        setActiveNodeId(res.newNodeId);
        return { ...prev, root: res.updatedRoot };
      });
    },
    [setCurrentData]
  );

  const handleAddSibling = useCallback(
    (siblingId: string) => {
      setCurrentData((prev) => {
        const res = addNodeToTree(prev.root, siblingId, 'asSiblingAfter');
        setActiveNodeId(res.newNodeId);
        return { ...prev, root: res.updatedRoot };
      });
    },
    [setCurrentData]
  );

  const handleMoveNode = useCallback(
    (dragId: string, targetId: string, position: DropPosition) => {
      setCurrentData((prev) => ({
        ...prev,
        root: moveNodeInTree(prev.root, dragId, targetId, position),
      }));
    },
    [setCurrentData]
  );

  const handleIndentNode = useCallback(
    (nodeId: string) => {
      setCurrentData((prev) => ({
        ...prev,
        root: indentNode(prev.root, nodeId),
      }));
    },
    [setCurrentData]
  );

  const handleOutdentNode = useCallback(
    (nodeId: string) => {
      setCurrentData((prev) => ({
        ...prev,
        root: outdentNode(prev.root, nodeId),
      }));
    },
    [setCurrentData]
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setCurrentData((prev) => ({
        ...prev,
        root: deleteNodeFromTree(prev.root, nodeId),
      }));
    },
    [setCurrentData]
  );

  return (
    <div className="flex flex-col h-full w-full bg-[#f2f5f3] overflow-hidden font-sans text-neutral-800 antialiased">
      {/* Top Bar with Mode Switcher */}
      <Navbar
        data={currentData}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onUpdateTitle={handleUpdateTitle}
        onUploadJson={handleUploadJson}
        onDownloadJson={handleDownloadJson}
        onOpenPreview={() => setIsPreviewOpen(true)}
        onOpenPaste={() => setIsPasteModalOpen(true)}
        onResetSeed={handleResetSeed}
        saveStatus={saveStatus}
      />

      {/* Main Workspace: Left Outline + Center Canvas (Identical Layout & Structure) */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Outline Hierarchy Sidebar */}
        <OutlineSidebar
          root={currentData.root}
          activeNodeId={activeNodeId}
          onSelectNode={(id) => setActiveNodeId(id)}
          onMoveNode={handleMoveNode}
          onAddChild={handleAddChild}
          onIndentNode={handleIndentNode}
          onOutdentNode={handleOutdentNode}
          onDeleteNode={handleDeleteNode}
        />

        {/* Center: Canvas View depending on activeTab */}
        {activeTab === 'tree' ? (
          <DocumentEditor
            root={data.root}
            activeNodeId={activeNodeId}
            onUpdateRoot={handleUpdateRoot}
            onUpdateNode={handleUpdateNode}
            onAddChild={handleAddChild}
            onAddSibling={handleAddSibling}
            onIndentNode={handleIndentNode}
            onOutdentNode={handleOutdentNode}
            onDeleteNode={handleDeleteNode}
          />
        ) : (
          <TextAnnotator
            data={annotatorData}
            activeNodeId={activeNodeId}
            onUpdateData={setAnnotatorData}
            onSelectNode={(id) => setActiveNodeId(id)}
          />
        )}
      </div>

      {/* JSON Preview Modal */}
      <JsonPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        data={currentData}
      />

      {/* Paste JSON Modal */}
      <PasteJsonModal
        isOpen={isPasteModalOpen}
        onClose={() => setIsPasteModalOpen(false)}
        onLoadJson={(normalized) => {
          setCurrentData(normalized);
          setActiveNodeId(null);
          setSaveStatus('Loaded pasted JSON');
        }}
      />
    </div>
  );
}
