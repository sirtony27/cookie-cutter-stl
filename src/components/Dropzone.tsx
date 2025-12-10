import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload } from 'lucide-react';


interface DropzoneProps {
    onImageLoaded: (file: File) => void;
}

export function Dropzone({ onImageLoaded }: DropzoneProps) {
    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            onImageLoaded(acceptedFiles[0]);
        }
    }, [onImageLoaded]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'image/*': ['.png', '.jpg', '.jpeg', '.svg', '.webp']
        },
        multiple: false
    });

    return (
        <div
            {...getRootProps()}
            className={`relative w-full h-64 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors duration-200 
        ${isDragActive ? 'border-blue-500 bg-blue-50/10' : 'border-gray-500/30 hover:border-gray-400'}`}
        >
            <input {...getInputProps()} />
            <div className="text-center p-6">
                <div className="w-16 h-16 bg-gradient-to-tr from-blue-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/30">
                    <Upload className="w-8 h-8 text-white" />
                </div>
                <p className="text-lg font-medium text-white mb-2">
                    {isDragActive ? "Suelta la imagen aquí" : "Arrastra y suelta una imagen"}
                </p>
                <p className="text-sm text-gray-400">
                    Soporta PNG, JPG, SVG
                </p>
            </div>
        </div>
    );
}
