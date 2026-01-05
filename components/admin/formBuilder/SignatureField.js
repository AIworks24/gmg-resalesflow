/**
 * Signature Field Component
 * Supports:
 * - Drawing signature with mouse/touch
 * - Uploading signature image
 * - Converting text to signature font
 * - Making uploaded images transparent
 */

import React, { useRef, useState, useCallback } from 'react';
import { PenTool, Upload, X, Type } from 'lucide-react';

export default function SignatureField({ 
  value, 
  onChange, 
  label, 
  required = false,
  disabled = false 
}) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [mode, setMode] = useState('draw'); // 'draw', 'text', 'upload'
  const [textSignature, setTextSignature] = useState('');
  const [uploadedImage, setUploadedImage] = useState(null);

  // Initialize canvas
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // If we have a value (base64 image), draw it
    if (value && value.startsWith('data:image')) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = value;
    }
  }, [value]);

  React.useEffect(() => {
    initCanvas();
  }, [initCanvas]);

  // Drawing handlers
  const startDrawing = (e) => {
    if (mode !== 'draw' || disabled) return;
    setIsDrawing(true);
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(
      e.clientX - rect.left,
      e.clientY - rect.top
    );
  };

  const draw = (e) => {
    if (!isDrawing || mode !== 'draw' || disabled) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    ctx.lineTo(
      e.clientX - rect.left,
      e.clientY - rect.top
    );
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    saveSignature();
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataURL = canvas.toDataURL('image/png');
    onChange(dataURL);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setTextSignature('');
    setUploadedImage(null);
    onChange('');
  };

  // Handle image upload
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const img = new Image();
      img.onload = async () => {
        // Create canvas to process image
        const processCanvas = document.createElement('canvas');
        const processCtx = processCanvas.getContext('2d');
        processCanvas.width = img.width;
        processCanvas.height = img.height;

        // Draw image
        processCtx.drawImage(img, 0, 0);

        // Get image data
        const imageData = processCtx.getImageData(0, 0, processCanvas.width, processCanvas.height);
        const data = imageData.data;

        // Make background transparent (remove white/light backgrounds)
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];

          // If pixel is white or very light, make it transparent
          if (r > 240 && g > 240 && b > 240) {
            data[i + 3] = 0; // Set alpha to 0 (transparent)
          }
          // If pixel is very light gray, make it semi-transparent
          else if (r > 200 && g > 200 && b > 200) {
            data[i + 3] = Math.max(0, a - 100);
          }
        }

        // Put processed image data back
        processCtx.putImageData(imageData, 0, 0);

        // Convert to data URL
        const transparentDataURL = processCanvas.toDataURL('image/png');
        
        // Draw on signature canvas
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          // Calculate dimensions to fit
          const scale = Math.min(
            canvas.width / img.width,
            canvas.height / img.height
          );
          const x = (canvas.width - img.width * scale) / 2;
          const y = (canvas.height - img.height * scale) / 2;
          
          ctx.drawImage(processCanvas, x, y, img.width * scale, img.height * scale);
          saveSignature();
        }

        setUploadedImage(transparentDataURL);
        setMode('draw');
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Convert text to signature font
  const handleTextToSignature = () => {
    if (!textSignature.trim()) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Use a cursive/signature-like font
    ctx.font = 'italic 48px "Brush Script MT", "Lucida Handwriting", cursive, serif';
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Draw text in center
    ctx.fillText(textSignature, canvas.width / 2, canvas.height / 2);
    
    saveSignature();
    setMode('draw');
  };

  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {/* Mode selector */}
      <div className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setMode('draw')}
          className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-md transition-colors ${
            mode === 'draw'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          disabled={disabled}
        >
          <PenTool className="w-3 h-3" />
          Draw
        </button>
        <button
          type="button"
          onClick={() => setMode('text')}
          className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-md transition-colors ${
            mode === 'text'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          disabled={disabled}
        >
          <Type className="w-3 h-3" />
          Type
        </button>
        <label
          className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-md transition-colors cursor-pointer ${
            mode === 'upload'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Upload className="w-3 h-3" />
          Upload
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
            disabled={disabled}
          />
        </label>
        {value && (
          <button
            type="button"
            onClick={clearSignature}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
            disabled={disabled}
          >
            <X className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>

      {/* Text input mode */}
      {mode === 'text' && (
        <div className="mb-3">
          <input
            type="text"
            value={textSignature}
            onChange={(e) => setTextSignature(e.target.value)}
            placeholder="Type your name"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={disabled}
          />
          <button
            type="button"
            onClick={handleTextToSignature}
            className="mt-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors text-sm"
            disabled={disabled || !textSignature.trim()}
          >
            Convert to Signature
          </button>
        </div>
      )}

      {/* Canvas for drawing/displaying signature */}
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-2 bg-white">
        <canvas
          ref={canvasRef}
          width={400}
          height={150}
          className="w-full h-auto border border-gray-200 rounded cursor-crosshair"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={(e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousedown', {
              clientX: touch.clientX,
              clientY: touch.clientY
            });
            canvasRef.current.dispatchEvent(mouseEvent);
          }}
          onTouchMove={(e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
              clientX: touch.clientX,
              clientY: touch.clientY
            });
            canvasRef.current.dispatchEvent(mouseEvent);
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            const mouseEvent = new MouseEvent('mouseup', {});
            canvasRef.current.dispatchEvent(mouseEvent);
          }}
        />
        {!value && mode === 'draw' && (
          <p className="text-xs text-gray-500 text-center mt-2">
            Draw your signature above
          </p>
        )}
      </div>
    </div>
  );
}

