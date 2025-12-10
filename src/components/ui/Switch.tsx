

interface SwitchProps {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    description?: string;
}

export function Switch({ label, checked, onChange, description }: SwitchProps) {
    return (
        <div className="flex items-center justify-between group">
            <div className="space-y-0.5">
                <label className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors cursor-pointer" onClick={() => onChange(!checked)}>
                    {label}
                </label>
                {description && (
                    <p className="text-xs text-gray-500">{description}</p>
                )}
            </div>
            <button
                onClick={() => onChange(!checked)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 ${checked ? 'bg-gradient-to-r from-blue-600 to-purple-600' : 'bg-gray-700'
                    }`}
            >
                <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${checked ? 'translate-x-6' : 'translate-x-1'
                        }`}
                />
            </button>
        </div>
    );
}
