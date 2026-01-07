import React, { useState, useRef, useEffect } from 'react';
import './App.css';

const ERA_PRESETS = [
  { label: "Select an Era...", prompt: "" },
  { label: "Stone Age (Caveman)", prompt: "prehistoric human wearing primitive animal-skin clothing, rough-cut fur garments, handmade leather straps, natural earth tones, wild unkempt hair, rugged texture, outdoors rocky environment, soft diffused daylight" },  
  { label: "Ancient Roman", prompt: "ancient Roman citizen wearing a white wool toga with gold embroidery, sandals, short neatly styled hair, marble architecture in background, soft warm sunlight, clean classical aesthetic" },
  { label: "Ancient Greek", prompt: "ancient Greek philosopher wearing a himation over a chiton, leather sandals, laurel wreath on head, standing in front of white marble columns, bright Mediterranean sunlight, scholarly and serene atmosphere" },
  { label: "Medieval Peasant", prompt: "medieval European peasant wearing simple wool tunic and trousers, leather belt, rough fabric shoes, unkempt hair, rustic village background with thatched cottages, overcast sky, earthy tones" },
  { label: "Medieval Knight", prompt: "medieval knight in polished silver plate armor, chainmail underlayer, engraved chestplate, leather belt, raised visor helmet, castle courtyard background, dramatic side lighting, realistic metal reflections" },
  { label: "1920s", prompt: "sharp 1920s fashion, tailored pinstripe suit, fedora hat, polished shoes, slicked hair, art-deco style backdrop, moody studio lighting, vintage film texture" },
  { label: "1970s", prompt: "A person in 1970s fashion, retro colors, flim grain" },
  { label: "1970s Rockstar", prompt: "retro 1970s fashion, warm saturated colors, patterned shirt, flared pants, film grain, soft hazy lighting, vintage ambience" },
  { label: "Victorian Gentleman", prompt: "Victorian gentleman in formal coat, waistcoat, cravat, pocket watch chain, neat hairstyle, indoor Victorian room with wooden panels, natural soft lighting" },
  { label: "Victorian Lady", prompt: "Victorian lady wearing long lace-detailed dress, corset silhouette, elegant gloves, ornate hairstyle, classic interior room, diffused warm lighting" },
  { label: "Indian King", prompt: "ancient Indian king in silk dhoti, heavy gold ornaments, royal necklace, turban with gemstone, rich fabric texture, palace interior, warm directional lighting" },
  { label: "Mughal Noblewoman", prompt: "Mughal noblewoman in traditional anarkali dress, intricate embroidery, jewelry set, delicate veil, marble palace background, soft glowing lighting" },
  { label: "World War 2", prompt: "WW2 soldier wearing era-accurate uniform, helmet, utility belt, worn fabric texture, muted colors, battlefield backdrop, dramatic natural lighting" },
  { label: "Bridal Dress", prompt: "modern white bridal gown, flowing fabric, lace highlights, holding flower bouquet, soft studio lighting, clean background, elegant posture" },
  { label: "summer dress", prompt: "floral summer dress, light pastel colors, outdoor picnic setting, natural greenery, warm sunlight, soft shadows, relaxed expression" },
  { label: "early 2000s", prompt: "early 2000s fashion, lace cami top, straight blue jeans, glossy lip makeup, barbie-pink accents, studio lighting, clean color styling" },
  { label: "y2k style", prompt: "Y2K fashion, low-rise pants, halter top, grunge-inspired accessories, funky sunglasses, reflective materials, neon color palette, stylized lighting" },
  { label: "2000s", prompt: "2000s party fashion, metallic dress, hoop earrings, high pencil heels, glossy reflective lighting, club-style background, vibrant highlights" },
  { label: "marilyn monroe", prompt: "Hollywood glamour inspired look, iconic red carpet gown, classic curled hairstyle, dramatic spotlight lighting, elegant pose, vintage cinematic tone" },
  { label: "Sabrina Carpenter", prompt: "pop-star look inspired by Sabrina Carpenter, fitted bodysuit, glittery fabric, vibrant stage colors, proportional body shape, long blonde hair, studio or concert lighting, clean sharp focus" },
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
