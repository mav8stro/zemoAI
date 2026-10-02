import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { speakMalayalam } from '../ai/malayalam';

export function ScreenTool({ onClose }: { onClose: () => void }) {
  const [streamActive, setStreamActive] = useState(false);
  const [extractedText, setExtractedText] = useState('');
  const [rewrittenText, setRewrittenText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const language = useStore((s) => s.language);

  const startCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' } as MediaTrackConstraints,
        audio: false
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setStreamActive(true);
      }
    } catch {
      setExtractedText('Screen capture was dismissed or is unsupported.');
    }
  };

  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 800;
    canvas.height = video.videoHeight || 450;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    extractAndAnalyze();
  };

  const extractAndAnalyze = () => {
    setIsProcessing(true);
    setTimeout(() => {
      const mockOcr = 'ZEMO SYSTEM INTERFACE // SCREEN CAPTURE OK // DETECTED WINDOW CONTENT & ACTIVE PARAMETERS';
      setExtractedText(mockOcr);
      setRewrittenText('Strategic Summary: Current display verified active. No critical system anomalies detected in the visual frame.');
      setIsProcessing(false);
    }, 600);
  };

  const handleReadAloud = () => {
    const textToRead = rewrittenText || extractedText;
    if (!textToRead) return;
    if (language === 'ml') {
      speakMalayalam(textToRead);
    } else if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(textToRead);
      window.speechSynthesis.speak(u);
    }
  };

  const handleRewrite = () => {
    if (!extractedText) return;
    setRewrittenText(`Refined Analysis: ${extractedText} — Enhanced for optimal tactical execution and zero-latency synthesis.`);
  };

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = '#00ffc4';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
  };

  const drawMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDraw = () => setIsDrawing(false);

  useEffect(() => {
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return (
    <div className="screen-tool-modal">
      <div className="screen-tool-card">
        <div className="screen-tool-header">
          <div className="screen-tool-title">
            <span className="screen-tool-badge">VISION // SPATIAL OCR</span>
            <h3>Screen Reader & Live Modifier</h3>
          </div>
          <button className="screen-tool-close" onClick={onClose}>✕</button>
        </div>

        <div className="screen-tool-body">
          <div className="screen-tool-preview">
            <video ref={videoRef} style={{ display: 'none' }} playsInline muted />
            <canvas
              ref={canvasRef}
              className="screen-canvas"
              onMouseDown={startDraw}
              onMouseMove={drawMove}
              onMouseUp={stopDraw}
              onMouseLeave={stopDraw}
            />
            {!streamActive && (
              <div className="screen-placeholder" onClick={startCapture}>
                <span className="screen-placeholder-icon">⛶</span>
                <p>Click to Select Screen or Window for Spatial Reading & Modification</p>
                <button className="screen-tool-btn" onClick={startCapture}>Capture Screen</button>
              </div>
            )}
          </div>

          <div className="screen-tool-controls">
            {streamActive && (
              <button className="screen-tool-btn primary" onClick={captureFrame}>
                📸 Snapshot & Scan Text
              </button>
            )}
            <button
              className="screen-tool-btn"
              disabled={!extractedText || isProcessing}
              onClick={handleReadAloud}
            >
              🔊 Read Aloud ({language === 'ml' ? 'മലയാളം' : 'English'})
            </button>
            <button
              className="screen-tool-btn"
              disabled={!extractedText || isProcessing}
              onClick={handleRewrite}
            >
              ✍ Rewrite & Enhance
            </button>
          </div>

          {(extractedText || isProcessing) && (
            <div className="screen-tool-results">
              <div className="screen-result-box">
                <span className="screen-result-label">EXTRACTED CONTENT:</span>
                <p>{isProcessing ? 'Processing visual buffers...' : extractedText}</p>
              </div>
              {rewrittenText && (
                <div className="screen-result-box highlight">
                  <span className="screen-result-label">REWRITTEN SYNTHESIS:</span>
                  <p>{rewrittenText}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
