import React from 'react';
import { Globe, CheckCircle, AlertCircle, X } from 'lucide-react';
import { useTranslation } from '../contexts/TranslationContext';
import { formatTime } from '../services/translationService';

export default function TranslationIndicator() {
  const { 
    isTranslating, 
    progress, 
    isBackground, 
    isCompleted,
    openModal,
    resetTranslation,
    translatedPages
  } = useTranslation();

  const hasTranslatedPages = translatedPages.some(p => p !== null);
  
  if (!isTranslating && !isBackground && !isCompleted && !hasTranslatedPages) {
    return null;
  }

  const percentage = progress 
    ? Math.round((progress.completedPages / progress.totalPages) * 100) 
    : 0;

  const handleIndicatorClick = () => {
    openModal();
  };

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    resetTranslation();
  };

  return (
    <div
      onClick={handleIndicatorClick}
      className={`fixed bottom-6 right-6 z-40 cursor-pointer transition-all duration-300 ${
        isCompleted ? 'animate-bounce' : ''
      }`}
    >
      <div className={`bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border-2 overflow-hidden min-w-[200px] ${
        isCompleted 
          ? 'border-emerald-500 dark:border-emerald-400' 
          : 'border-indigo-500 dark:border-indigo-400'
      }`}>
        <div className="p-4">
          <div className="flex items-center gap-3">
            {isCompleted ? (
              <CheckCircle className="w-8 h-8 text-emerald-500" />
            ) : (
              <div className="relative">
                <Globe className={`w-8 h-8 text-indigo-500 ${isTranslating ? 'animate-pulse' : ''}`} />
                <svg
                  className="absolute inset-0 w-8 h-8 -rotate-90"
                  viewBox="0 0 32 32"
                >
                  <circle
                    cx="16"
                    cy="16"
                    r="14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-slate-200 dark:text-slate-700"
                  />
                  <circle
                    cx="16"
                    cy="16"
                    r="14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeDasharray={`${percentage * 0.88} 88`}
                    className="text-indigo-500"
                  />
                </svg>
              </div>
            )}
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className={`text-sm font-semibold ${
                  isCompleted 
                    ? 'text-emerald-600 dark:text-emerald-400' 
                    : 'text-slate-700 dark:text-slate-300'
                }`}>
                  {isCompleted ? '翻译完成' : '正在翻译...'}
                </span>
                <button
                  onClick={handleReset}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
              
              {progress && !isCompleted && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {progress.completedPages}/{progress.totalPages} 页
                  </span>
                  <span className="text-xs text-indigo-500 font-medium">
                    {percentage}%
                  </span>
                  {progress.elapsedTime && (
                    <span className="text-xs text-slate-400">
                      {formatTime(progress.elapsedTime)}
                    </span>
                  )}
                </div>
              )}
              
              {isCompleted && progress && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  用时 {formatTime(progress.elapsedTime || 0)} · 点击查看
                </span>
              )}
            </div>
          </div>
        </div>
        
        {!isCompleted && progress && (
          <div className="h-1 bg-slate-100 dark:bg-slate-700">
            <div 
              className="h-full bg-indigo-500 transition-all duration-300"
              style={{ width: `${percentage}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
