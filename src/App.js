import React, { useState, useCallback, useEffect } from 'react';
import { 
  UploadCloud, 
  Ruler, 
  Calculator, 
  Percent, 
  LayoutTemplate, 
  ArrowRight,
  RefreshCcw,
  Sparkles,
  Box,
  Layers,
  Cpu,
  Trophy
} from 'lucide-react';

/**
 * Constants and Proportional Logic
 */
const GOLDEN_RATIO = 1.61803398875;
const apiKey = process.env.REACT_APP_GEMINI_KEY; // The execution environment provides the key at runtime.

/**
 * Utility to compress/resize image before sending to AI
 */
const prepareImageForAI = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1024; 
        const scale = Math.min(1, MAX_WIDTH / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        // Using PNG for better clarity in geometric analysis if possible, 
        // falling back to JPEG for speed.
        const base64 = canvas.toDataURL('image/png').split(',')[1];
        resolve(base64);
      };
    };
  });
};

const renderSafely = (val) => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string' || typeof val === 'number') return val;
  if (typeof val === 'object') {
    if (val.$$typeof) return ''; 
    try {
      return Object.entries(val)
        .map(([k, v]) => {
          const key = k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          return `${key}: ${typeof v === 'object' ? JSON.stringify(v) : v}`;
        })
        .join(' • ');
    } catch (e) { return JSON.stringify(val); }
  }
  return String(val);
};

const analyzeProportions = (a, b) => {
  if (!a || !b) return { ratio: 0, variance: 100, score: 0, target: Number(GOLDEN_RATIO.toFixed(3)) };
  const ratio = Math.max(a, b) / Math.min(a, b);
  const variance = ((ratio - GOLDEN_RATIO) / GOLDEN_RATIO) * 100;
  const score = Math.max(0, Math.min(100, Math.round(100 - (Math.abs(variance) * 2))));
  return {
    ratio: Number(ratio.toFixed(3)),
    variance: Number(variance.toFixed(2)),
    score,
    target: Number(GOLDEN_RATIO.toFixed(3))
  };
};

