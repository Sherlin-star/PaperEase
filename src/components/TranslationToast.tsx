import React, { useEffect, useState } from 'react';
import { CheckCircle, Download, Eye, X } from 'lucide-react';

interface TranslationToastProps {
  show: boolean;
  elapsedSeconds: number;
  onView: () => void;
  onDownload: () => void;
  onClose: () => void;
}

export default function TranslationToast({
  show,
  elapsedSeconds,
  onView,
  onDownload,
  onClose
}: TranslationToastProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [show]);

  if (!isVisible) return null;

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}秒`;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}分${secs}秒`;
  };

  return (
    <div className="fixed bottom-24 right-6 z-50 animate-slide-up">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-emerald-200 dark:border-emerald-800 p-4 max-w-sm">
        <div className="flex items-start gap-3">
          <CheckCircle className="w-6 h-6 text-emerald-500 flex-shrink-0 mt-0.5" />
          
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              全文翻译完成
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              用时 {formatTime(elapsedSeconds)}，点击下方按钮操作
            </p>
            
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={onView}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium rounded-lg transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                查看译文
              </button>
              <button
                onClick={onDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                下载
              </button>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>
    </div>
  );
}
