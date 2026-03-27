import React from 'react';
import { generateDocx, generateExportFileName } from '../services/docxGenerator';

interface ExportControlsProps {
  originalFileName: string;
  translationModel: string;
  pages: any[];
  onExportStart: () => void;
  onExportComplete: () => void;
}

const ExportControls: React.FC<ExportControlsProps> = ({ 
  originalFileName, 
  translationModel, 
  pages, 
  onExportStart, 
  onExportComplete 
}) => {
  const handleExportDocx = async () => {
    onExportStart();
    try {
      const fileName = generateExportFileName(originalFileName, translationModel, 'docx');
      const blob = await generateDocx(pages);
      downloadFile(blob, fileName);
    } catch (error) {
      console.error('导出 Word 失败:', error);
    } finally {
      onExportComplete();
    }
  };

  const handleExportPdf = async () => {
    onExportStart();
    try {
      // 先生成 Word 文档
      const docxBlob = await generateDocx(pages);
      
      // 使用浏览器打印功能转换为 PDF
      // 实际实现可能需要使用更专业的库
      const fileName = generateExportFileName(originalFileName, translationModel, 'pdf');
      
      // 这里简化处理，实际应用中可能需要更复杂的 PDF 转换逻辑
      downloadFile(docxBlob, fileName.replace('.pdf', '.docx'));
      alert('PDF 导出功能需要进一步实现');
    } catch (error) {
      console.error('导出 PDF 失败:', error);
    } finally {
      onExportComplete();
    }
  };

  const downloadFile = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="export-controls flex gap-4 p-4 bg-white rounded-lg shadow-md">
      <button
        onClick={handleExportDocx}
        className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      >
        导出 Word
      </button>
      <button
        onClick={handleExportPdf}
        className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
      >
        导出 PDF
      </button>
    </div>
  );
};

export default ExportControls;
