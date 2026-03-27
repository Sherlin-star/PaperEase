import React from 'react';
import { Target, Zap, TrendingUp, AlertTriangle, Flame, CheckCircle } from 'lucide-react';

interface PortraitItem {
  title: string;
  description: string;
  page?: number;
}

interface PortraitSection {
  items: PortraitItem[];
  icon: React.ReactNode;
  title: string;
  bgColor: string;
  iconColor: string;
}

interface PaperPortraitProps {
  portrait: string;
  onJumpToPage?: (pageNumber: number) => void;
  sidebarWidth?: number;
}

function cleanText(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/###/g, '')
    .replace(/##/g, '')
    .replace(/#/g, '')
    .replace(/`/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

function parsePaperPortrait(text: string) {
  const sections = {
    coreContribution: [] as PortraitItem[],
    methodInnovation: [] as PortraitItem[],
    experimentalResults: [] as PortraitItem[],
    limitations: [] as PortraitItem[],
    critique: [] as PortraitItem[]
  };
  
  const lines = text.split('\n');
  let currentSection: keyof typeof sections | null = null;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    if (trimmedLine.includes('核心贡献')) {
      currentSection = 'coreContribution';
    } else if (trimmedLine.includes('方法创新')) {
      currentSection = 'methodInnovation';
    } else if (trimmedLine.includes('实验结果')) {
      currentSection = 'experimentalResults';
    } else if (trimmedLine.includes('局限性')) {
      currentSection = 'limitations';
    } else if (trimmedLine.includes('吐槽')) {
      currentSection = 'critique';
    } else if (trimmedLine.startsWith('- ') && currentSection) {
      const content = trimmedLine.substring(2);
      
      const pageMatch = content.match(/\[P(\d+)\]/);
      const page = pageMatch ? parseInt(pageMatch[1]) : undefined;
      
      const contentWithoutPage = content.replace(/\[P\d+\]/g, '').trim();
      
      const colonIndex = contentWithoutPage.indexOf(':');
      let title = '';
      let description = '';
      
      if (colonIndex !== -1) {
        title = cleanText(contentWithoutPage.substring(0, colonIndex).trim());
        description = cleanText(contentWithoutPage.substring(colonIndex + 1).trim());
      } else {
        title = cleanText(contentWithoutPage);
        description = '';
      }
      
      sections[currentSection].push({ title, description, page });
    }
  }
  
  return sections;
}

function PortraitCard({ section, onJumpToPage }: { section: PortraitSection; onJumpToPage?: (page: number) => void }) {
  if (section.items.length === 0) return null;
  
  return (
    <div 
      className={`p-5 rounded-xl transition-all duration-200 ${section.bgColor}`}
      style={{ boxShadow: '0 4px 20px -5px rgba(0,0,0,0.05)' }}
    >
      <div className="flex items-center gap-2.5 mb-4">
        <span className={section.iconColor}>{section.icon}</span>
        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{section.title}</span>
      </div>
      <div className="space-y-3">
        {section.items.map((item, index) => (
          <div 
            key={index} 
            className="bg-white/80 dark:bg-slate-800/80 rounded-lg p-4 hover:bg-white dark:hover:bg-slate-800 transition-all duration-200"
            style={{ boxShadow: '0 2px 8px -2px rgba(0,0,0,0.03)' }}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-start gap-2.5 flex-1">
                <CheckCircle size={14} className="text-emerald-500 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-[1.6]">
                  {item.title}
                </span>
              </div>
              {item.page && (
                <button
                  onClick={() => onJumpToPage?.(item.page!)}
                  className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-full text-xs font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors cursor-pointer flex-shrink-0"
                  title={`跳转到第 ${item.page} 页`}
                >
                  P{item.page}
                </button>
              )}
            </div>
            {item.description && (
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-[1.6] pl-7">
                {item.description}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PaperPortrait({ portrait, onJumpToPage, sidebarWidth = 480 }: PaperPortraitProps) {
  const sections = parsePaperPortrait(portrait);
  
  const isWide = sidebarWidth >= 500;
  const gap = isWide ? 'gap-5' : 'gap-4';
  
  const sectionConfigs: Array<{ key: keyof typeof sections; config: PortraitSection }> = [
    {
      key: 'coreContribution',
      config: {
        items: sections.coreContribution,
        icon: <Target size={16} />,
        title: '核心贡献',
        bgColor: 'bg-gradient-to-br from-emerald-50 via-emerald-50/80 to-white dark:from-emerald-900/20 dark:via-emerald-900/10 dark:to-transparent',
        iconColor: 'text-emerald-600 dark:text-emerald-400'
      }
    },
    {
      key: 'methodInnovation',
      config: {
        items: sections.methodInnovation,
        icon: <Zap size={14} />,
        title: '方法创新',
        bgColor: 'bg-gradient-to-br from-blue-50 via-blue-50/60 to-white dark:from-blue-900/15 dark:via-blue-900/5 dark:to-transparent',
        iconColor: 'text-blue-600 dark:text-blue-400'
      }
    },
    {
      key: 'experimentalResults',
      config: {
        items: sections.experimentalResults,
        icon: <TrendingUp size={14} />,
        title: '实验结果',
        bgColor: 'bg-gradient-to-br from-purple-50 via-purple-50/60 to-white dark:from-purple-900/15 dark:via-purple-900/5 dark:to-transparent',
        iconColor: 'text-purple-600 dark:text-purple-400'
      }
    },
    {
      key: 'limitations',
      config: {
        items: sections.limitations,
        icon: <AlertTriangle size={14} />,
        title: '局限性',
        bgColor: 'bg-gradient-to-br from-amber-50 via-amber-50/60 to-white dark:from-amber-900/15 dark:via-amber-900/5 dark:to-transparent',
        iconColor: 'text-amber-600 dark:text-amber-400'
      }
    },
    {
      key: 'critique',
      config: {
        items: sections.critique,
        icon: <Flame size={16} />,
        title: '学术吐槽',
        bgColor: 'bg-gradient-to-br from-red-50 via-red-50/80 to-white dark:from-red-900/20 dark:via-red-900/10 dark:to-transparent',
        iconColor: 'text-red-600 dark:text-red-400'
      }
    }
  ];
  
  const hasCoreContribution = sections.coreContribution.length > 0;
  const hasMethodAndResults = sections.methodInnovation.length > 0 || sections.experimentalResults.length > 0;
  
  return (
    <div className={`space-y-${isWide ? '5' : '4'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target size={18} className="text-indigo-600 dark:text-indigo-400" />
          <span className="text-base font-bold text-slate-900 dark:text-slate-100">情报摘要</span>
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400">点击页码跳转</span>
      </div>
      
      {hasCoreContribution && (
        <div className={`grid ${gap} ${isWide ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <PortraitCard 
            section={sectionConfigs[0].config} 
            onJumpToPage={onJumpToPage}
          />
          
          {hasMethodAndResults && isWide && (
            <>
              <PortraitCard 
                section={sectionConfigs[1].config}
                onJumpToPage={onJumpToPage}
              />
              <PortraitCard 
                section={sectionConfigs[2].config}
                onJumpToPage={onJumpToPage}
              />
            </>
          )}
        </div>
      )}
      
      {!hasCoreContribution && hasMethodAndResults && (
        <div className={`grid ${gap} ${isWide ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <PortraitCard 
            section={sectionConfigs[1].config}
            onJumpToPage={onJumpToPage}
          />
          <PortraitCard 
            section={sectionConfigs[2].config}
            onJumpToPage={onJumpToPage}
          />
        </div>
      )}
      
      {hasMethodAndResults && !isWide && hasCoreContribution && (
        <>
          <PortraitCard 
            section={sectionConfigs[1].config}
            onJumpToPage={onJumpToPage}
          />
          <PortraitCard 
            section={sectionConfigs[2].config}
            onJumpToPage={onJumpToPage}
          />
        </>
      )}
      
      <PortraitCard 
        section={sectionConfigs[3].config}
        onJumpToPage={onJumpToPage}
      />
      
      <PortraitCard 
        section={sectionConfigs[4].config}
        onJumpToPage={onJumpToPage}
      />
    </div>
  );
}
