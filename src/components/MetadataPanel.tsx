import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Copy, Check, Share2, RefreshCw, X, Sparkles, Star, StarOff } from 'lucide-react';

interface Metadata {
  title: string;
  authors: string[];
  journal: string;
  year: string;
  volume: string;
  issue: string;
  keywords: string[];
  codeLinks: string[];
  paperType: 'review' | 'experimental' | 'theoretical' | 'other';
  abstract: string;
}

// 定义论文信息接口
interface PaperInfo {
  title: string;
  authors?: string[];
  journal?: string;
  year?: string;
  volume?: string;
  issue?: string;
  keywords?: string[];
  codeLinks?: string[];
  paperType?: 'review' | 'experimental' | 'theoretical' | 'other';
  abstract?: string;
  arxivId?: string | null;
  doi?: string | null;
  journalUrl?: string | null;
  timestamp?: number;
}

interface MetadataPanelProps {
  metadata: Metadata | null;
  doi?: string | null;
  arxivId?: string | null;
  isExtracting: boolean;
  onReExtract?: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  manualTitle?: string;
  showManualInput?: boolean;
  onManualTitleChange?: (title: string) => void;
  onManualConfirm?: () => void;
  onGeneratePaperPortrait?: () => void;
  isGeneratingPortrait?: boolean;
  onToggleBookmark?: (paperData: PaperInfo) => void;
  isBookmarked?: boolean;
}

