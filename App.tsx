
import React, { useState, useRef } from 'react';
import { Icons } from './components/Icons';
import { SliderControl } from './components/SliderControl';
import { CanvasWorkspace } from './components/CanvasWorkspace';
import { AppSettings, DrawingPath, EditorHistoryState, ToolType, CanvasHandle } from './types';
import { MAX_SMART_MASKS, DEFAULT_PEN_SIZE } from './constants';
import { mockPanopticSegmentation } from './services/mockSegmentationService';

const INITIAL_SETTINGS: AppSettings = {
  penSize: DEFAULT_PEN_SIZE,
  invertMask: false,
  borderSize: 0,
  feather: 0
};

const INITIAL_HISTORY: EditorHistoryState = {
    smartSegments: [],
    manualPaths: []
};

const TRANSLATIONS = {
  en: {
    penSize: "Pen Size",
    invertMask: "Invert Mask",
    borderSize: "Border Size",
    feather: "Feather",
    importImage: "Import Image",
    replaceImage: "Replace Image",
    smartSelect: "Smart Select",
    hardAdd: "Hard Add",
    hardSubtract: "Hard Subtract",
    undo: "Undo",
    redo: "Redo",
    resetAll: "Reset All",
    cancel: "Cancel",
    confirmMerge: "Confirm & Merge",
    exportResult: "Export Result",
    analyzing: "Analyzing image objects...",
    noObjects: "No objects found.",
    importToStart: "Import image to start segmentation",
    discardConfirm: "Discard all changes?",
    resetConfirm: "Reset all edits?",
    confirmSegmentation: "Confirm segmentation?\nThis will merge selected smart regions and manual edits.",
    changesApplied: "Changes applied."
  },
  zh: {
    penSize: "笔触大小",
    invertMask: "反转遮罩",
    borderSize: "边缘扩展",
    feather: "边缘羽化",
    importImage: "导入图片",
    replaceImage: "替换图片",
    smartSelect: "智能选择",
    hardAdd: "手动添加",
    hardSubtract: "手动擦除",
    undo: "撤销",
    redo: "重做",
    resetAll: "重置所有",
    cancel: "取消",
    confirmMerge: "确认并合并",
    exportResult: "导出结果",
    analyzing: "正在分析图像对象...",
    noObjects: "未发现对象。",
    importToStart: "导入图片以开始分割",
    discardConfirm: "放弃所有更改？",
    resetConfirm: "重置所有编辑？",
    confirmSegmentation: "确认分割？\n这将合并选定的智能区域和手动编辑。",
    changesApplied: "更改已应用。"
  }
};

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(INITIAL_SETTINGS);
  const [tool, setTool] = useState<ToolType>('smart');
  
  const [history, setHistory] = useState<EditorHistoryState[]>([INITIAL_HISTORY]);
  const [historyIndex, setHistoryIndex] = useState(0);
  
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [canvasSize, setCanvasSize] = useState<{width: number, height: number}>({width: 800, height: 500});
  const [isLoading, setIsLoading] = useState(false);

  // New State for UI features
  const [lang, setLang] = useState<'en' | 'zh'>('zh');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const canvasRef = useRef<CanvasHandle>(null);
  const currentState = history[historyIndex];
  const t = TRANSLATIONS[lang];

  // --- History Logic ---

  const pushState = (newState: EditorHistoryState) => {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newState);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = () => {
      if (historyIndex > 0) setHistoryIndex(historyIndex - 1);
  };

  const handleRedo = () => {
      if (historyIndex < history.length - 1) setHistoryIndex(historyIndex + 1);
  };

  const handleReset = () => {
      setHistory([INITIAL_HISTORY]);
      setHistoryIndex(0);
      setImageSrc(null);
  };

  // --- Actions ---

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
              const src = evt.target?.result as string;
              
              const img = new Image();
              img.crossOrigin = "anonymous";
              img.src = src;
              img.onload = () => {
                  const maxW = 800;
                  const maxH = 600;
                  let w = img.naturalWidth;
                  let h = img.naturalHeight;
                  const aspect = w / h;

                  if (w > maxW) {
                      w = maxW;
                      h = w / aspect;
                  }
                  if (h > maxH) {
                      h = maxH;
                      w = h * aspect;
                  }
                  
                  const finalW = Math.floor(w);
                  const finalH = Math.floor(h);

                  setCanvasSize({ width: finalW, height: finalH });
                  setImageSrc(src);

                  // Extract ImageData for the segmentation service
                  const tempCanvas = document.createElement('canvas');
                  tempCanvas.width = finalW;
                  tempCanvas.height = finalH;
                  const ctx = tempCanvas.getContext('2d');
                  if (ctx) {
                      ctx.drawImage(img, 0, 0, finalW, finalH);
                      const imageData = ctx.getImageData(0, 0, finalW, finalH);
                      startSegmentation(imageData);
                  }
              };
          };
          reader.readAsDataURL(file);
      }
  };

  const startSegmentation = async (imageData: ImageData) => {
      setHistory([INITIAL_HISTORY]);
      setHistoryIndex(0);
      setIsLoading(true);

      try {
          // Pass real pixel data to the service
          const segments = await mockPanopticSegmentation(imageData);
          
          const newState = {
              smartSegments: segments,
              manualPaths: []
          };
          setHistory([newState]);
          setHistoryIndex(0);
      } catch (err) {
          console.error("Segmentation failed", err);
      } finally {
          setIsLoading(false);
      }
  };

  const handleCommitManualPath = (path: DrawingPath) => {
      const newState = {
          ...currentState,
          manualPaths: [...currentState.manualPaths, path]
      };
      pushState(newState);
  };

  const handleToggleSmartSegment = (segmentId: string) => {
      const updatedSegments = currentState.smartSegments.map(seg => {
          if (seg.id === segmentId) {
              return { ...seg, selected: !seg.selected };
          }
          return seg;
      });

      const newState = {
          ...currentState,
          smartSegments: updatedSegments
      };
      pushState(newState);
  };
  
  const updateSetting = (key: keyof AppSettings, value: any) => {
      setSettings(prev => ({...prev, [key]: value}));
  };

  const handleConfirm = () => {
      if (!imageSrc) return;
      if (window.confirm(t.confirmSegmentation)) {
           alert(t.changesApplied);
      }
  };

  const handleExport = async () => {
      if (canvasRef.current) {
          const blob = await canvasRef.current.exportImage();
          if (blob) {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'segmentation-result.png';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
          }
      }
  };

  const activeSmartMasks = currentState.smartSegments.filter(s => s.selected).length;

  return (
    <div className="flex h-screen w-full bg-[#f3f4f6] text-gray-800 select-none overflow-hidden font-sans relative">
      
      {/* Floating Toggle Button (Visible when Sidebar is closed) */}
      {!isSidebarOpen && (
          <button 
             onClick={() => setIsSidebarOpen(true)}
             className="absolute top-4 left-4 z-50 p-2 bg-white border border-gray-300 rounded shadow-md hover:bg-gray-100 transition-colors"
             title="Open Sidebar"
          >
              <Icons.SidebarOpen className="w-5 h-5 text-gray-600" />
          </button>
      )}

      {/* Left Sidebar */}
      <div className={`${isSidebarOpen ? 'w-80 translate-x-0' : 'w-0 -translate-x-full'} flex-shrink-0 bg-[#f3f4f6] flex flex-col border-r border-gray-200 transition-all duration-300 ease-in-out relative`}>
        {/* Inner Container to prevent layout shift during transition */}
        <div className="w-80 h-full flex flex-col p-6 overflow-y-auto">
            
            {/* Header: Language & Close */}
            <div className="mb-6 flex justify-between items-center">
                <button 
                  onClick={() => setLang(l => l === 'en' ? 'zh' : 'en')}
                  className="flex items-center gap-1.5 px-2 py-1 bg-white border border-gray-300 rounded text-xs font-medium text-gray-600 hover:text-blue-600 hover:border-blue-400 transition-colors"
                >
                    <Icons.Language className="w-3.5 h-3.5" />
                    {lang === 'en' ? 'English' : '中文'}
                </button>

                <button 
                    onClick={() => setIsSidebarOpen(false)}
                    className="p-1.5 hover:bg-gray-200 rounded text-gray-500 transition-colors"
                    title="Close Sidebar"
                >
                    <Icons.SidebarClose className="w-5 h-5" />
                </button>
            </div>

            <div className="space-y-6">
                <SliderControl 
                    label={t.penSize}
                    value={settings.penSize} 
                    min={1} 
                    max={100} 
                    onChange={(v) => updateSetting('penSize', v)} 
                />

                <div className="flex items-center gap-2 pl-1">
                    <input 
                        type="checkbox" 
                        id="invert"
                        checked={settings.invertMask}
                        onChange={(e) => updateSetting('invertMask', e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                    />
                    <label htmlFor="invert" className="text-sm font-medium text-gray-700 cursor-pointer">{t.invertMask}</label>
                </div>

                <div className="border-t border-gray-200 pt-6">
                    <SliderControl 
                        label={t.borderSize}
                        value={settings.borderSize} 
                        min={0} 
                        max={20} 
                        onChange={(v) => updateSetting('borderSize', v)} 
                    />
                    
                    <SliderControl 
                        label={t.feather}
                        value={settings.feather} 
                        min={0} 
                        max={20} 
                        onChange={(v) => updateSetting('feather', v)} 
                    />
                </div>
            </div>

            <div className="mt-auto pt-8">
            {!imageSrc ? (
                <label className="flex flex-col items-center justify-center w-full p-8 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-white hover:border-blue-400 transition-all group">
                    <Icons.Upload className="w-8 h-8 text-gray-400 group-hover:text-blue-500 mb-2 transition-colors" />
                    <span className="text-xs font-semibold text-gray-500 group-hover:text-blue-600 uppercase tracking-wide">{t.importImage}</span>
                    <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                </label>
            ) : (
                    <button 
                    onClick={() => document.getElementById('file-upload')?.click()}
                    className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-white border border-gray-300 rounded hover:bg-gray-50 text-xs font-medium text-gray-600 transition-colors uppercase tracking-wide"
                    >
                        <Icons.Upload className="w-4 h-4" /> {t.replaceImage}
                        <input id="file-upload" type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                    </button>
            )}
            </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative bg-[#e5e7eb] overflow-hidden">
          
          {/* Floating Tool Palette */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md shadow-lg rounded-xl p-1.5 flex gap-1 z-20 border border-gray-200/50">
              <ToolButton 
                  active={tool === 'smart'} 
                  onClick={() => setTool('smart')} 
                  icon={<Icons.Smart className="w-5 h-5" />} 
                  label={t.smartSelect}
                  badge={activeSmartMasks > 0 ? activeSmartMasks : undefined}
              />
              <div className="w-px bg-gray-300 mx-1 my-1"></div>
              <ToolButton 
                  active={tool === 'add'} 
                  onClick={() => setTool('add')} 
                  icon={<Icons.Add className="w-5 h-5" />} 
                  label={t.hardAdd}
              />
              <ToolButton 
                  active={tool === 'subtract'} 
                  onClick={() => setTool('subtract')} 
                  icon={<Icons.Subtract className="w-5 h-5" />} 
                  label={t.hardSubtract}
              />
          </div>

          {/* Canvas Viewport */}
          <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
              <div className="relative shadow-2xl ring-1 ring-black/5 bg-white transition-all duration-300 ease-in-out" style={{ width: canvasSize.width, height: canvasSize.height }}>
                 <CanvasWorkspace 
                    ref={canvasRef}
                    imageSrc={imageSrc}
                    width={canvasSize.width}
                    height={canvasSize.height}
                    tool={tool}
                    settings={settings}
                    smartSegments={currentState.smartSegments}
                    manualPaths={currentState.manualPaths}
                    onCommitPath={handleCommitManualPath}
                    onToggleSmartSegment={handleToggleSmartSegment}
                    isLoading={isLoading}
                    texts={{
                        analyzing: t.analyzing,
                        noObjects: t.noObjects,
                        importToStart: t.importToStart
                    }}
                 />
              </div>
          </div>

          {/* Bottom Action Bar */}
          <div className="h-16 bg-[#f3f4f6] border-t border-gray-200 px-8 flex items-center justify-between shrink-0">
              {/* History Controls */}
              <div className="flex gap-4">
                  <IconButton 
                      onClick={handleUndo} 
                      disabled={historyIndex === 0} 
                      icon={<Icons.Undo className="w-5 h-5" />} 
                      label={t.undo}
                  />
                  <IconButton 
                      onClick={handleRedo} 
                      disabled={historyIndex === history.length - 1} 
                      icon={<Icons.Redo className="w-5 h-5" />} 
                      label={t.redo}
                  />
                  <div className="w-px bg-gray-300 h-6 my-auto mx-2"></div>
                  <IconButton 
                      onClick={() => {
                        if (confirm(t.resetConfirm)) handleReset();
                      }} 
                      icon={<Icons.Reset className="w-5 h-5" />} 
                      label={t.resetAll}
                  />
              </div>

              {/* Confirm/Cancel */}
              <div className="flex gap-3">
                  {imageSrc && (
                      <button 
                        className="flex items-center gap-2 px-4 h-10 bg-white border border-gray-300 rounded shadow-sm hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors"
                        onClick={handleExport}
                      >
                          <Icons.Download className="w-4 h-4" />
                          <span>{t.exportResult}</span>
                      </button>
                  )}
                  
                  <div className="w-px bg-gray-300 h-6 my-auto mx-2"></div>

                  <button 
                    className="w-10 h-10 flex items-center justify-center bg-white border border-gray-300 rounded shadow-sm hover:bg-red-50 active:bg-red-100 transition-colors group"
                    onClick={() => {
                        if (confirm(t.discardConfirm)) handleReset();
                    }}
                    title={t.cancel}
                  >
                      <Icons.Cancel className="w-5 h-5 text-gray-400 group-hover:text-red-600" />
                  </button>
                  <button 
                    className="w-10 h-10 flex items-center justify-center bg-white border border-gray-300 rounded shadow-sm hover:bg-green-50 active:bg-green-100 transition-colors group"
                    onClick={handleConfirm}
                    title={t.confirmMerge}
                  >
                      <Icons.Confirm className="w-5 h-5 text-gray-400 group-hover:text-green-600" />
                  </button>
              </div>
          </div>
      </div>
    </div>
  );
}

// --- Subcomponents ---

const ToolButton = ({ active, onClick, icon, label, badge }: { active: boolean, onClick: () => void, icon: React.ReactNode, label?: string, badge?: number }) => (
    <button 
        onClick={onClick}
        className={`relative p-2.5 rounded-lg transition-all duration-200 group ${
            active 
            ? 'bg-purple-100 text-purple-700 shadow-inner' 
            : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900'
        }`}
        title={label}
    >
        {icon}
        {badge !== undefined && badge > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-purple-600 text-[9px] font-bold text-white shadow-sm ring-2 ring-white">
                {badge}
            </span>
        )}
        <span className="absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
            {label}
        </span>
    </button>
);

const IconButton = ({ onClick, icon, disabled, label }: { onClick: () => void, icon: React.ReactNode, disabled?: boolean, label?: string }) => (
    <button 
        onClick={onClick}
        disabled={disabled}
        title={label}
        className={`p-2 rounded-full transition-colors duration-200 ${
            disabled 
            ? 'opacity-30 cursor-not-allowed' 
            : 'text-gray-600 hover:bg-gray-200 hover:text-gray-900 active:bg-gray-300'
        }`}
    >
        {icon}
    </button>
);
