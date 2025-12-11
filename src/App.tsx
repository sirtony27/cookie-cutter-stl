import { useState, useEffect } from 'react';
import { Wand2, Upload, Pencil, Undo2, Redo2, Type, Cookie } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Dropzone } from './components/Dropzone';
import { Controls } from './components/Controls';
import { Viewer3D } from './components/Viewer3D';
import { TextInput } from './components/TextInput';
import { ContourEditor, type ContourRole } from './components/ContourEditor';
import { ImageProcessor } from './components/ImageProcessor';
import { loadImage, processImage, smoothContour, simplifyContour, type ProcessOptions } from './core/image-processing';
import { generateGeometry, exportToSTL, type CutterPart } from './core/geometry-generator';
import type { CutterSettings } from './core/geometry-generator';
import * as THREE from 'three';

const DEFAULT_SETTINGS: CutterSettings = {
  size: 90,
  cutterHeight: 20,
  cutterThickness: 0.8,
  baseHeight: 3,
  baseThickness: 5,
  mirror: false,
  withBase: true,
  markerHeight: 14,
  markerThickness: 0.8,
  generationMode: 'single',
  stampTolerance: 0.5,
  handleHeight: 15,
  handleThickness: 5,
  automaticBridges: false,
  solidBase: false,
  bladeProfile: 'standard',
  stampGrid: false,
  outputType: 'cutter',
  keychainHoleDiameter: 4,
  keychainShape: 'silhouette',
  keychainBasePadding: 4,
  keychainHoleOffset: { x: 0, y: 0 },
  keychainBevelEnabled: false,
  keychainBevelSize: 0.5
};

import { useHistory } from './hooks/useHistory';

import { interpolateContour, type NodeType } from './core/curve-utils';

interface DesignState {
  contours: THREE.Vector2[][];
  roles: ContourRole[];
  nodeTypes?: NodeType[][];
}