export default function App() {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scanComplete, setScanComplete] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  
  const [height, setHeight] = useState('');
  const [width, setWidth] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [aiReport, setAiReport] = useState(null);

  useEffect(() => {
    return () => { if (imageUrl) URL.revokeObjectURL(imageUrl); };
  }, [imageUrl]);

  const reset = () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setFile(null);
    setImageUrl(null);
    setAnalysis(null);
    setAiReport(null);
    setScanComplete(false);
    setProgress(0);
    setHeight('');
    setWidth('');
    setIsScanning(false);
    setIsAnalyzing(false);
    setErrorMessage(null);
  };

  const getAiAnalysisWithRetry = async (base64Image, stats, attempt = 0) => {
    setIsAnalyzing(true);
    setErrorMessage(null);
    
    // Explicitly demand sculptural and architectural descriptions in a strictly structured JSON
    const systemPrompt = "You are an elite furniture design critic. Provide detailed, evocative, and academic audits. Focus on the sculptural silhouette, material presence, and geometric harmonics. Use a professional and sophisticated tone.";
    const userPrompt = `Conduct a design audit. Observed Ratio: ${stats.ratio} (Phi Target: 1.618). 
    
    Structure the response as a JSON object with:
    - composition: Describe the sculptural silhouette and spatial presence in 2-3 detailed sentences.
    - geometry: Analyze how the proportions manifest in structural balance and phi-harmonics.
    - styling: Critique the materiality, finish, and design coherence.
    - verdict: A singular design classification (e.g., 'Classical Masterpiece').`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [
            { text: userPrompt }, 
            { inlineData: { mimeType: "image/png", data: base64Image } }
          ]}],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { 
            responseMimeType: "application/json",
            maxOutputTokens: 1000,
            responseSchema: {
              type: "OBJECT",
              properties: { 
                composition: { type: "STRING" }, 
                geometry: { type: "STRING" }, 
                styling: { type: "STRING" }, 
                verdict: { type: "STRING" } 
              },
              required: ["composition", "geometry", "styling", "verdict"]
            }
          }
        })
      });

      if (!response.ok) {
        throw new Error(`API_ERROR_${response.status}`);
      }
      
      const result = await response.json();
      const content = result.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!content) {
        throw new Error("EMPTY_RESPONSE");
      }
      
      setAiReport(JSON.parse(content));
      setIsAnalyzing(false);
    } catch (e) {
      if (attempt < 5) {
        const delay = Math.pow(2, attempt) * 1000;
        setTimeout(() => getAiAnalysisWithRetry(base64Image, stats, attempt + 1), delay);
      } else {
        setIsAnalyzing(false);
        setErrorMessage("Neural synchronization timeout. Please re-initialize the scan.");
        setAiReport({ 
          composition: "Audit synthesis interrupted by network variance. Please try again.", 
          geometry: "Proportional data stream inconsistent.", 
          styling: "Aesthetic details could not be resolved.", 
          verdict: "Audit Incomplete" 
        });
      }
    }
  };

  const handleFileSelection = (selectedFile) => {
    if (selectedFile?.type.startsWith('image/')) {
      setFile(selectedFile);
      setImageUrl(URL.createObjectURL(selectedFile));
    }
  };

  const startScan = async () => {
    if (!imageUrl || !file) return;
    setIsScanning(true);
    setProgress(0);
    setScanComplete(false);
    setAiReport(null);
    setErrorMessage(null);

    const img = new Image();
    img.onload = () => {
      const h = height ? parseFloat(height) : img.naturalHeight;
      const w = width ? parseFloat(width) : img.naturalWidth;
      const result = analyzeProportions(h, w);
      
      const interval = setInterval(() => {
        setProgress(p => {
          if (p >= 100) {
            clearInterval(interval);
            setTimeout(() => {
              setAnalysis(result);
              setIsScanning(false);
              setScanComplete(true);
              prepareImageForAI(file).then(b64 => getAiAnalysisWithRetry(b64, result));
            }, 300);
            return 100;
          }
          return p + 10; 
        });
      }, 30);
    };
    img.src = imageUrl;
  };

  return (
    <div className="min-h-screen bg-[#0a0a1a] bg-gradient-to-b from-[#0a0a1a] to-[#16213e] flex items-center justify-center p-4 sm:p-12 font-sans selection:bg-cyan-500/30 overflow-x-hidden">
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-cyan-500/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative w-full max-w-6xl space-y-8 animate-in fade-in duration-700">
        
        <header className="text-center space-y-4">
          <div className="inline-flex p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl mb-4 shadow-2xl">
            <LayoutTemplate className="w-8 h-8 text-cyan-400" />
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter uppercase italic text-center">
            <span className="bg-gradient-to-r from-cyan-400 via-yellow-500 to-orange-400 bg-clip-text text-transparent drop-shadow-sm">
              Phidias Scale
            </span>
          </h1>
          <p className="text-cyan-100/40 text-sm font-medium tracking-[0.3em] uppercase max-w-md mx-auto">
            Mathematical Audit & Aesthetic Synthesis
          </p>
        </header>

        <main className="relative z-10">
          {!file ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-7">
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files?.[0]) handleFileSelection(e.dataTransfer.files[0]); }}
                  className={`group relative h-[450px] flex flex-col items-center justify-center border border-white/20 rounded-[2.5rem] bg-white/[0.03] backdrop-blur-[20px] transition-all duration-500 shadow-2xl ${
                    isDragging ? 'scale-[1.02] border-cyan-400 bg-cyan-400/5' : 'hover:bg-white/[0.05]'
                  }`}
                >
                  <input type="file" accept="image/*" onChange={(e) => handleFileSelection(e.target.files?.[0])} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                  <div className="p-6 bg-cyan-400/10 rounded-full mb-6 border border-cyan-400/20 group-hover:scale-110 transition-transform duration-500">
                    <UploadCloud className="w-12 h-12 text-cyan-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white tracking-wide">Initialize Visual Input</h3>
                  <p className="text-white/40 text-xs mt-2 uppercase tracking-widest font-semibold">Drop asset or click to browse</p>
                </div>
              </div>

              <div className="lg:col-span-5 flex flex-col gap-6">
                <div className="flex-1 bg-white/[0.03] backdrop-blur-[20px] border border-white/20 rounded-[2.5rem] p-8 shadow-2xl">
                  <div className="flex items-center gap-3 mb-8">
                    <Ruler className="w-5 h-5 text-yellow-500" />
                    <h4 className="text-xs font-black text-white/60 uppercase tracking-[0.2em]">Dimension Buffer</h4>
                  </div>
                  <div className="space-y-6">
                    <InputField label="Height Scalar" placeholder="190.00" value={height} onChange={setHeight} />
                    <InputField label="Width Scalar" placeholder="117.00" value={width} onChange={setWidth} />
                  </div>
                </div>
                <div className="p-6 bg-yellow-500/10 border border-yellow-500/20 rounded-3xl flex gap-4">
                  <Cpu className="w-6 h-6 text-yellow-500 shrink-0" />
                  <p className="text-[11px] text-yellow-500/80 leading-relaxed font-bold uppercase tracking-wider">
                    Dimensions calibrate the Phi-Engine. If null, pixel aspect ratio becomes primary metric.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {!scanComplete && !isScanning && (
                <div className="flex flex-col items-center justify-center py-20 bg-white/[0.02] border border-white/10 rounded-[3rem] backdrop-blur-3xl animate-in zoom-in-95 duration-500">
                   <div className="relative mb-12 shadow-[0_0_80px_rgba(0,217,255,0.2)]">
                      <img src={imageUrl} alt="Asset" className="w-72 h-72 object-cover rounded-[3rem] border-4 border-white/10" />
                      <div className="absolute -bottom-4 -right-4 p-4 bg-cyan-500 rounded-2xl shadow-xl cursor-pointer" onClick={startScan}>
                        <ArrowRight className="w-6 h-6 text-white" />
                      </div>
                   </div>
                   <button 
                    onClick={startScan} 
                    className="group relative px-12 py-5 bg-cyan-500 rounded-2xl text-black font-black uppercase tracking-[0.3em] text-sm overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(0,217,255,0.3)]"
                   >
                     <span className="relative z-10">Execute Audit</span>
                     <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-cyan-200 opacity-0 group-hover:opacity-100 transition-opacity" />
                   </button>
                </div>
              )}

              {isScanning && (
                <div className="flex flex-col items-center justify-center py-32 space-y-8">
                   <div className="relative w-24 h-24">
                      <div className="absolute inset-0 border-4 border-cyan-500/20 rounded-full" />
                      <div className="absolute inset-0 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                   </div>
                   <div className="text-center">
                      <h2 className="text-2xl font-black text-white uppercase tracking-widest italic">Syncing Proportions</h2>
                      <p className="text-cyan-400 text-[10px] font-bold mt-2 uppercase tracking-[0.4em] animate-pulse">Running Recursive Calculations...</p>
                   </div>
                   <div className="w-full max-w-md h-1 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-500 transition-all duration-300" style={{ width: `${progress}%` }} />
                   </div>
                </div>
              )}

              {scanComplete && analysis && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                  <div className="lg:col-span-5 space-y-8">
                    <div className="relative group rounded-[3rem] overflow-hidden border border-white/20 bg-black shadow-[0_80px_100px_-20px_rgba(0,0,0,0.8)] aspect-square flex items-center justify-center backdrop-blur-3xl">
                      <div className="absolute inset-0 bg-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                      <img src={imageUrl} alt="Subject" className="max-w-[85%] max-h-[85%] object-contain opacity-90 drop-shadow-2xl" />
                      
                      <div className="absolute inset-0 p-12 pointer-events-none">
                        <svg viewBox="0 0 161.8 100" className="w-full h-full opacity-40 drop-shadow-[0_0_15px_rgba(212,175,55,0.8)]">
                          <rect x="0" y="0" width="161.8" height="100" fill="none" stroke="#d4af37" strokeWidth="1" />
                          <line x1="100" y1="0" x2="100" y2="100" stroke="#d4af37" strokeWidth="0.8" strokeDasharray="2 2" />
                          <path d="M 100,100 A 100,100 0 0,1 0,0" fill="none" stroke="#d4af37" strokeWidth="1.5" className="animate-[draw_3s_ease-out_forwards]" style={{ strokeDasharray: 400, strokeDashoffset: 400 }} />
                        </svg>
                      </div>

                      <div className="absolute top-6 left-6 bg-white/5 border border-white/10 backdrop-blur-md px-4 py-2 rounded-full flex items-center gap-3">
                         <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_#00d9ff] animate-pulse" />
                         <span className="text-[10px] text-white/80 font-black uppercase tracking-widest">Live HUD</span>
                      </div>
                    </div>

                    <div className={`p-10 rounded-[2.5rem] border backdrop-blur-3xl transition-all duration-1000 shadow-2xl overflow-hidden relative group ${
                      analysis.score >= 90 ? 'bg-[#d4af37]/10 border-[#d4af37]/40 shadow-[#d4af37]/10' : 'bg-white/5 border-white/20'
                    }`}>
                      <div className="absolute -top-20 -right-20 w-64 h-64 bg-white/5 rounded-full blur-[100px]" />
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Geometric Score</span>
                        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all duration-700 ${
                          analysis.score >= 90 ? 'bg-[#d4af37] text-black shadow-[0_0_20px_#d4af37]' : 'bg-white/10 text-white/60'
                        }`}>
                          <Trophy className="w-3 h-3" />
                          {renderSafely(aiReport?.verdict || 'Processing')}
                        </div>
                      </div>
                      <div className="flex items-baseline gap-4">
                        <span className={`text-[10rem] font-black tracking-tighter transition-all duration-1000 leading-none ${
                          analysis.score >= 90 ? 'text-[#d4af37]' : 'text-white'
                        }`}>
                          {analysis.score}
                        </span>
                        <span className="text-3xl font-bold text-white/20">/ 100</span>
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-7 space-y-6">
                    <div className="bg-white/[0.03] backdrop-blur-[20px] border border-white/20 rounded-[3rem] p-10 shadow-2xl">
                      <div className="flex items-center gap-4 mb-10 border-b border-white/10 pb-8">
                        <div className="p-3 bg-cyan-500 rounded-2xl shadow-[0_0_30px_rgba(0,217,255,0.4)]">
                          <Sparkles className="w-6 h-6 text-black" />
                        </div>
                        <div>
                          <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter">Aesthetic Synthesis</h3>
                          <p className="text-[10px] text-white/30 font-bold uppercase tracking-[0.3em] mt-1">Neural Design Critique Protocol</p>
                        </div>
                      </div>

                      {isAnalyzing ? (
                        <div className="space-y-8">
                          {[1, 2, 3].map(i => (
                            <div key={i} className="animate-pulse space-y-4">
                              <div className="h-4 w-32 bg-white/5 rounded-full" />
                              <div className="h-24 w-full bg-white/[0.03] rounded-3xl" />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-6">
                          {errorMessage && (
                            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 text-xs font-bold uppercase tracking-widest text-center animate-bounce">
                              {errorMessage}
                            </div>
                          )}
                          {aiReport && (
                            <>
                              <ReportSection icon={<Box />} title="Composition" content={aiReport.composition} />
                              <ReportSection icon={<Layers />} title="Geometry" content={aiReport.geometry} />
                              <ReportSection icon={<Sparkles />} title="Styling" content={aiReport.styling} />
                            </>
                          )}
                        </div>
                      )}

                      <div className="mt-12 pt-10 border-t border-white/10 grid grid-cols-3 gap-8">
                        <MetricHUD label="Observed" value={analysis.ratio} />
                        <MetricHUD label="Ideal (φ)" value={analysis.target} />
                        <MetricHUD 
                          label="Variance" 
                          value={`${analysis.variance}%`} 
                          color={Math.abs(analysis.variance) > 10 ? 'text-orange-500' : 'text-cyan-400'} 
                        />
                      </div>
                    </div>

                    <button 
                      onClick={reset} 
                      className="w-full py-6 rounded-[2rem] border border-white/10 bg-white/5 hover:bg-white/10 text-white/60 font-black uppercase tracking-[0.4em] text-xs transition-all flex items-center justify-center gap-4 hover:border-white/20 active:scale-95 shadow-2xl"
                    >
                      <RefreshCcw className="w-4 h-4" /> Reset Environment
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      <style>{`
        @keyframes draw { 
          from { stroke-dashoffset: 400; }
          to { stroke-dashoffset: 0; } 
        }
      `}</style>
    </div>
  );
}

function InputField({ label, placeholder, value, onChange }) {
  return (
    <div className="space-y-3">
      <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] ml-2">{label}</label>
      <input 
        type="number" 
        placeholder={placeholder} 
        value={value} 
        onChange={(e) => onChange(e.target.value)} 
        className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white text-lg font-mono placeholder:text-white/10 focus:outline-none focus:border-cyan-500/50 transition-all shadow-inner" 
      />
    </div>
  );
}

function ReportSection({ icon, title, content }) {
  return (
    <div className="group space-y-3 p-6 rounded-[2rem] border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10 transition-all duration-500">
      <div className="flex items-center gap-3 text-cyan-400/60 group-hover:text-cyan-400 transition-colors">
        {React.cloneElement(icon, { className: "w-4 h-4" })}
        <h4 className="text-[10px] font-black uppercase tracking-[0.3em]">{title}</h4>
      </div>
      <p className="text-sm leading-relaxed text-white/70 font-medium italic">
        {renderSafely(content)}
      </p>
    </div>
  );
}

function MetricHUD({ label, value, color = "text-white" }) {
  return (
    <div className="space-y-1">
      <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em]">{label}</p>
      <p className={`text-xl font-black font-mono tracking-tighter ${color}`}>{renderSafely(value)}</p>
    </div>
  );
}
