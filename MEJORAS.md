# Plan de mejoras para CookieCutterGen

Este documento resume mejoras clave para elevar la app al siguiente nivel en UX, rendimiento, robustez y capacidades pro.

## 1. Experiencia de Usuario y Flujo
- Plantillas y biblioteca: formas comunes (circulo, estrella, corazón), tipografías curadas y ejemplos listos para usar.
- Asistentes paso a paso: wizards para “Cortador” y “Llavero” que guían tamaño, tolerancias y base.
- Editor 2D avanzado: atajos visibles, tooltips contextual, modo alineación con guías, selección múltiple mejorada y snap configurable.
- Vista previa multicolor: paletas guardables, capas activables y comparación antes/después.
- Onboarding: tutorial interactivo y tour de UI la primera vez; botón “Aprende” siempre visible.

## 2. Rendimiento y Arquitectura
- Workers adicionales: mover generación STL y cálculos booleanos pesados al Web Worker (progreso y cancelación).
- Cache de resultados: hash (contornos + settings) para evitar recomputar geometría/exports repetidos.
- Code-splitting: lazy load de three/stdlib y paneles pesados; prefetch bajo carga ociosa.
- Optimización de contornos: proteger offsetContour ante ángulos agudos (miter limit) y fallback seguro.
- Control de calidad de geometría: dedupe de vértices, non-indexed sólo al exportar, límites de normalización.

## 3. Robustez y Validaciones
- Guardas de fabricación: espesor mínimo de pared/relieve, alturas válidas, tolerancias razonables; sugerencias automáticas.
- Puentes automáticos configurables: parámetros (mín. distancia, grosor), vista previa y edición manual.
- Detección de islas: avisos en 2D/3D con opción a unir o rellenar.
- Modo seguro de exportación: verificación de piezas vacías, geometría degenerada y nombres de archivos amigables.

## 4. Persistencia y Colaboración
- Proyectos: guardado en IndexedDB (versionado), export/import JSON, snapshots y autosave.
- Compartir: URL con parámetros o archivo .ccg; botón “Compartir proyecto” con vista de sólo lectura.
- Biblioteca personal: assets y presets de materiales/colores, etiquetas y búsqueda.

## 5. Trazado e Imagen
- Auto-trace inteligente: ajuste automático de umbral/preset según tipo de imagen (texto, logo, boceto).
- Mejora de blur: opción GPU/main-thread y alternativa en worker (Gaussian separable) si se mueve todo a worker.
- Post-proceso: simplificación adaptativa por escala y suavizado configurable por curva.
- Import de SVG: soporte para rutas Bezier nativas, manteniendo nodos/handles.

## 6. 3D y Exportación
- Presets de perfiles: “standard”, “stepped”, “ultra-sharp” con parámetros visibles.
- Bases avanzadas: patrones honeycomb/lineal con densidad variable, borde reforzado y relleno inteligente.
- Formatos extra: OBJ/GLB y export de escenas para visualización externa.
- Validación pre-export: checklist y vista rápida de capas (cortador/marker/base/handle).

## 7. Calidad y DevEx
- Tests: regresión visual del pipeline de trazado, unit tests para booleanas y generador; smoke tests de exportación.
- Lint/CI: reglas type-aware, pre-commit y CI básica (build + lint + pruebas).
- Telemetría opcional: métricas de uso anónimas para priorizar mejoras.

## 8. Móvil y Accesibilidad
- Modo móvil optimizado: gestos para zoom/pan, controles grandes, rendimiento ajustado.
- Accesibilidad: foco/keyboard navegable, contraste, ARIA y textos alternativos.

## Roadmap sugerido
1) Validaciones + persistencia (IDB) + cache/worker para generación.  
2) Plantillas, onboarding y presets de trazado.  
3) Code-splitting/lazy y optimización de offset/booleanas.  
4) Tests de regresión y formatos extra de exportación.

Con estas mejoras, el proyecto puede escalar a un 9/10 en calidad general y experiencia.