function App() {
  // Persistence: Load initial settings from localStorage if available
  const [settings, setSettings] = useState<CutterSettings>(() => {
    const saved = localStorage.getItem('cookie_cutter_settings');
    // V25.2 Fix: Merge saved settings with DEFAULT_SETTINGS to ensure new fields (like keychainHoleOffset) exist
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
  });

  // History for Contours & Roles & NodeTypes
  const {
    state: designState,
    set: setDesignState,
    undo: undoDesign,
    redo: redoDesign,
    canUndo: canUndoDesign,
    canRedo: canRedoDesign,
    reset: resetDesign
  } = useHistory<DesignState | null>(null);

  // Derived state
  const contours = designState?.contours || null;
  const contourRoles = designState?.roles || [];
  const nodeTypes = designState?.nodeTypes || []; // New

  // Helper to update design
  const updateDesign = (newContours: THREE.Vector2[][], newRoles?: ContourRole[], newNodeTypes?: NodeType[][]) => {
    const finalRoles = newRoles || newContours.map((_, i) => contourRoles[i] || 'auto');
    const finalNodeTypes = newNodeTypes || newContours.map((c, i) => nodeTypes[i] || new Array(c.length).fill('corner'));

    setDesignState({ contours: newContours, roles: finalRoles, nodeTypes: finalNodeTypes });
  };

  // Helper to reset (wraps resetDesign)
  const resetAppDesign = (newState: keyof DesignState | null | DesignState | THREE.Vector2[][]) => { // Rough typing shim for compatibility
    if (newState === null) {
      resetDesign(null);
    } else if (!Array.isArray(newState) && typeof newState === 'object' && 'contours' in (newState as any)) {
      resetDesign(newState as DesignState);
    } else {
      // Legacy array passed?
      if (Array.isArray(newState)) {
        resetDesign({ contours: newState as THREE.Vector2[][], roles: (newState as any).map(() => 'auto') });
      }
    }
  };

  const [geometryParts, setGeometryParts] = useState<CutterPart[]>([]);

  // Input Mode
  const [inputMode, setInputMode] = useState<'upload' | 'text' | 'designer'>('upload');

  // Edit Mode State
  const [isEditMode, setIsEditMode] = useState(false); // Eraser
  const [isNodeEditorMode, setIsNodeEditorMode] = useState(false); // Node Editor
  const [hiddenPartIds, setHiddenPartIds] = useState<Set<string>>(new Set());

  const [imageDims, setImageDims] = useState<{ width: number; height: number } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Viewer Settings
  // Persistence: Save/Load Viewer Settings
  const [viewerSettings, setViewerSettings] = useState(() => {
    const saved = localStorage.getItem('cookie_cutter_viewer_settings');
    const parsed = saved ? JSON.parse(saved) : {
      baseColor: '#ff6347',
      outerColor: '#3b82f6',
      innerColor: '#10b981',
      autoRotate: false
    };
    return { ...parsed, autoRotate: false }; // Always start with auto-rotate off
  });

  // V16: Smart Trace State
  const [processingImg, setProcessingImg] = useState<{ src: string, element: HTMLImageElement } | null>(null);

  // V12: Reference Image for Designer Mode
  const [referenceImage, setReferenceImage] = useState<string | null>(null);

  // V28/V30: Sidebar State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isInputCollapsed, setIsInputCollapsed] = useState(false);

  // Handlers required by UI
  const handleViewerChange = (key: string, value: any) => {
    setViewerSettings((prev: any) => ({ ...prev, [key]: value }));
  };

  const handleTogglePart = (id: string) => {
    setHiddenPartIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleResetHidden = () => {
    setHiddenPartIds(new Set());
  };

  // V12: Handle loading Reference Image
  const handleReferenceLoaded = async (file: File) => {
    const url = URL.createObjectURL(file);
    setReferenceImage(url);

    // Get image dims for the editor using the existing loader
    const img = new Image();
    img.src = url;
    img.onload = () => {
      setImageDims({ width: img.width, height: img.height });
      // Start with empty contours if none exist, or keep existing?
      // For Designer Mode, we start empty usually.
      if (!contours) {
        updateDesign([], []);
      }
      setIsNodeEditorMode(true); // Switch to 2D view immediately
    };
  };

  // Handler for text generation
  // Handler for text generation
  const handleTextGenerated = (img: HTMLImageElement) => {
    // Text is usually perfect BW, so standard settings work
    runTrace(img, { blur: 0, threshold: 128, invert: false });
  };

  // ...

  // V16: Smart Trace - Core Logic (Renamed from processSourceImage)
  const runTrace = (img: HTMLImageElement, options: ProcessOptions) => {
    setIsProcessing(true);
    setError(null);
    setHiddenPartIds(new Set());

    setTimeout(() => {
      try {
        const res = processImage(img, options); // V16: Pass options
        if (res.contours.length === 0) {
          setError("No se pudieron detectar formas. Ajusta el Umbral o el Contraste.");
          // We stay in processing mode so user can try again
        } else {
          // Optimization pipeline
          const optimized = res.contours.map(c => {
            // Initial noise reduction
            let pts = simplifyContour(c, 1.5);
            // Smoothing
            pts = smoothContour(pts, 3);
            // Final point reduction
            pts = simplifyContour(pts, 0.5);
            return pts;
          });
          resetAppDesign(optimized); // Reset history with new image
          setImageDims({ width: res.width, height: res.height });
          setProcessingImg(null); // Exit processing mode
          setIsNodeEditorMode(true); // Go to editor
        }
      } catch (err) {
        console.error(err);
        setError("Error al procesar la imagen.");
      } finally {
        setIsProcessing(false);
      }
    }, 50);
  };

  const handleImageLoaded = async (file: File) => {
    try {
      const img = await loadImage(file);
      // V16: Go to Processor
      // Assuming setProcessingImg is defined in App state (I need to add it!)
      setProcessingImg({ src: img.src, element: img });
      setInputMode('upload');
    } catch (err) {
      console.error(err);
      setError("No se pudo cargar la imagen.");
    }
  };

  // ... 

  // Reset logic in UI buttons
  // onClick={() => { setInputMode('upload'); resetContours(null); setGeometryParts([]); }}

  // ...

  useEffect(() => {
    if (!contours || !imageDims) return;

    // Interpolate curves if needed
    const smoothContours = contours.map((c, i) => {
      const types = nodeTypes[i] || new Array(c.length).fill('corner');
      if (types.some(t => t === 'smooth')) {
        return interpolateContour(c, types, true, 8);
      }
      return c;
    });

    const parts = generateGeometry(smoothContours, contourRoles, imageDims.width, imageDims.height, settings);
    setGeometryParts(parts);
  }, [contours, contourRoles, imageDims, settings, nodeTypes]);


  const handleExport = async (isZip = false) => {
    if (geometryParts.length === 0) return;

    try {
      if (isZip) {
        const zip = new JSZip();

        if (settings.outputType === 'cutter') {
          // --- CUTTER MODE SPLIT ---
          // 1. Cutter (Blade ONLY)
          const cutterParts = geometryParts.filter(p => !hiddenPartIds.has(p.id) && p.type === 'outer');
          // 2. Marker (Inner Details + Base + Handle)
          const markerParts = geometryParts.filter(p => !hiddenPartIds.has(p.id) && (p.type === 'inner' || p.type === 'base' || p.type === 'handle'));

          if (cutterParts.length > 0) {
            zip.file("cortador.stl", exportToSTL(cutterParts, new Set()));
          }
          if (markerParts.length > 0) {
            zip.file("marcador.stl", exportToSTL(markerParts, new Set()));
          }
          saveAs(await zip.generateAsync({ type: "blob" }), "cortador-kit.zip");

        } else {
          // --- KEYCHAIN MODE SPLIT ---
          // 1. Base (Backing)
          const baseParts = geometryParts.filter(p => !hiddenPartIds.has(p.id) && p.type === 'base');
          // 2. Relief (Details)
          const reliefParts = geometryParts.filter(p => !hiddenPartIds.has(p.id) && p.type !== 'base');

          if (baseParts.length > 0) {
            zip.file("base.stl", exportToSTL(baseParts, new Set()));
          }
          if (reliefParts.length > 0) {
            zip.file("relieve.stl", exportToSTL(reliefParts, new Set()));
          }
          saveAs(await zip.generateAsync({ type: "blob" }), "llavero-multicolor.zip");
        }

      } else {
        // Standard Single STL
        const blob = exportToSTL(geometryParts, hiddenPartIds);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cookie-cutter.stl';
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error(err);
      alert("Error al exportar: " + (err instanceof Error ? err.message : "Desconocido"));
    }
  };

  return (
    <div className="h-screen bg-black text-stone-200 selection:bg-white/20 flex flex-col overflow-hidden">
      <header className="border-b border-white/5 bg-black/50 backdrop-blur-lg sticky top-0 z-50 h-[50px] flex items-center shrink-0">
        <div className="w-full px-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-white text-black rounded flex items-center justify-center shadow-lg shadow-white/5">
              <Cookie className="w-4 h-4 fill-current" />
            </div>
            <h1 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              CookieCutter<span className="font-light opacity-50">Gen</span>
              <span className="text-[9px] bg-blue-500/10 text-blue-300 border border-blue-500/20 px-1.5 py-0.5 rounded font-mono uppercase tracking-wider">PRO</span>
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className={`text-xs px-2 py-1 rounded border transition-colors ${isSidebarOpen ? 'bg-white/10 border-white/10 text-white' : 'border-white/5 text-stone-500 hover:text-white'}`}
              title={isSidebarOpen ? "Ocultar Controles" : "Mostrar Controles"}
            >
              {isSidebarOpen ? 'Sidebar' : 'Sidebar'}
            </button>
            <div className="text-[10px] text-stone-600 font-mono">
              v31.0
            </div>
          </div>
        </div>
      </header >

      <main className="flex-1 flex flex-row overflow-hidden relative">
        {/* Left Column: Canvas & Input */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0a0a0a] relative">

          {/* 3D Viewer / Editor Area - Full Height */}
          <div className="flex-1 relative bg-gray-900/50 overflow-hidden flex flex-col h-full w-full">

            {/* View Toggle & Undo/Redo */}
            <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-2 pointer-events-none">
              {/* Make buttons pointer-events-auto */}
              <div className="flex bg-black/40 rounded-lg p-1 backdrop-blur-md border border-white/10 pointer-events-auto">
                <button
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${!isNodeEditorMode ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                  onClick={() => setIsNodeEditorMode(false)}
                >
                  3D
                </button>
                <button
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${isNodeEditorMode ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                  onClick={() => setIsNodeEditorMode(true)}
                >
                  2D (Nodos)
                </button>
              </div>

              {isNodeEditorMode && contours && (
                <div className="flex bg-black/40 rounded-lg p-1 backdrop-blur-md border border-white/10 gap-1 pointer-events-auto">
                  <button
                    onClick={undoDesign}
                    disabled={!canUndoDesign}
                    className="p-1.5 text-gray-300 hover:text-white disabled:opacity-30 disabled:hover:text-gray-300 transition-colors"
                    title="Deshacer (Undo)"
                  >
                    <Undo2 className="w-4 h-4" />
                  </button>
                  <div className="w-px bg-white/10 my-1" />
                  <button
                    onClick={redoDesign}
                    disabled={!canRedoDesign}
                    className="p-1.5 text-gray-300 hover:text-white disabled:opacity-30 disabled:hover:text-gray-300 transition-colors"
                    title="Rehacer (Redo)"
                  >
                    <Redo2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {!isNodeEditorMode ? (
              <>
                <Viewer3D
                  parts={geometryParts}
                  colors={viewerSettings}
                  autoRotate={viewerSettings.autoRotate && !isEditMode}
                  isEditMode={isEditMode}
                  hiddenPartIds={hiddenPartIds}
                  onTogglePart={handleTogglePart}
                />
                {isEditMode && (
                  <div className="absolute top-4 left-4 bg-red-500/20 text-red-100 border border-red-500/30 px-3 py-1.5 rounded-full text-sm font-medium backdrop-blur-md flex items-center gap-2 animate-pulse pointer-events-none">
                    <div className="w-2 h-2 bg-red-500 rounded-full" />
                    Modo Borrador Activo
                  </div>
                )}
              </>
            ) : (
              contours && imageDims && (
                <ContourEditor
                  contours={contours}
                  width={imageDims.width}
                  height={imageDims.height}
                  onChange={updateDesign}
                  referenceImage={referenceImage}
                  roles={contourRoles}
                  nodeTypes={nodeTypes}
                  onUndo={undoDesign}
                  onRedo={redoDesign}
                />
              )
            )}

            {isProcessing && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-20 flex flex-col items-center justify-center rounded-xl">
                <Wand2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
                <p className="font-medium text-lg">Procesando Diseño...</p>
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400 text-sm shrink-0">
              {error}
            </div>
          )}

          {/* Input Selection Tabs (Collapsible - Floating Bottom or Top?) - Let's keep it Top but clean */}
          <div className={`shrink-0 border-b border-white/5 bg-[#0f0f0f] px-4 py-2 flex items-center gap-2 transition-all duration-300 ${isInputCollapsed ? 'h-[50px]' : ''}`}>
            {/* Header/Tabs */}
            <button
              onClick={() => setIsInputCollapsed(!isInputCollapsed)}
              className="p-2 bg-white/5 hover:bg-white/10 rounded text-stone-400 hover:text-white transition-colors"
              title={isInputCollapsed ? "Mostrar Entradas" : "Ocultar Entradas"}
            >
              {isInputCollapsed ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              )}
            </button>

            <div className={`flex-1 flex gap-1 ${isInputCollapsed ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="bg-black/20 p-0.5 rounded-lg flex gap-1 border border-white/5 flex-1 max-w-md">
                <button
                  onClick={() => { setInputMode('upload'); resetAppDesign(null); setGeometryParts([]); setReferenceImage(null); }}
                  className={`flex-1 py-3 rounded-lg text-xs md:text-sm font-bold transition-all flex items-center justify-center gap-2
                            ${inputMode === 'upload' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                  <Upload className="w-4 h-4" />
                  <span className="hidden sm:inline">Magic Trace</span>
                </button>
                <button
                  onClick={() => { setInputMode('designer'); resetAppDesign([]); setGeometryParts([]); setReferenceImage(null); setIsNodeEditorMode(true); }}
                  className={`flex-1 py-3 rounded-lg text-xs md:text-sm font-bold transition-all flex items-center justify-center gap-2
                            ${inputMode === 'designer' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                  <Pencil className="w-4 h-4" />
                  <span className="hidden sm:inline">Diseñador</span>
                </button>
                <button
                  onClick={() => { setInputMode('text'); resetAppDesign(null); setGeometryParts([]); setReferenceImage(null); }}
                  className={`flex-1 py-3 rounded-lg text-xs md:text-sm font-bold transition-all flex items-center justify-center gap-2
                            ${inputMode === 'text' ? 'bg-green-600 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                  <Type className="w-4 h-4" />
                  <span className="hidden sm:inline">Texto</span>
                </button>
              </div>
            </div>
          </div>

          {/* Conditional Input Area - Hidden when collapsed */}
          {!isInputCollapsed && (
            <div className="px-4 pb-4 bg-[#0a0a0a] border-b border-white/5">
              {processingImg ? (
                <div className="h-[600px] mt-4 bg-gray-900 rounded-xl overflow-hidden border border-white/10 shadow-2xl">
                  <ImageProcessor
                    imageSrc={processingImg.src}
                    onConfirm={(options) => runTrace(processingImg.element, options)}
                    onCancel={() => setProcessingImg(null)}
                  />
                </div>
              ) : inputMode === 'upload' ? (
                (!contours) && (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                    {/* Dropzone Content */}
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                      <Upload className="w-5 h-5 text-blue-400" />
                      Subir Imagen para Tracear
                    </h3>
                    <Dropzone onImageLoaded={handleImageLoaded} />
                  </div>
                )
              ) : inputMode === 'designer' ? (
                <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                  {/* Designer Content */}
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <Pencil className="w-5 h-5 text-purple-400" />
                    Modo Diseñador (Calco)
                  </h3>
                  <p className="text-sm text-gray-400 mb-4">Sube una imagen de referencia o empieza en blanco.</p>

                  {!referenceImage ? (
                    <Dropzone onImageLoaded={handleReferenceLoaded} />
                  ) : (
                    <div className="flex items-center gap-4 bg-black/20 p-4 rounded-lg">
                      <img src={referenceImage} className="w-16 h-16 object-cover rounded border border-white/10" />
                      <div className="flex-1">
                        <div className="text-sm font-bold text-white">Imagen de Referencia Cargada</div>
                        <div className="text-xs text-gray-400">Usa el Editor 2D arriba para dibujar.</div>
                      </div>
                      <button
                        onClick={() => setReferenceImage(null)}
                        className="text-xs text-red-400 hover:underline"
                      >
                        Quitar
                      </button>
                    </div>
                  )}

                  {!contours && !referenceImage && (
                    <button
                      onClick={() => {
                        updateDesign([], []);
                        setImageDims({ width: 800, height: 800 });
                        setIsNodeEditorMode(true);
                      }}
                      className="mt-4 w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-gray-300 transition-colors"
                    >
                      Empezar con Lienzo en Blanco (800x800)
                    </button>
                  )}
                </div>
              ) : (
                <div className="mt-2">
                  <TextInput onImageGenerated={handleTextGenerated} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Controls (Sidebar) */}
        {isSidebarOpen && (
          <div className="w-[340px] flex-shrink-0 h-full overflow-y-auto border-l border-white/5 bg-[#111] custom-scrollbar z-20">
            <div className="p-4 space-y-6 pb-20">
              <Controls
                settings={settings}
                onChange={setSettings}
                onExport={handleExport}
                disabled={geometryParts.length === 0}
                viewerSettings={viewerSettings}
                onViewerChange={handleViewerChange}
                isEditMode={isEditMode}
                onToggleEditMode={() => setIsEditMode(!isEditMode)}
                hasHiddenParts={hiddenPartIds.size > 0}
                onResetHidden={handleResetHidden}
              />
              <div className="mt-8 p-6 bg-blue-500/5 border border-blue-500/10 rounded-xl text-sm text-blue-200/80">
                <p className="font-semibold text-blue-300 mb-2">Características:</p>
                <ul className="list-disc ml-4 space-y-1 text-gray-400">
                  <li>Suavizado Automático</li>
                  <li>Modo Set 2 Piezas</li>
                  <li>Generador de Texto</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>
    </div >
  );
}

export default App;