export default function MetadataPanel({
  metadata,
  doi,
  arxivId,
  isExtracting,
  onReExtract,
  isCollapsed,
  onToggleCollapse,
  manualTitle = '',
  showManualInput = false,
  onManualTitleChange,
  onManualConfirm,
  onGeneratePaperPortrait,
  isGeneratingPortrait = false,
  onToggleBookmark,
  isBookmarked = false
}: MetadataPanelProps) {
  const [referenceFormat, setReferenceFormat] = useState<'gbt7714' | 'bibtex' | 'apa' | 'mla'>('gbt7714');
  const [copiedReference, setCopiedReference] = useState(false);
  const [copiedShareText, setCopiedShareText] = useState(false);

  const getGB7714Reference = () => {
    if (!metadata) return '';
    const authors = metadata.authors.length > 3
      ? metadata.authors.slice(0, 3).join('、') + '等'
      : metadata.authors.join('、');
    return `${authors}. ${metadata.title}[J]. ${metadata.journal}, ${metadata.year}, ${metadata.volume}(${metadata.issue}): 1-10.`;
  };

  const getBibTeXReference = () => {
    if (!metadata) return '';
    return `@article{example2024,
  title={${metadata.title}},
  author={${metadata.authors.map(a => a.split(' ').pop()).join(' and ')}},
  journal={${metadata.journal}},
  volume={${metadata.volume}},
  number={${metadata.issue}},
  pages={1--10},
  year={${metadata.year}},
  publisher={Example Publisher}
}`;
  };

  const getAPAReference = () => {
    if (!metadata) return '';
    const authors = metadata.authors.map(a => {
      const parts = a.split(' ');
      const lastName = parts.pop();
      const initials = parts.map(p => p[0]).join('. ');
      return `${lastName}, ${initials}`;
    }).join(', ');
    return `${authors} (${metadata.year}). ${metadata.title}. ${metadata.journal}, ${metadata.volume}(${metadata.issue}), 1-10.`;
  };

  const getMLAReference = () => {
    if (!metadata) return '';
    const authors = metadata.authors.join(', ');
    return `"${metadata.title}." ${metadata.journal}, vol. ${metadata.volume}, no. ${metadata.issue}, ${metadata.year}, pp. 1-10.`;
  };

  const getReferenceText = () => {
    if (!metadata) return '';
    switch (referenceFormat) {
      case 'gbt7714': return getGB7714Reference();
      case 'bibtex': return getBibTeXReference();
      case 'apa': return getAPAReference();
      case 'mla': return getMLAReference();
      default: return '';
    }
  };

  const handleCopyReference = async () => {
    if (!metadata) return;
    try {
      await navigator.clipboard.writeText(getReferenceText());
      setCopiedReference(true);
      setTimeout(() => setCopiedReference(false), 2000);
    } catch (error) {
      console.error('Failed to copy reference:', error);
    }
  };

  const getShareText = () => {
    if (!metadata) return '';
    return `---
📖 论文：${metadata.title}
🔗 来源：${metadata.journal} (${metadata.year})
📍 DOI：${doi || 'N/A'}
💡 核心：${metadata.abstract.substring(0, 100)}...
---`;
  };

  const handleCopyShareText = async () => {
    if (!metadata) return;
    try {
      await navigator.clipboard.writeText(getShareText());
      setCopiedShareText(true);
      setTimeout(() => setCopiedShareText(false), 2000);
    } catch (error) {
      console.error('Failed to copy share text:', error);
    }
  };

  if (isCollapsed) {
    return (
      <div className="w-14 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col items-center py-4 gap-3 flex-shrink-0">
        <button
          onClick={onToggleCollapse}
          className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-all duration-200"
          title="展开论文信息"
        >
          <ChevronDown size={20} className="text-indigo-600 dark:text-indigo-400" />
        </button>
        {metadata && (
          <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center" title="已识别论文">
            <Check size={18} className="text-green-600 dark:text-green-400" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-[320px] bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col flex-shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-900 dark:text-slate-100">📄 论文信息</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            metadata ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
          }`}>
            {metadata ? '已识别' : (isExtracting ? '识别中...' : '待识别')}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onReExtract && (
            <button
              onClick={onReExtract}
              disabled={isExtracting}
              className={`p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-all duration-200 ${isExtracting ? 'animate-spin' : ''}`}
              title="重新提取"
            >
              <RefreshCw size={14} className="text-slate-500 dark:text-slate-400" />
            </button>
          )}
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-all duration-200"
            title="收起面板"
          >
            <X size={14} className="text-slate-500 dark:text-slate-400" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4 custom-scrollbar">
        {isExtracting ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="w-10 h-10 border-2 border-slate-200 dark:border-slate-700 border-t-indigo-600 dark:border-t-indigo-400 rounded-full animate-spin mb-3"></div>
            <span className="text-sm text-slate-500 dark:text-slate-400">🔍 正在自动识别文献信息...</span>
          </div>
        ) : metadata ? (
          <>
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">标题</h3>
                  <p className="text-sm text-slate-900 dark:text-slate-100 line-clamp-3">
                    {metadata.title}
                  </p>
                </div>
                {onToggleBookmark && metadata && (
          <button
            onClick={() => onToggleBookmark({
              title: metadata.title,
              authors: metadata.authors,
              journal: metadata.journal,
              year: metadata.year,
              volume: metadata.volume,
              issue: metadata.issue,
              keywords: metadata.keywords,
              codeLinks: metadata.codeLinks,
              paperType: metadata.paperType,
              abstract: metadata.abstract,
              arxivId: arxivId,
              doi: doi,
              journalUrl: null
            })}
            className={`p-2 rounded-lg transition-all duration-200 ${isBookmarked ? 'text-yellow-500' : 'text-slate-400 hover:text-yellow-500'}`}
            title={isBookmarked ? '取消收藏' : '收藏'}
          >
            {isBookmarked ? <Star size={18} fill="currentColor" /> : <StarOff size={18} />}
          </button>
        )}
              </div>

              <div>
                <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">作者</h3>
                <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2">
                  {metadata.authors.join('、')}
                </p>
              </div>

              <div>
                <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">期刊</h3>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  {metadata.journal}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <div>
                  <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">年份</h3>
                  <p className="text-xs text-slate-700 dark:text-slate-300">{metadata.year}</p>
                </div>
                <div>
                  <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">卷号</h3>
                  <p className="text-xs text-slate-700 dark:text-slate-300">{metadata.volume}</p>
                </div>
                <div>
                  <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">期号</h3>
                  <p className="text-xs text-slate-700 dark:text-slate-300">{metadata.issue}</p>
                </div>
                <div>
                  <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">类型</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    metadata.paperType === 'review' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' :
                    metadata.paperType === 'experimental' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' :
                    metadata.paperType === 'theoretical' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' :
                    'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}>
                    {metadata.paperType === 'review' ? '综述' :
                     metadata.paperType === 'experimental' ? '实验' :
                     metadata.paperType === 'theoretical' ? '理论' : '其他'}
                  </span>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">关键词</h3>
                <div className="flex flex-wrap gap-1.5">
                  {metadata.keywords.map((keyword, index) => (
                    <span
                      key={index}
                      className="text-xs px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-full"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
              <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">一键引用</h3>
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
                  {(['gbt7714', 'bibtex', 'apa', 'mla'] as const).map((format) => (
                    <button
                      key={format}
                      onClick={() => setReferenceFormat(format)}
                      className={`flex-shrink-0 py-1.5 px-2 text-xs font-medium transition-colors duration-200 ${
                        referenceFormat === format
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 border-b-2 border-indigo-600'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {format === 'gbt7714' ? 'GB/T' : format.toUpperCase()}
                    </button>
                  ))}
                </div>
                <div className="p-2.5 relative">
                  <pre className="text-[10px] font-mono text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap line-clamp-4">
                    {getReferenceText()}
                  </pre>
                  <button
                    onClick={handleCopyReference}
                    className={`absolute top-2 right-2 p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-all duration-200 ${copiedReference ? 'text-emerald-600' : 'text-slate-400'}`}
                    title="复制引用"
                  >
                    {copiedReference ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </div>
              </div>
            </div>



            <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
              <button
                onClick={handleCopyShareText}
                className="w-full flex items-center justify-between px-3 py-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-all duration-200"
              >
                <div className="flex items-center gap-1.5">
                  <Share2 size={14} className="text-indigo-600 dark:text-indigo-400" />
                  <span className="text-xs font-medium text-indigo-700 dark:text-indigo-400">生成分享文案</span>
                </div>
                <span className={`text-xs ${copiedShareText ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {copiedShareText ? '已复制' : '复制'}
                </span>
              </button>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
              <button
                onClick={onGeneratePaperPortrait}
                disabled={isGeneratingPortrait}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${
                  isGeneratingPortrait
                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:shadow-lg hover:shadow-indigo-600/30 hover:-translate-y-0.5'
                }`}
              >
                {isGeneratingPortrait ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>正在深度研读全文...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    <span>✨ 生成全篇画像</span>
                  </>
                )}
              </button>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center">
                基于全文核心内容生成深度学术总结
              </p>
            </div>
          </>
        ) : showManualInput ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              ⚠️ 自动识别超时，请手动输入论文标题
            </p>
            <input
              type="text"
              value={manualTitle}
              onChange={(e) => onManualTitleChange?.(e.target.value)}
              placeholder="请输入论文标题..."
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-xs text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={onManualConfirm}
              disabled={!manualTitle.trim()}
              className="w-full px-3 py-2 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              确认
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              📚 上传 PDF 后自动识别论文信息
            </p>
            {onReExtract && (
              <button
                onClick={onReExtract}
                className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all duration-200"
              >
                手动提取
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
