

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
        <div className="space-y-2 group">
            <div className="flex justify-between items-center text-xs">
                <label className="font-medium text-stone-400 group-hover:text-stone-200 transition-colors">
                    {label}
                </label>
                <div className="font-mono text-[10px] font-bold text-white bg-white/10 px-1.5 py-0.5 rounded border border-white/5">
                    {value.toFixed(step < 0.1 ? 2 : (step < 1 ? 1 : 0))}<span className="text-stone-500 ml-0.5">{unit}</span>
                </div>
            </div>
            <div className="relative h-4 flex items-center">
                {/* Track Background */}
                <div className="absolute w-full h-[2px] bg-white/10 rounded-full" />

                {/* Active Track */}
                <div
                    className="absolute h-[2px] bg-white rounded-full transition-all duration-100 ease-out"
                    style={{ width: `${percentage}%` }}
                />

                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => onChange(Number(e.target.value))}
                    className="absolute w-full h-full opacity-0 cursor-pointer z-10"
                />

                {/* Thumb */}
                <div
                    className="pointer-events-none absolute h-3 w-3 bg-white rounded-full shadow-sm shadow-black/50 ring-0 transition-all duration-100 ease-out z-0 hover:scale-110"
                    style={{ left: `calc(${percentage}% - 6px)` }}
                />
            </div>
        </div>
    );
}
