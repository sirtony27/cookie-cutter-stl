import { useState, useEffect, useRef, type ReactNode } from 'react';
import { X, GripHorizontal } from 'lucide-react';

interface FloatingPanelProps {
    title: string;
    onClose: () => void;
    children: ReactNode;
    initialPosition?: { x: number, y: number };
    initialSize?: { w: number, h: number };
}

export function FloatingPanel({ title, onClose, children, initialPosition = { x: 20, y: 20 }, initialSize = { w: 300, h: 300 } }: FloatingPanelProps) {
    const [pos, setPos] = useState(initialPosition);
    const [size, setSize] = useState(initialSize);
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    const panelRef = useRef<HTMLDivElement>(null);

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDragOffset({
            x: e.clientX - pos.x,
            y: e.clientY - pos.y
        });
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging) {
                setPos({
                    x: e.clientX - dragOffset.x,
                    y: e.clientY - dragOffset.y
                });
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragOffset]);

    return (
        <div
            ref={panelRef}
            style={{
                left: pos.x,
                top: pos.y,
                width: size.w,
                height: size.h,
                minWidth: 200,
                minHeight: 200
            }}
            className="fixed z-50 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl flex flex-col overflow-hidden resize-both"
            // Native CSS resize requires overflow != visible. We handle resize via this standard feature.
            onMouseUp={() => {
                // Determine if resize happened (panelRef dimensions changed)
                if (panelRef.current) {
                    const rect = panelRef.current.getBoundingClientRect();
                    if (rect.width !== size.w || rect.height !== size.h) {
                        setSize({ w: rect.width, h: rect.height });
                    }
                }
            }}
        >
            {/* Header / Drag Handle */}
            <div
                className="h-8 bg-black/40 border-b border-white/5 flex items-center justify-between px-2 cursor-move shrink-0 select-none"
                onMouseDown={handleMouseDown}
            >
                <div className="flex items-center gap-2 text-xs font-medium text-stone-300">
                    <GripHorizontal className="w-3 h-3 text-stone-500" />
                    {title}
                </div>
                <button
                    onClick={onClose}
                    className="p-1 hover:bg-white/10 rounded text-stone-400 hover:text-white"
                >
                    <X className="w-3 h-3" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 bg-black/20 overflow-hidden relative">
                {children}
            </div>

            {/* Custom overlay to assist resizing if native doesn't work well with canvas? 
                Actually CSS resize-both works well on divs. 
            */}
        </div>
    );
}
