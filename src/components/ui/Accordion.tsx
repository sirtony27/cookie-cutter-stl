import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

interface AccordionProps {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
    icon?: React.ReactNode;
}

export function Accordion({ title, children, defaultOpen = false, icon }: AccordionProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const contentRef = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState<string | number>(defaultOpen ? "auto" : 0);

    const toggle = () => {
        setIsOpen(!isOpen);
    };

    useEffect(() => {
        if (!contentRef.current) return;

        if (isOpen) {
            setHeight(contentRef.current.scrollHeight);
        } else {
            setHeight(0);
        }
    }, [isOpen, children]); // Recalculate if children change per V25.1

    return (
        <div className="border border-white/5 bg-white/[0.02] rounded-xl overflow-hidden shadow-sm transition-all hover:bg-white/[0.04]">
            <button
                onClick={toggle}
                className="w-full flex items-center justify-between p-4 focus:outline-none group"
            >
                <div className="flex items-center gap-3">
                    {icon && <span className="text-gray-400 group-hover:text-white transition-colors">{icon}</span>}
                    <span className="text-sm font-semibold text-gray-300 group-hover:text-white transition-colors">{title}</span>
                </div>
                <ChevronDown
                    className={`w-4 h-4 text-gray-500 transition-transform duration-300 ${isOpen ? "rotate-180 text-white" : ""}`}
                />
            </button>
            <div
                style={{ height: isOpen ? height : 0 }}
                className="overflow-hidden transition-all duration-300 ease-in-out"
            >
                <div ref={contentRef} className="p-4 pt-0 space-y-4">
                    {children}
                </div>
            </div>
        </div>
    );
}
