import { useState, useEffect } from 'react';
import { Upload, Cookie, Wand2 } from 'lucide-react';
import { Dropzone } from './components/Dropzone';
import { Controls } from './components/Controls';
import { Viewer3D } from './components/Viewer3D';
import { loadImage, processImage, smoothContour, simplifyContour } from './core/image-processing';
import { generateGeometry, exportToSTL, type CutterPart } from './core/geometry-generator'; // Updated import
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
  markerThickness: 0.8
};

function App() {
  const [settings, setSettings] = useState<CutterSettings>(DEFAULT_SETTINGS);
  const [contours, setContours] = useState<THREE.Vector2[][] | null>(null);
  const [geometryParts, setGeometryParts] = useState<CutterPart[]>([]); // New Type

  // Edit Mode State
  const [isEditMode, setIsEditMode] = useState(false);
  const [hiddenPartIds, setHiddenPartIds] = useState<Set<string>>(new Set());

  const [imageDims, setImageDims] = useState<{ width: number; height: number } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Viewer Settings
  const [viewerSettings, setViewerSettings] = useState({
    baseColor: '#ff6347',
    outerColor: '#3b82f6',
    innerColor: '#10b981',
    autoRotate: true
  });

  const handleViewerChange = (key: string, value: any) => {
    setViewerSettings(prev => ({ ...prev, [key]: value }));
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

  const handleImageLoaded = async (file: File) => {
    setIsProcessing(true);
    setError(null);
    setHiddenPartIds(new Set()); // Reset hidden on new image
    try {
      const img = await loadImage(file);
      const res = processImage(img);
      if (res.contours.length === 0) {
        setError("No se pudieron detectar formas. Intenta con una imagen de mayor contraste o fondo limpio.");
        setContours(null);
        setImageDims(null);
      } else {
        // Pipeline V5: Simplify -> Smooth -> Simplify
        const optimized = res.contours.map(c => {
          let pts = simplifyContour(c, 1.5);
          pts = smoothContour(pts, 3);
          pts = simplifyContour(pts, 0.5);
          return pts;
        });

        setContours(optimized);
        setImageDims({ width: res.width, height: res.height });
      }
    } catch (err) {
      console.error(err);
      setError("Error al procesar la imagen.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Debounced geometry generation?
  // For now, simpler: Use useEffect with constraints
  useEffect(() => {
    if (!contours || !imageDims) return;

    // Simple debounce logic could be here, but let's just run it. 
    // Geometry generation is reasonably fast for simple shapes.
    // Generate new parts
    const parts = generateGeometry(contours, imageDims.width, imageDims.height, settings);
    setGeometryParts(parts);

    return () => {
      parts.forEach(p => p.geometry.dispose());
    };
  }, [contours, imageDims, settings]);

  const handleExport = () => {
    if (geometryParts.length === 0) return;
    const blob = exportToSTL(geometryParts, hiddenPartIds);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cortador-galletas.stl';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white selection:bg-blue-500/30">
      {/* Header */}
      <header className="border-b border-white/10 bg-white/5 backdrop-blur-lg sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Cookie className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
              CookieCutter<span className="text-blue-500">Gen</span> <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded ml-2">V2</span>
            </h1>
          </div>
          <div className="text-sm text-gray-400 hidden sm:block">
            Alta Calidad • Edición Avanzada
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Left Column: Input & Preview */}
          <div className="lg:col-span-2 space-y-6">

            {/* 3D Viewer Area */}
            <div className="relative group">
              <Viewer3D
                parts={geometryParts}
                colors={viewerSettings}
                autoRotate={viewerSettings.autoRotate}
                isEditMode={isEditMode}
                hiddenPartIds={hiddenPartIds}
                onTogglePart={handleTogglePart}
              />

              {/* Overlay Status */}
              {isEditMode && (
                <div className="absolute top-4 left-4 bg-red-500/20 text-red-100 border border-red-500/30 px-3 py-1.5 rounded-full text-sm font-medium backdrop-blur-md flex items-center gap-2 animate-pulse">
                  <div className="w-2 h-2 bg-red-500 rounded-full" />
                  Modo Borrador Activo
                </div>
              )}
              {isProcessing && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-20 flex flex-col items-center justify-center rounded-xl">
                  <Wand2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
                  <p className="font-medium text-lg">Suavizando y Generando...</p>
                </div>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Upload Area */}
            {!contours && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Upload className="w-5 h-5 text-purple-400" />
                  Subir Imagen
                </h3>
                <Dropzone onImageLoaded={handleImageLoaded} />
              </div>
            )}

            {contours && (
              <div className="flex justify-end">
                <button
                  onClick={() => { setContours(null); setGeometryParts([]); }}
                  className="text-sm text-gray-400 hover:text-white underline underline-offset-4"
                >
                  Subir otra imagen
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Controls */}
          <div className="lg:col-span-1">
            <div className="space-y-6">
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
                <p className="font-semibold text-blue-300 mb-2">Mejoras V2 Activas:</p>
                <ul className="list-disc ml-4 space-y-1 text-gray-400">
                  <li>Suavizado de curvas automático</li>
                  <li>Reducción de ruido (Blur)</li>
                  <li>Iluminación 3D mejorada</li>
                </ul>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

export default App;
