import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileSpreadsheet, Check, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileUploadZoneProps {
  onFileSelect: (file: File) => void;
  isLoading?: boolean;
  error?: string | null;
  success?: boolean;
}

/**
 * Animated drag-and-drop file upload zone
 */
export const FileUploadZone = ({
  onFileSelect,
  isLoading = false,
  error = null,
  success = false
}: FileUploadZoneProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      setFileName(file.name);
      onFileSelect(file);
    }
  }, [onFileSelect]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      onFileSelect(file);
      // Reset value so the same file can be uploaded again if needed
      e.target.value = '';
    }
  }, [onFileSelect]);

  const resetUpload = useCallback(() => {
    setFileName(null);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="w-full"
    >
      <label
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative flex flex-col items-center justify-center w-full h-48",
          "border-2 border-dashed rounded-xl cursor-pointer",
          "transition-all duration-300 ease-out",
          "group overflow-hidden",
          isDragging && "border-primary bg-primary/5 scale-[1.02]",
          success && "border-accent bg-accent/5",
          error && "border-destructive bg-destructive/5",
          !isDragging && !success && !error && "border-border hover:border-primary/50 hover:bg-secondary/50"
        )}
      >
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={isLoading}
        />

        {/* Background animation */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5"
          animate={{
            opacity: isDragging ? 1 : 0,
          }}
          transition={{ duration: 0.3 }}
        />

        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex flex-col items-center gap-3"
            >
              <div className="relative">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full"
                />
              </div>
              <p className="text-sm text-muted-foreground">Parsing Excel file...</p>
            </motion.div>
          ) : success ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex flex-col items-center gap-3"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", damping: 10, stiffness: 200 }}
                className="p-3 rounded-full bg-accent/20"
              >
                <Check className="w-8 h-8 text-accent" />
              </motion.div>
              <div className="text-center">
                <p className="font-medium text-foreground">File uploaded successfully!</p>
                <p className="text-sm text-muted-foreground mt-1">{fileName}</p>
              </div>
            </motion.div>
          ) : error ? (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex flex-col items-center gap-3"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="p-3 rounded-full bg-destructive/20"
              >
                <AlertCircle className="w-8 h-8 text-destructive" />
              </motion.div>
              <div className="text-center">
                <p className="font-medium text-destructive">Upload failed</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">{error}</p>
              </div>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  resetUpload();
                }}
                className="text-xs text-primary hover:underline"
              >
                Try again
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="default"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3"
            >
              <motion.div
                animate={{ y: isDragging ? -5 : 0 }}
                transition={{ type: "spring", stiffness: 300 }}
                className={cn(
                  "p-4 rounded-xl transition-colors",
                  isDragging ? "bg-primary/20" : "bg-secondary group-hover:bg-primary/10"
                )}
              >
                {isDragging ? (
                  <Upload className="w-8 h-8 text-primary" />
                ) : (
                  <FileSpreadsheet className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
                )}
              </motion.div>

              <div className="text-center">
                <p className="font-medium text-foreground">
                  {isDragging ? "Drop your file here" : "Upload OB Excel Sheet"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Drag & drop or click to browse
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Supports .xlsx and .xls files
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </label>
    </motion.div>
  );
};
