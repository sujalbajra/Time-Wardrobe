import React, { useState, useRef, useEffect } from 'react';
import './App.css';

const ERA_PRESETS = [
  { label: "Select an Era...", prompt: "" },
  { label: "Stone Age (Caveman)", prompt: "prehistoric human wearing primitive animal-skin clothing, rough-cut fur garments, handmade leather straps, natural earth tones, wild unkempt hair, rugged texture, outdoors rocky environment, soft diffused daylight" },  
  { label: "Ancient Roman", prompt: "ancient Roman citizen wearing a white wool toga with gold embroidery, sandals, short neatly styled hair, marble architecture in background, soft warm sunlight, clean classical aesthetic" },
  { label: "Ancient Greek", prompt: "ancient Greek philosopher wearing a himation over a chiton, leather sandals, laurel wreath on head, standing in front of white marble columns, bright Mediterranean sunlight, scholarly and serene atmosphere" },
  { label: "Medieval Peasant", prompt: "medieval European peasant wearing simple wool tunic and trousers, leather belt, rough fabric shoes, unkempt hair, rustic village background with thatched cottages, overcast sky, earthy tones" },
  { label: "Medieval Knight", prompt: "medieval knight in polished silver plate armor, chainmail underlayer, engraved chestplate, leather belt, raised visor helmet, castle courtyard background, dramatic side lighting, realistic metal reflections" },
  { label: "1920s", prompt: "1920s fashion, sharp pinstripe suit, Gatsby style with a fedora" },
  { label: "1970s", prompt: "A person in 1970s fashion, retro colors, flim grain" },
  { label: "1970s Rockstar", prompt: "Vintage leather jacket, elctric guitar, concert stage vibe, retro ligthing" },
  { label: "Victorian Gentleman", prompt: "Victorian era gentleman in formal coat and waistcoat" },
  { label: "Victorian Lady", prompt: "Victorian era lady in long dress with lace details" },
  { label: "Indian King", prompt: "Ancient Indian king in silk dhoti and royal ornaments" },
  { label: "Mughal Noblewoman", prompt: "Mughal noblewoman in traditional anarkali dress" },
  { label: "World War 2", prompt: "Mughal noblewoman in traditional anarkali dress" },
  { label: "Bridal Dress", prompt: "White gown, flower bouquet, elegant lighting" },
  { label: "summer dress", prompt: "floral summer dress, picnic vibes, elegant lighting" },
  { label: "early 2000s", prompt: "lace cami tops, straight blue jeans, barbie pink, elegant lighting" },
  { label: "y2k style", prompt: "low rise pants, halter neck,grunge style,funky glasses" },
  { label: "2000s", prompt: "metallic dress, hoop earings, pencil heels" },
  { label: "marilyn monroe", prompt: "red carpet gown, hollywood glamour, elegant lighting" },
  { label: "Sabrina Carpenter", prompt: "pop star, body suit, vibrant colors, glittery clothes, make the body proportional, hair should be blonde" },
];


function App() {
  const [mode, setMode] = useState('normal'); 
  const [selectedImage, setSelectedImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [eraPrompt, setEraPrompt] = useState('');
  const [resultImage, setResultImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastTs, setLastTs] = useState(0);

  const fileInputRef = useRef(null);
  const BACKEND_URL = 'http://localhost:8000';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    if (view === 'display') setMode('display');
    else if (view === 'controller') setMode('controller');
    else setMode('normal');
  }, []);

  useEffect(() => {
    if (mode !== 'display') return;
    const interval = setInterval(async () => {
      try {
        const statusRes = await fetch(`${BACKEND_URL}/stall/status`);
        const status = await statusRes.json();
        if (status.ts > lastTs) {
          const imgRes = await fetch(`${BACKEND_URL}/stall/latest`);
          if (imgRes.ok) {
            const blob = await imgRes.blob();
            setResultImage(URL.createObjectURL(blob));
            setLastTs(status.ts);
          }
        }
      } catch (e) { console.log("Waiting for new image..."); }
    }, 3000);
    return () => clearInterval(interval);
  }, [mode, lastTs]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedImage(file);
      setPreviewUrl(URL.createObjectURL(file));
      setResultImage(null);
    }
  };

  const handleTrigger = (type) => {
    if (type === 'camera') fileInputRef.current.setAttribute('capture', 'user');
    else fileInputRef.current.removeAttribute('capture');
    fileInputRef.current.click();
  };

  const handleSubmit = async () => {
    if (!selectedImage || !eraPrompt) return setError("Please select image and era.");
    setLoading(true);
    setError(null);
    
    const formData = new FormData();
    formData.append('file', selectedImage);
    formData.append('era_prompt', eraPrompt);
    formData.append('is_stall', mode === 'controller' ? 'true' : 'false');

    try {
      const res = await fetch(`${BACKEND_URL}/time_wardrobe/`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error("Processing failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      
      setResultImage(url);
      if (mode === 'controller') alert("Transformation sent to main display!");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleDownload = async () => {
    if (!resultImage) return;
    
    try {
      if (mode === 'display') {
        const res = await fetch(`${BACKEND_URL}/download/latest`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'time_wardrobe_result.png';
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const a = document.createElement('a');
        a.href = resultImage;
        a.download = 'time_wardrobe_result.png';
        a.click();
      }
    } catch (e) {
      console.error('Download failed:', e);
    }
  };

  return (
    <div className={`App view-${mode}`}>
      <header className="app-header">
        <h1 className="logo-text">Time <span className="highlight">Wardrobe</span></h1>
        {mode === 'display' && <span className="live-badge">LIVE DISPLAY</span>}
      </header>

      <main className="main-content">
        {mode !== 'display' && (
          <div className="input-panel card">
            <h2 className="panel-title">1. Setup</h2>
            <div className="button-row">
              <button onClick={() => handleTrigger('camera')} className="action-button primary"><i className="fas fa-camera" /> Camera</button>
              <button onClick={() => handleTrigger('gallery')} className="action-button outline"><i className="fas fa-image" /> Gallery</button>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleImageChange} style={{display:'none'}} accept="image/*" />
            
            {previewUrl && (
              <div className="preview-container">
                <img src={previewUrl} className="preview-box" alt="preview" />
                <button className="remove-btn" onClick={() => {setSelectedImage(null); setPreviewUrl(null)}}>×</button>
              </div>
            )}

            <h2 className="panel-title" style={{marginTop:'20px'}}>2. Era Description</h2>
            <select className="era-select" onChange={(e) => setEraPrompt(e.target.value)} disabled={loading}>
              {ERA_PRESETS.map(era => <option key={era.label} value={era.prompt}>{era.label}</option>)}
            </select>

            <button onClick={handleSubmit} className="action-button secondary" disabled={loading || !selectedImage || !eraPrompt}>
              {loading ? <i className="fas fa-spinner fa-spin" /> : "Transform Look"}
            </button>
            {error && <p className="error-text">{error}</p>}
          </div>
        )}

        {mode !== 'controller' && (
          <div className={`output-panel card ${mode === 'display' ? 'full-screen' : ''}`}>
            <h2 className="panel-title">3. Result</h2>
            <div className="result-container">
              {resultImage ? (
                <>
                  <img src={resultImage} className="final-img" alt="result" />
                  <button onClick={handleDownload} className="download-btn">
                    <i className="fas fa-download" /> Download
                  </button>
                </>
              ) : (
                <div className="placeholder">
                  <i className="fas fa-wand-sparkles fa-3x" />
                  <p>{mode === 'display' ? "Ready for Input..." : "Result will appear here"}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
