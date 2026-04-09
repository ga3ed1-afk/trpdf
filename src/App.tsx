import React, { useState, useRef, useEffect } from 'react';
import { 
  FileText, 
  Upload, 
  Languages, 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  Info, 
  Edit3, 
  Columns, 
  Sparkles, 
  X, 
  Bold, 
  Italic, 
  List, 
  ListOrdered, 
  Heading1, 
  Heading2, 
  Quote, 
  Link,
  Undo2,
  Redo2,
  Type,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Palette,
  Search,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  Image as ImageIcon,
  PanelsTopLeft,
  ChevronDown,
  Settings2,
  AlignJustify,
  Maximize
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { marked } from 'marked';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Document, Packer, Paragraph, TextRun, AlignmentType, PageOrientation } from 'docx';
import PptxGenJS from 'pptxgenjs';
import { cn } from '@/src/lib/utils';

// PDF.js worker setup
import * as pdfjsLib from 'pdfjs-dist';
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

const LANGUAGES = [
  { code: 'ar', name: 'العربية' },
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'de', name: 'Deutsch' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'zh', name: '中文' },
];

const MODELS = [
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (سريع)', credits: 2 },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (دقيق)', credits: 5 },
];

const ARABIC_FONTS = [
  { id: 'Noto Sans Arabic', name: 'نوتو سانز' },
  { id: 'Cairo', name: 'كايرو' },
  { id: 'Amiri', name: 'الأميري' },
  { id: 'Tajawal', name: 'تجول' },
  { id: 'Almarai', name: 'المراعي' },
  { id: 'Vazirmatn', name: 'وزير متن' },
  { id: 'Harmattan', name: 'هرمتان' },
];

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('ar');
  const [selectedModel, setSelectedModel] = useState(MODELS[0]);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translatedContent, setTranslatedContent] = useState<string>('');
  const [viewMode, setViewMode] = useState<'original' | 'split' | 'translation'>('split');
  const [zoom, setZoom] = useState(100);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [fontSize, setFontSize] = useState(16);
  const [lineHeight, setLineHeight] = useState(1.625);
  const [pageMargin, setPageMargin] = useState('20mm');
  const [selectedFont, setSelectedFont] = useState(ARABIC_FONTS.find(f => f.id === 'Amiri') || ARABIC_FONTS[0]);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [htmlPreview, setHtmlPreview] = useState<string>('');
  const [pageDimensions, setPageDimensions] = useState({ width: 794, height: 1123 }); // Default A4 at 96 DPI

  useEffect(() => {
    const parseMarkdown = async () => {
      if (translatedContent) {
        if (translatedContent.trim().startsWith('<')) {
          setHtmlPreview(translatedContent);
        } else {
          const parsed = await marked.parse(translatedContent);
          setHtmlPreview(parsed as string);
        }
      } else {
        setHtmlPreview('');
      }
    };
    parseMarkdown();
  }, [translatedContent]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  // Update history when content changes
  useEffect(() => {
    if (isEditing && translatedContent !== history[historyIndex]) {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(translatedContent);
      if (newHistory.length > 50) newHistory.shift(); // Limit history
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  }, [translatedContent, isEditing]);

  const undo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setTranslatedContent(history[newIndex]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setTranslatedContent(history[newIndex]);
    }
  };

  const execCommand = (command: string, value: string = '') => {
    if (editorRef.current) {
      editorRef.current.focus();
    }
    document.execCommand(command, false, value);
    updateContent();
  };

  const updateContent = () => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      setTranslatedContent(html);
      return html;
    }
    return translatedContent;
  };

  const toggleEdit = async () => {
    if (!isEditing) {
      // Entering edit mode: convert Markdown to HTML
      const htmlContent = await marked.parse(translatedContent);
      setTranslatedContent(htmlContent);
      setIsEditing(true);
    } else {
      // Exiting edit mode: content is already HTML
      updateContent();
      setIsEditing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      const url = URL.createObjectURL(selectedFile);
      setPdfUrl(url);
      setCurrentPage(1);
      setTranslatedContent('');
      setError(null);
    } else {
      setError('يرجى اختيار ملف PDF صالح.');
    }
  };

  // Load PDF document when URL changes
  useEffect(() => {
    if (!pdfUrl) {
      setPdfDoc(null);
      setNumPages(0);
      return;
    }

    const loadingTask = pdfjsLib.getDocument(pdfUrl);
    loadingTask.promise.then(pdf => {
      setPdfDoc(pdf);
      setNumPages(pdf.numPages);
      setCurrentPage(1);
    }).catch(err => {
      console.error('Error loading PDF:', err);
      setError('فشل في تحميل ملف PDF.');
    });

    return () => {
      loadingTask.destroy();
    };
  }, [pdfUrl]);

  useEffect(() => {
    let isCancelled = false;
    if (pdfDoc) {
      renderPage(currentPage, isCancelled);
    }
    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [pdfDoc, currentPage]);

  const renderPage = async (pageNum: number, isCancelled?: boolean) => {
    if (!pdfDoc || !canvasRef.current) return;

    try {
      // Cancel any existing render task and wait for it to finish
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        try {
          await renderTaskRef.current.promise;
        } catch (e) {
          // Ignore cancellation errors
        }
      }

      const page = await pdfDoc.getPage(pageNum);
      if (isCancelled) return;
      
      // Get actual viewport scaled to CSS pixels (96dpi) to represent true physical size on screen
      const cssScale = 96 / 72;
      const baseViewport = page.getViewport({ scale: cssScale });
      
      // Update state with the true dimensions of the PDF page in CSS pixels
      setPageDimensions({ width: baseViewport.width, height: baseViewport.height });

      // Render at high resolution for crispness (e.g., 2x of the CSS size)
      const renderScale = cssScale * 2;
      const scaledViewport = page.getViewport({ scale: renderScale });
      
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return;

      // Explicitly clear canvas and reset dimensions to prevent ghosting/overlap
      context.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      canvas.style.width = `${baseViewport.width}px`;
      canvas.style.height = `${baseViewport.height}px`;
      canvas.style.display = 'block';
      
      context.fillStyle = 'white';
      context.fillRect(0, 0, canvas.width, canvas.height);

      const renderContext = {
        canvasContext: context,
        viewport: scaledViewport,
        canvas: canvas,
      };
      
      const renderTask = page.render(renderContext);
      renderTaskRef.current = renderTask;
      
      await renderTask.promise;
      if (!isCancelled) {
        renderTaskRef.current = null;
      }
    } catch (err: any) {
      if (err.name === 'RenderingCancelledException' || err.message === 'cancelled') {
        return;
      }
      console.error('Error rendering PDF:', err);
      setError('فشل في عرض ملف PDF.');
    }
  };

  const translatePDF = async () => {
    if (!file) return;
    setIsTranslating(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      // Convert file to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.readAsDataURL(file);
      });

      const base64Data = await base64Promise;

      const prompt = `Translate this PDF document to ${targetLang}. 
      CRITICAL: Return ONLY the translated text in clean Markdown format. 
      DO NOT include any introductory or concluding text (like "Here is the translation" or "Translation:").
      DO NOT wrap the output in markdown code blocks (like \`\`\`markdown or \`\`\`).
      Maintain the original structure, headers, and tables.
      If the source language is not specified, detect it automatically.
      Ensure the translation is natural and professional.`;

      const response = await ai.models.generateContent({
        model: selectedModel.id,
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { data: base64Data, mimeType: "application/pdf" } }
            ]
          }
        ],
      });

      if (response.text) {
        // Clean up the response text
        let cleanText = response.text.trim();
        
        // Remove markdown code block wrappers
        if (cleanText.startsWith('```')) {
          cleanText = cleanText.replace(/^```[a-z]*\n?/i, '');
          cleanText = cleanText.replace(/\n?```$/i, '');
        }
        
        // Remove common AI prefixes (case insensitive)
        const prefixesToRemove = [
          /^translation:\s*/i,
          /^here is the translation:?\s*/i,
          /^translated text:?\s*/i,
          /^الترجمة:\s*/,
          /^إليك الترجمة:\s*/,
          /^تفضل الترجمة:\s*/
        ];
        
        prefixesToRemove.forEach(regex => {
          cleanText = cleanText.replace(regex, '');
        });

        // Remove backslashes used for escaping markdown characters (e.g. \*, \_, \#)
        // This is common when AI models try to be too safe with markdown
        cleanText = cleanText.replace(/\\([*_#\[\]()])/g, '$1');
        
        // Remove any leading/trailing markdown code block markers if they still exist
        cleanText = cleanText.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '');
        
        setTranslatedContent(cleanText.trim());
        setViewMode('split');
      } else {
        throw new Error('لم يتم استلام أي نص من النموذج.');
      }
    } catch (err: any) {
      console.error('Translation error:', err);
      setError('حدث خطأ أثناء الترجمة: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setIsTranslating(false);
    }
  };

  const downloadAs = async (format: 'pdf' | 'docx' | 'txt' | 'jpg' | 'ppt' | 'md') => {
    const currentContent = updateContent();
    if (!currentContent) return;
    setIsDownloading(true);
    setShowDownloadMenu(false);
    setError(null); // Clear any previous errors

    const fileName = file?.name.split('.')[0] || 'translated_document';

    try {
      // Ensure we have HTML content for processing
      let htmlContent = currentContent;
      // If it doesn't look like HTML (no tags), it's probably Markdown
      if (!currentContent.trim().startsWith('<')) {
        htmlContent = await marked.parse(currentContent) as string;
      }

      if (format === 'md') {
        const blob = new Blob([translatedContent], { type: 'text/markdown' });
        saveBlob(blob, `${fileName}.md`);
      } else if (format === 'txt') {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        const text = tempDiv.textContent || tempDiv.innerText || '';
        const blob = new Blob([text], { type: 'text/plain' });
        saveBlob(blob, `${fileName}.txt`);
      } else if (format === 'docx') {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        
        const element = document.getElementById('translation-content');
        const actualHeight = element ? Math.max(pageDimensions.height, element.scrollHeight) : pageDimensions.height;
        
        const marginMm = parseInt(pageMargin.replace('mm', '')) || 20;
        const marginTwips = Math.round(marginMm * 56.7);
        const widthTwips = Math.round(pageDimensions.width * 15);
        const heightTwips = Math.round(actualHeight * 15);
        const docxFontSize = Math.round(fontSize * 1.5); // 1px = 0.75pt, docx size is half-points
        const docxLineHeight = Math.round(240 * lineHeight);
        
        const children: Paragraph[] = [];
        
        const parseToTextRuns = (element: Node, defaultSize: number): TextRun[] => {
          const runs: TextRun[] = [];
          const walk = (node: Node, format: any) => {
            if (node.nodeType === Node.TEXT_NODE) {
              const text = node.textContent;
              if (text) {
                // Ignore purely whitespace nodes that contain newlines (HTML formatting artifacts)
                if (text.trim() === '' && text.includes('\n')) return;
                
                runs.push(new TextRun({
                  text: text,
                  rightToLeft: true,
                  font: selectedFont.name, // Use the actual font name so Word recognizes it
                  size: format.size || defaultSize,
                  bold: format.bold,
                  italics: format.italic,
                  underline: format.underline ? {} : undefined,
                }));
              }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              const el = node as HTMLElement;
              if (el.tagName === 'BR') {
                runs.push(new TextRun({ break: 1 }));
                return;
              }
              const newFormat = { ...format };
              if (el.tagName === 'B' || el.tagName === 'STRONG' || el.style.fontWeight === 'bold') newFormat.bold = true;
              if (el.tagName === 'I' || el.tagName === 'EM' || el.style.fontStyle === 'italic') newFormat.italic = true;
              if (el.tagName === 'U' || el.style.textDecoration === 'underline') newFormat.underline = true;
              if (el.tagName.startsWith('H')) newFormat.size = Math.round(defaultSize * 1.5);
              el.childNodes.forEach(child => walk(child, newFormat));
            }
          };
          walk(element, {});
          return runs;
        };

        const processNodeForDocx = (node: Node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (el.tagName === 'UL' || el.tagName === 'OL') {
              Array.from(el.childNodes).forEach(processNodeForDocx);
              return;
            }
          }

          let alignment: any = AlignmentType.RIGHT;
          let isHeading = false;
          let isListItem = false;

          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            isHeading = el.tagName.startsWith('H');
            isListItem = el.tagName === 'LI';
            const textAlign = el.style.textAlign || el.getAttribute('align');
            if (textAlign === 'center') alignment = AlignmentType.CENTER;
            else if (textAlign === 'left') alignment = AlignmentType.LEFT;
            else if (textAlign === 'justify') alignment = AlignmentType.JUSTIFIED;
          }

          const runs = parseToTextRuns(node, docxFontSize);
          
          if (runs.length > 0) {
            children.push(new Paragraph({
              alignment: alignment,
              bidirectional: true,
              spacing: { before: isHeading ? 400 : 0, after: isHeading ? 200 : 0, line: docxLineHeight },
              bullet: isListItem ? { level: 0 } : undefined,
              children: runs,
            }));
          }
        };

        Array.from(tempDiv.childNodes).forEach(processNodeForDocx);

        const doc = new Document({
          sections: [{
            properties: {
              page: {
                size: { width: widthTwips, height: heightTwips },
                margin: { top: marginTwips, right: marginTwips, bottom: marginTwips, left: marginTwips },
              },
            },
            children: children,
          }],
        });
        const blob = await Packer.toBlob(doc);
        saveBlob(blob, `${fileName}.docx`);
      } else if (format === 'pdf' || format === 'jpg') {
        const element = document.getElementById('translation-content');
        if (!element) {
          throw new Error('لم يتم العثور على محتوى الترجمة. يرجى التأكد من عرض صفحة الترجمة.');
        }

        console.log('Starting capture for', format);
        
        // Prepare for capture
        const originalHeight = element.style.height;
        const originalWidth = element.style.width;
        const originalMinHeight = element.style.minHeight;
        const originalTransform = element.style.transform;
        
        // Force exact dimensions for capture
        element.style.width = `${pageDimensions.width}px`;
        element.style.height = `${pageDimensions.height}px`;
        element.style.minHeight = 'auto';
        element.style.overflow = 'hidden';
        element.style.transform = 'none';
        
        // Give the browser a moment to reflow
        await new Promise(resolve => setTimeout(resolve, 300));
        
        try {
          const canvas = await html2canvas(element, { 
            scale: 2, // Higher quality
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            onclone: (clonedDoc) => {
              // Aggressively replace oklch in all style tags
              const styleTags = clonedDoc.getElementsByTagName('style');
              for (let i = 0; i < styleTags.length; i++) {
                try {
                  if (styleTags[i].innerHTML.includes('oklch')) {
                    styleTags[i].innerHTML = styleTags[i].innerHTML.replace(/oklch\([^)]+\)/g, 'rgb(31, 41, 55)');
                  }
                } catch (e) {
                  console.warn('Could not modify style tag', e);
                }
              }

              const clonedElement = clonedDoc.getElementById('translation-content');
              if (clonedElement) {
                clonedElement.style.width = `${pageDimensions.width}px`;
                clonedElement.style.height = `${pageDimensions.height}px`;
                clonedElement.style.minHeight = 'auto';
                clonedElement.style.overflow = 'hidden';
                clonedElement.style.transform = 'none';
                clonedElement.style.boxShadow = 'none';
                clonedElement.style.padding = pageMargin;
                
                // Fix all children
                const allElements = clonedElement.getElementsByTagName('*');
                for (let i = 0; i < allElements.length; i++) {
                  const el = allElements[i] as HTMLElement;
                  
                  // Fix colors
                  const computed = window.getComputedStyle(el);
                  if (computed.color.includes('oklch')) el.style.color = 'rgb(31, 41, 55)';
                  if (computed.backgroundColor.includes('oklch')) el.style.backgroundColor = 'transparent';
                }
              }
            }
          });
          
          // Restore original styles
          element.style.height = originalHeight;
          element.style.width = originalWidth;
          element.style.minHeight = originalMinHeight;
          element.style.overflow = '';
          element.style.transform = originalTransform;

          if (format === 'pdf') {
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            
            // Calculate dimensions in mm (assuming 96 dpi)
            const pxToMm = 25.4 / 96;
            const pdfWidth = (canvas.width / 2) * pxToMm;
            const pdfHeight = (canvas.height / 2) * pxToMm;

            const pdf = new jsPDF({
              orientation: pdfWidth > pdfHeight ? 'l' : 'p',
              unit: 'mm',
              format: [pdfWidth, pdfHeight]
            });
            
            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`${fileName}.pdf`);
          } else {
            canvas.toBlob((blob) => {
              if (blob) saveBlob(blob, `${fileName}.jpg`);
            }, 'image/jpeg', 0.95);
          }
        } catch (canvasErr) {
          console.error('Canvas capture error:', canvasErr);
          element.style.height = originalHeight;
          element.style.width = originalWidth;
          element.style.minHeight = originalMinHeight;
          element.style.overflow = '';
          element.style.transform = originalTransform;
          throw new Error('فشل في التقاط محتوى الصفحة. يرجى المحاولة مرة أخرى.');
        }
      } else if (format === 'ppt') {
        const pptx = new PptxGenJS();
        
        const pptWidth = pageDimensions.width / 96;
        const pptHeight = pageDimensions.height / 96;
        const marginInches = (parseInt(pageMargin.replace('mm', '')) || 20) / 25.4;
        
        pptx.defineLayout({ name: 'CUSTOM', width: pptWidth, height: pptHeight });
        pptx.layout = 'CUSTOM';
        let slide = pptx.addSlide();
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        
        let currentY = marginInches;
        const contentWidth = pptWidth - (marginInches * 2);
        
        const pptxFontSize = Math.round(fontSize * 0.75); // Convert CSS px to points for PPTX
        
        const parseToPptxText = (element: Node, defaultSize: number): any[] => {
          const runs: any[] = [];
          const walk = (node: Node, format: any) => {
            if (node.nodeType === Node.TEXT_NODE) {
              const text = node.textContent;
              if (text) {
                if (text.trim() === '' && text.includes('\n')) return;
                runs.push({
                  text: text,
                  options: {
                    fontFace: selectedFont.name,
                    fontSize: format.size || defaultSize,
                    bold: format.bold,
                    italic: format.italic,
                    underline: format.underline,
                    rtlMode: true,
                  }
                });
              }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              const el = node as HTMLElement;
              if (el.tagName === 'BR') {
                runs.push({ text: '\n' });
                return;
              }
              const newFormat = { ...format };
              if (el.tagName === 'B' || el.tagName === 'STRONG' || el.style.fontWeight === 'bold') newFormat.bold = true;
              if (el.tagName === 'I' || el.tagName === 'EM' || el.style.fontStyle === 'italic') newFormat.italic = true;
              if (el.tagName === 'U' || el.style.textDecoration === 'underline') newFormat.underline = true;
              if (el.tagName.startsWith('H')) newFormat.size = Math.round(defaultSize * 1.5);
              el.childNodes.forEach(child => walk(child, newFormat));
            }
          };
          walk(element, {});
          return runs;
        };

        const processNodeForPptx = (node: Node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (el.tagName === 'UL' || el.tagName === 'OL') {
              Array.from(el.childNodes).forEach(processNodeForPptx);
              return;
            }
          }

          let alignment: any = 'right';
          let isHeading = false;
          let isListItem = false;

          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            isHeading = el.tagName.startsWith('H');
            isListItem = el.tagName === 'LI';
            const textAlign = el.style.textAlign || el.getAttribute('align');
            if (textAlign === 'center') alignment = 'center';
            else if (textAlign === 'left') alignment = 'left';
            else if (textAlign === 'justify') alignment = 'justify';
          }

          const runs = parseToPptxText(node, pptxFontSize);
          
          if (runs.length > 0) {
            const height = isHeading ? 0.6 : 0.4;
            
            slide.addText(runs, { 
              x: marginInches + (isListItem ? 0.2 : 0), 
              y: currentY, 
              w: contentWidth - (isListItem ? 0.2 : 0), 
              h: height, 
              align: alignment as any, 
              rtlMode: true,
              valign: 'top',
              bullet: isListItem ? true : false,
            });
            
            currentY += height + (lineHeight * 0.1);
          }
        };

        Array.from(tempDiv.childNodes).forEach(processNodeForPptx);
        
        await pptx.writeFile({ fileName: `${fileName}.pptx` });
      }
    } catch (err: any) {
      console.error('Download error:', err);
      setError('حدث خطأ أثناء التنزيل: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setIsDownloading(false);
    }
  };

  const saveBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-screen w-full flex-col bg-white font-sans text-gray-900" dir="rtl">
      {/* Header */}
      <header className="relative z-50 flex h-12 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 shadow-sm">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              setFile(null);
              setPdfUrl(null);
              setTranslatedContent('');
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
            title="العودة"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 text-white shadow-sm">
              <Languages className="h-3.5 w-3.5" />
            </div>
            <h1 className="text-base font-bold tracking-tight text-gray-900 hidden sm:block">مترجم المستندات</h1>
          </div>
        </div>

        {file && (
          <div className="flex items-center gap-4 flex-1 justify-center max-w-3xl">
            {/* File Name */}
            <div className="flex items-center gap-2 overflow-hidden bg-gray-50/80 px-3 py-1.5 rounded-lg border border-gray-100 hidden md:flex min-w-[120px] max-w-[200px]">
              <div className="flex shrink-0 h-5 w-5 items-center justify-center rounded bg-red-100 text-red-600">
                <FileText className="h-3 w-3" />
              </div>
              <span className="truncate text-xs text-gray-700 font-medium" title={file.name}>
                {file.name}
              </span>
            </div>

            {/* PDF Navigation & Unified Zoom */}
            <div className="flex items-center gap-2 bg-gray-50/80 p-1 rounded-lg border border-gray-100">
              <div className="flex items-center gap-1 bg-white rounded-md px-1 py-0.5 shadow-sm border border-gray-100">
                <button 
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage <= 1}
                  className="rounded p-0.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs font-bold text-gray-700 min-w-[40px] text-center">
                  {currentPage} / {numPages}
                </span>
                <button 
                  onClick={() => setCurrentPage(Math.min(numPages, currentPage + 1))}
                  disabled={currentPage >= numPages}
                  className="rounded p-0.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
              </div>
              
              <div className="w-px h-4 bg-gray-200"></div>
              
              <div className="flex items-center gap-1 bg-white rounded-md px-1 py-0.5 shadow-sm border border-gray-100">
                <button onClick={() => setZoom(Math.max(50, zoom - 10))} className="rounded p-0.5 text-gray-500 hover:bg-gray-100 transition-colors" title="تصغير">
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span className="w-10 text-center text-xs font-bold text-gray-700">{zoom}%</span>
                <button onClick={() => setZoom(Math.min(200, zoom + 10))} className="rounded p-0.5 text-gray-500 hover:bg-gray-100 transition-colors" title="تكبير">
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Language Selection */}
            <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-100 bg-gray-50/80 px-2 py-1 text-gray-700">
              <span className="text-xs font-semibold">
                {LANGUAGES.find(l => l.code === sourceLang)?.name || 'تلقائي'}
              </span>
              <ArrowLeft className="h-3 w-3 text-gray-400 rotate-180" />
              <span className="text-xs font-semibold text-blue-600">
                {LANGUAGES.find(l => l.code === targetLang)?.name}
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 w-8 sm:w-auto">
          {/* Empty space to balance header */}
        </div>
      </header>

      {file && (
        <nav className="z-40 flex h-12 shrink-0 items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 shadow-sm">
          {/* Left: View Modes */}
          <div className="flex items-center gap-3">
            <div className="flex rounded-md bg-gray-100/70 p-0.5">
              <button 
                onClick={() => setViewMode('original')}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs border transition-all",
                  viewMode === 'original' ? "border-blue-300 bg-blue-100/70 font-semibold text-blue-500" : "border-transparent text-gray-600 hover:text-gray-700"
                )}
              >
                <FileText className="h-3 w-3" />
                <span className="hidden xl:inline">الأصلي</span>
              </button>
              <button 
                onClick={() => setViewMode('split')}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs border transition-all",
                  viewMode === 'split' ? "border-blue-300 bg-blue-100/70 font-semibold text-blue-500" : "border-transparent text-gray-600 hover:text-gray-700"
                )}
              >
                <Columns className="h-3 w-3" />
                <span className="hidden xl:inline">مقارنة</span>
              </button>
              <button 
                onClick={() => setViewMode('translation')}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs border transition-all",
                  viewMode === 'translation' ? "border-blue-300 bg-blue-100/70 font-semibold text-blue-500" : "border-transparent text-gray-600 hover:text-gray-700"
                )}
              >
                <Sparkles className="h-3 w-3" />
                <span className="hidden xl:inline">الترجمة</span>
              </button>
            </div>
          </div>

          {/* Center: Editing Tools (Only if translated content exists) */}
          {translatedContent && (
            <div className="flex flex-1 items-center justify-center gap-2 overflow-hidden">
              <div className={cn(
                "flex items-center gap-1.5 rounded-xl px-3 py-1.5 transition-all duration-300",
                isEditing ? "bg-blue-50 border border-blue-100 shadow-sm" : "bg-gray-50/50 border border-transparent"
              )}>
                {/* Undo/Redo */}
                <div className="flex items-center gap-0.5" dir="ltr">
                  <button onClick={undo} disabled={historyIndex <= 0} className="p-1.5 rounded-lg hover:bg-white text-gray-600 disabled:opacity-20 transition-colors"><Undo2 className="h-4 w-4" /></button>
                  <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-1.5 rounded-lg hover:bg-white text-gray-600 disabled:opacity-20 transition-colors"><Redo2 className="h-4 w-4" /></button>
                </div>
                
                <div className="h-5 w-px bg-gray-200 mx-1"></div>

                {/* Font & Size */}
                <div className="flex items-center gap-2">
                  <select 
                    value={selectedFont.id}
                    onChange={(e) => {
                      const font = ARABIC_FONTS.find(f => f.id === e.target.value);
                      if (font) setSelectedFont(font);
                    }}
                    className="text-sm font-bold bg-transparent border-none outline-none cursor-pointer hover:text-blue-600"
                  >
                    {ARABIC_FONTS.map(font => (
                      <option key={font.id} value={font.id}>{font.name}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-0.5 bg-white/50 rounded-lg p-0.5" dir="ltr">
                    <button onClick={() => setFontSize(prev => Math.min(48, prev + 2))} className="p-1 rounded hover:bg-white text-gray-600 transition-colors" title="تكبير النص"><ZoomIn className="h-3.5 w-3.5" /></button>
                    <span className="text-xs font-bold w-6 text-center">{fontSize}</span>
                    <button onClick={() => setFontSize(prev => Math.max(10, prev - 2))} className="p-1 rounded hover:bg-white text-gray-600 transition-colors" title="تصغير النص"><ZoomOut className="h-3.5 w-3.5" /></button>
                  </div>
                </div>

                <div className="h-5 w-px bg-gray-200 mx-1"></div>

                {/* Line Spacing & Margins */}
                <div className="flex items-center gap-2">
                  <div className="relative group">
                    <button className="flex items-center gap-1 p-1.5 rounded-lg hover:bg-white text-gray-600 transition-colors" title="التباعد بين السطور">
                      <AlignJustify className="h-4 w-4" />
                      <span className="text-xs font-bold">{lineHeight}</span>
                    </button>
                    <div className="absolute top-full right-0 mt-1 hidden group-hover:flex flex-col bg-white border border-gray-100 shadow-lg rounded-lg p-1 z-50">
                      {[1.0, 1.25, 1.5, 1.625, 2.0].map(val => (
                        <button key={val} onClick={() => setLineHeight(val)} className={cn("px-3 py-1.5 text-xs text-right rounded hover:bg-gray-50", lineHeight === val && "bg-blue-50 text-blue-600 font-bold")}>
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="relative group">
                    <button className="flex items-center gap-1 p-1.5 rounded-lg hover:bg-white text-gray-600 transition-colors" title="الهوامش">
                      <Maximize className="h-4 w-4" />
                    </button>
                    <div className="absolute top-full right-0 mt-1 hidden group-hover:flex flex-col bg-white border border-gray-100 shadow-lg rounded-lg p-1 z-50 w-24">
                      <button onClick={() => setPageMargin('10mm')} className={cn("px-3 py-1.5 text-xs text-right rounded hover:bg-gray-50", pageMargin === '10mm' && "bg-blue-50 text-blue-600 font-bold")}>ضيق</button>
                      <button onClick={() => setPageMargin('20mm')} className={cn("px-3 py-1.5 text-xs text-right rounded hover:bg-gray-50", pageMargin === '20mm' && "bg-blue-50 text-blue-600 font-bold")}>عادي</button>
                      <button onClick={() => setPageMargin('30mm')} className={cn("px-3 py-1.5 text-xs text-right rounded hover:bg-gray-50", pageMargin === '30mm' && "bg-blue-50 text-blue-600 font-bold")}>عريض</button>
                    </div>
                  </div>
                </div>

                <div className="h-5 w-px bg-gray-200 mx-1"></div>

                {/* Rich Text Tools */}
                <div className="flex items-center gap-0.5" dir="ltr">
                  <button onClick={() => execCommand('bold')} className={cn("p-1.5 rounded-lg hover:bg-white text-gray-600 transition-colors", isEditing ? "opacity-100" : "opacity-30 pointer-events-none")}><Bold className="h-4 w-4" /></button>
                  <button onClick={() => execCommand('italic')} className={cn("p-1.5 rounded-lg hover:bg-white text-gray-600 transition-colors", isEditing ? "opacity-100" : "opacity-30 pointer-events-none")}><Italic className="h-4 w-4" /></button>
                  <button onClick={() => execCommand('justifyRight')} className={cn("p-1.5 rounded-lg hover:bg-white text-gray-600 transition-colors", isEditing ? "opacity-100" : "opacity-30 pointer-events-none")}><AlignRight className="h-4 w-4" /></button>
                  <button onClick={() => execCommand('justifyCenter')} className={cn("p-1.5 rounded-lg hover:bg-white text-gray-600 transition-colors", isEditing ? "opacity-100" : "opacity-30 pointer-events-none")}><AlignCenter className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          )}

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {translatedContent && (
              <>
                <button 
                  onClick={toggleEdit}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                    isEditing ? "bg-blue-600 text-white shadow-md" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                  )}
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">{isEditing ? 'حفظ' : 'تحرير'}</span>
                </button>

                <div className="relative">
                  <button 
                    onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                    disabled={isDownloading}
                    className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-all shadow-sm"
                  >
                    {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    <span className="hidden md:inline">تنزيل</span>
                  </button>
                  
                  <AnimatePresence>
                    {showDownloadMenu && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        className="absolute left-0 top-full mt-2 w-40 rounded-xl border border-gray-100 bg-white p-2 shadow-xl z-50"
                      >
                        <button onClick={() => downloadAs('pdf')} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-xs hover:bg-gray-50">
                          <FileText className="h-3.5 w-3.5 text-red-500" /> PDF (A4)
                        </button>
                        <button onClick={() => downloadAs('docx')} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-xs hover:bg-gray-50">
                          <FileText className="h-3.5 w-3.5 text-blue-500" /> Word
                        </button>
                        <button onClick={() => downloadAs('ppt')} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-xs hover:bg-gray-50">
                          <FileText className="h-3.5 w-3.5 text-orange-500" /> PowerPoint
                        </button>
                        <button onClick={() => downloadAs('jpg')} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-right text-xs hover:bg-gray-50">
                          <ImageIcon className="h-3.5 w-3.5 text-green-500" /> صورة (JPG)
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            )}
          </div>
        </nav>
      )}

      {/* Main Content */}
      <main className="relative flex flex-1 overflow-hidden">
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileUpload} 
          accept=".pdf" 
          className="hidden" 
        />

        {!file ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-md rounded-3xl border-2 border-dashed border-gray-300 bg-white p-12 shadow-sm transition-all hover:border-blue-400"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const droppedFile = e.dataTransfer.files[0];
                if (droppedFile && droppedFile.type === 'application/pdf') {
                  setFile(droppedFile);
                  setPdfUrl(URL.createObjectURL(droppedFile));
                }
              }}
            >
              <div className="mb-6 flex justify-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <Upload className="h-10 w-10" />
                </div>
              </div>
              <h1 className="mb-4 text-3xl font-black tracking-tight text-gray-900 md:text-4xl">
                مترجم <span className="text-blue-600">المستندات</span> الذكي
              </h1>
              <h2 className="mb-2 text-xl font-bold">اسحب ملف PDF هنا</h2>
              <p className="mb-8 text-sm text-gray-500 leading-relaxed">
                أو انقر لاختيار ملف من جهازك. يدعم التطبيق الملفات حتى 20 ميجابايت.
              </p>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-xl bg-blue-600 py-3 font-bold text-white shadow-lg shadow-blue-200 transition-all hover:bg-blue-700 active:scale-95"
              >
                اختيار ملف
              </button>
            </motion.div>
            
            <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
              {[
                { icon: <Sparkles className="h-5 w-5" />, title: "ترجمة ذكية", desc: "مدعوم بأحدث نماذج Gemini" },
                { icon: <Columns className="h-5 w-5" />, title: "عرض متوازي", desc: "قارن بين النص الأصلي والمترجم" },
                { icon: <Edit3 className="h-5 w-5" />, title: "تحرير سهل", desc: "عدل الترجمة قبل الحفظ" }
              ].map((item, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm text-blue-600">
                    {item.icon}
                  </div>
                  <h3 className="text-sm font-bold">{item.title}</h3>
                  <p className="text-xs text-gray-500">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden relative">
            {/* PDF Viewer */}
            <div className={cn(
              "flex flex-col overflow-auto bg-gray-100/50 transition-all duration-300",
              viewMode === 'original' ? "w-full" : viewMode === 'split' ? "w-1/2" : "w-0 overflow-hidden"
            )}>
              <div className="flex-1 overflow-auto p-4 md:p-8 flex justify-center items-start">
                <div className="origin-top transition-transform duration-200" style={{ transform: `scale(${zoom / 100})`, width: `${pageDimensions.width}px`, height: `${pageDimensions.height}px` }}>
                  <canvas 
                    ref={canvasRef} 
                    className="bg-white shadow-xl ring-1 ring-gray-200" 
                  />
                </div>
              </div>
            </div>

            {/* Translation Area */}
            <div className={cn(
              "flex flex-col border-r border-gray-200 bg-gray-100/50 transition-all duration-300",
              viewMode === 'translation' ? "w-full" : viewMode === 'split' ? "w-1/2" : "w-0 overflow-hidden"
            )}>
              {isTranslating ? (
                <div className="flex flex-1 flex-col items-center justify-center p-8 text-center bg-white">
                  <div className="relative mb-8">
                    <div className="h-24 w-24 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Sparkles className="h-8 w-8 text-blue-600 animate-pulse" />
                    </div>
                  </div>
                  <h2 className="mb-2 text-lg font-bold">جاري الترجمة...</h2>
                  <p className="max-w-xs text-sm text-gray-500 leading-relaxed">
                    نقوم بتحليل المستند وترجمته باستخدام الذكاء الاصطناعي. قد يستغرق ذلك بضع ثوانٍ.
                  </p>
                </div>
              ) : translatedContent ? (
                <div className="flex flex-1 flex-col overflow-hidden">
                  <div className="flex-1 overflow-auto p-4 md:p-8 flex justify-center items-start">
                    <div className="origin-top transition-transform duration-200" style={{ transform: `scale(${zoom / 100})`, width: `${pageDimensions.width}px`, minHeight: `${pageDimensions.height}px` }}>
                      {isEditing ? (
                        <div 
                          id="translation-content"
                          ref={editorRef}
                          contentEditable
                          onBlur={updateContent}
                          dangerouslySetInnerHTML={{ __html: translatedContent }}
                          style={{ 
                            width: '100%',
                            minHeight: '100%',
                            fontSize: `${fontSize}px`,
                            fontFamily: selectedFont.id,
                            lineHeight: lineHeight,
                            padding: pageMargin
                          }}
                          className="a4-page text-right outline-none focus:ring-2 focus:ring-blue-100 shadow-xl ring-1 ring-gray-200"
                          dir="rtl"
                        />
                      ) : (
                        <div 
                          id="translation-content"
                          className="a4-page prose prose-sm prose-blue text-right shadow-xl ring-1 ring-gray-200" 
                          dir="rtl"
                          style={{ 
                            width: '100%',
                            minHeight: '100%',
                            fontSize: `${fontSize}px`,
                            fontFamily: selectedFont.id,
                            lineHeight: lineHeight,
                            padding: pageMargin
                          }}
                          dangerouslySetInnerHTML={{ __html: htmlPreview }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              ) : (

                <div className="flex flex-1 flex-col items-center justify-start p-8 pt-12 text-center bg-gray-50/30">
                  <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-orange-100 text-orange-500 shadow-sm">
                    <Sparkles className="h-10 w-10" />
                  </div>
                  <h2 className="mb-2 text-xl font-bold text-gray-900">جاهز للترجمة</h2>
                  <p className="mb-8 max-w-md text-sm text-gray-500 leading-relaxed">
                    انقر على الزر أدناه لبدء ترجمة المستند بالكامل إلى {LANGUAGES.find(l => l.code === targetLang)?.name}.
                    سيتم الحفاظ على التنسيق الأصلي قدر الإمكان.
                  </p>
                  
                  <div className="mb-8 w-full max-w-sm space-y-4 rounded-2xl border border-orange-100 bg-white p-6 shadow-xl">
                    <button 
                      onClick={translatePDF}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-orange-500 py-4 font-bold text-white shadow-lg shadow-orange-200 transition-all hover:bg-orange-600 active:scale-95"
                    >
                      <Sparkles className="h-5 w-5" />
                      ابدأ الترجمة الآن
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Unlock Banner (Floating) - REMOVED */}
          </div>
        )}
      </main>

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-red-600 p-4 text-white shadow-2xl"
          >
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">{error}</p>
            <button onClick={() => setError(null)} className="ml-2 rounded-full p-1 hover:bg-white/20">
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer / Status Bar */}
      {file && (
        <footer className="flex h-10 shrink-0 items-center justify-between border-t border-gray-200 bg-white px-4 text-[10px] font-medium text-gray-500">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
              <span>جاهز</span>
            </div>
            <div className="h-3 w-px bg-gray-200" />
            <span>{selectedModel.name}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Info className="h-3 w-3" />
              <span>يتم الحفاظ على التنسيق قدر الإمكان</span>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
