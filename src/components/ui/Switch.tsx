

interface SwitchProps {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    description?: string;
}

export function Switch({ label, checked, onChange, description }: SwitchProps) {
    return (
        <div className="flex items-center justify-between group gap-2">
            <div className="space-y-0.5">
                {label && (
                    <label className="text-sm font-medium text-stone-400 group-hover:text-stone-200 transition-colors cursor-pointer select-none" onClick={() => onChange(!checked)}>
                        {label}
                    </label>
                )}
                {description && (
                    <p className="text-[10px] text-stone-600 group-hover:text-stone-500 transition-colors">{description}</p>
                )}
            </div>
            <button
                onClick={() => onChange(!checked)}
                className={`relative inline-flex h-4 w-8 items-center rounded-full transition-all focus:outline-none ring-1 ring-white/10 ${checked ? 'bg-white' : 'bg-black/40 hover:bg-white/5'}`}
            >
                <span className="sr-only">Toggle</span>
                <span
                    className={`inline-block h-3 w-3 transform rounded-full shadow-sm transition-transform duration-200 ease-in-out ${checked ? 'translate-x-[18px] bg-black' : 'translate-x-[2px] bg-stone-500'}`}
                />
            </button>
        </div>
    );
}
