import React, { useState, useRef, useEffect } from 'react';
import './App.css';

function App() {
  const [selectedImage, setSelectedImage] = useState(null);
  const [eraPrompt, setEraPrompt] = useState('');
  const [resultImage, setResultImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  const fileInputRef = useRef(null);

  // Update backend URL as needed (use your Local IP for mobile testing)
  // const BACKEND_URL = 'http://localhost:8000'; 
  const BACKEND_URL = 'http://192.168.254.15:8000'; // For local development
  // Track screen size for adaptive buttons
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleImageChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedImage(file);
      setResultImage(null);
      setError(null);
    }
  };

  const handleInputTrigger = (mode) => {
    if (mode === 'camera') {
      fileInputRef.current.setAttribute('capture', 'user');
    } else {
      fileInputRef.current.removeAttribute('capture');
    }
    fileInputRef.current.click();
  };

  const handleSubmit = async () => {
    if (!selectedImage || !eraPrompt.trim()) {
      setError("Please select an image and enter an era prompt.");
      return;
    }

    setLoading(true);
    setResultImage(null);
    setError(null);

    const formData = new FormData();
    formData.append('file', selectedImage);
    formData.append('era_prompt', eraPrompt);

    try {
      const response = await fetch(`${BACKEND_URL}/time_wardrobe/`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const imageBlob = await response.blob();
      setResultImage(URL.createObjectURL(imageBlob));
    } catch (e) {
      setError(`Failed to process: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="App">
      <header className="app-header">
        <div className="brand-container">
          <h1 className="logo-text">Time <span className="highlight">Wardrobe</span></h1>
          <p className="tagline">Transform your look through different eras</p>
        </div>
      </header>

      <main className="main-content">
        <div className="input-panel card">
          <h2 className="panel-title">Step 1: Setup</h2>
          
          <div className="image-input-area">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              style={{ display: 'none' }}
              ref={fileInputRef}
            />
            
            {isMobile ? (
              <div className="mobile-button-group">
                <button 
                  onClick={() => handleInputTrigger('camera')} 
                  className={`action-button primary flex-1 ${selectedImage ? 'success' : ''}`}
                  disabled={loading}
                >
                  <i className="fas fa-camera"></i> Camera
                </button>
                <button 
                  onClick={() => handleInputTrigger('upload')} 
                  className={`action-button outline flex-1 ${selectedImage ? 'success-outline' : ''}`}
                  disabled={loading}
                >
                  <i className="fas fa-image"></i> Gallery
                </button>
              </div>
            ) : (
              <button 
                onClick={() => handleInputTrigger('upload')} 
                className={`action-button primary ${selectedImage ? 'success' : ''}`}
                disabled={loading}
              >
                <i className={`fas ${selectedImage ? 'fa-check-circle' : 'fa-upload'}`}></i>
                {selectedImage ? ' Photo Ready' : ' Upload Photo'}
              </button>
            )}
          </div>

          <div className="prompt-input-area">
            <label htmlFor="eraPrompt" className="panel-title input-label">Step 2: Describe the Era</label>
            <textarea
              id="eraPrompt"
              value={eraPrompt}
              onChange={(e) => setEraPrompt(e.target.value)}
              placeholder="e.g., a prehistoric human wearing animal skin clothing..."
              disabled={loading}
            ></textarea>
            
            <button 
              onClick={handleSubmit} 
              className="action-button secondary"
              disabled={loading || !selectedImage || !eraPrompt.trim()}
            >
              {loading ? (
                <><i className="fas fa-spinner fa-spin"></i> Processing...</>
              ) : (
                <><i className="fas fa-magic"></i> Change Clothes</>
              )}
            </button>
          </div>

          {error && <p className="message error-message">{error}</p>}
        </div>

        <div className="output-panel card">
          <h2 className="panel-title">Step 3: Results</h2>
          <div className="result-container">
            {resultImage ? (
              <div className="result-image-wrapper">
                <img src={resultImage} alt="Transformed" className="contained-image" />
                <a href={resultImage} download="time_wardrobe.png" className="action-button download-button">
                  <i className="fas fa-download"></i> Download
                </a>
              </div>
            ) : (
              <div className="placeholder-text">
                <i className="fas fa-wand-sparkles fa-3x"></i>
                <p>Transformation will appear here</p>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="app-footer">
        <p>&copy; {new Date().getFullYear()} Time Wardrobe AI.</p>
      </footer>
    </div>
  );
}

export default App;
