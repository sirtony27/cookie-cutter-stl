

interface SliderProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    onChange: (value: number) => void;
}

export function Slider({ label, value, min, max, step = 1, unit = "", onChange }: SliderProps) {
    const percentage = ((value - min) / (max - min)) * 100;

    return (
        <div className="space-y-3 group">
            <div className="flex justify-between items-end">
                <label className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">
                    {label}
                </label>
                <span className="text-xs font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-1 rounded">
                    {value} <span className="text-blue-500/50">{unit}</span>
                </span>
            </div>
            <div className="relative h-6 flex items-center">
                <div className="absolute w-full h-1.5 bg-gray-700/50 rounded-full overflow-hidden backdrop-blur-sm border border-white/5">
                    <div
                        className="h-full bg-gradient-to-r from-blue-600 to-purple-500 transition-all duration-150 ease-out"
                        style={{ width: `${percentage}%` }}
                    />
                </div>
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => onChange(Number(e.target.value))}
                    className="absolute w-full h-full opacity-0 cursor-pointer"
                />
                <div
                    className="pointer-events-none absolute h-4 w-4 bg-white rounded-full shadow-lg shadow-black/50 border border-gray-200 transition-all duration-150 ease-out"
                    style={{ left: `calc(${percentage}% - 8px)` }}
                />
            </div>
        </div>
    );
}
