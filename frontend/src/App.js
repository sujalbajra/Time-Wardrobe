import React, { useState, useRef } from 'react';
import './App.css'; // Make sure to import the CSS file

function App() {
  const [selectedImage, setSelectedImage] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [eraPrompt, setEraPrompt] = useState('');
  const [resultImage, setResultImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fileInputRef = useRef(null);

  // --- IMPORTANT: Configure your backend URL here ---
  const BACKEND_URL = 'http://localhost:8000'; // For local development
  // const BACKEND_URL = 'https://your-huggingface-space-name.hf.space'; // For deployment
  // --------------------------------------------------

  const handleImageChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedImage(file);
      setPreviewImage(URL.createObjectURL(file));
      setResultImage(null);
      setError(null);
    }
  };

  const handleCaptureClick = () => {
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
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData && errorData.detail) {
            errorMessage = errorData.detail;
          }
        } catch (jsonError) {}
        throw new Error(errorMessage);
      }

      const imageBlob = await response.blob();
      setResultImage(URL.createObjectURL(imageBlob));

    } catch (e) {
      console.error("Error processing image:", e);
      setError(`Failed to process image: ${e.message}. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="App">
      <header className="app-header">
        <h1>Time Wardrobe AI</h1>
        <p>Transform your look through different eras!</p>
      </header>

      <main className="main-content">
        <div className="input-panel card">
          <h2 className="panel-title">Your Photo & Prompt</h2>
          <div className="image-input-area">
            <input
              type="file"
              accept="image/*"
              capture="camera"
              onChange={handleImageChange}
              style={{ display: 'none' }}
              ref={fileInputRef}
            />
            <button 
              onClick={handleCaptureClick} 
              className="action-button primary"
              disabled={loading}
            >
              <i className="fas fa-camera"></i> Capture or Upload Image
            </button>
            {previewImage && (
              <div className="image-preview">
                <h3>Original Image:</h3>
                <img src={previewImage} alt="Preview" />
              </div>
            )}
          </div>

          <div className="prompt-input-area">
            <label htmlFor="eraPrompt" className="input-label">Describe the era's clothing:</label>
            <textarea
              id="eraPrompt"
              value={eraPrompt}
              onChange={(e) => setEraPrompt(e.target.value)}
              placeholder="e.g., a prehistoric human wearing animal skin clothing, a futuristic cybernetic suit, a roaring 20s flapper dress"
              rows="4"
              disabled={loading}
            ></textarea>
            <button 
              onClick={handleSubmit} 
              className="action-button secondary"
              disabled={loading || !selectedImage || !eraPrompt.trim()}
            >
              {loading ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i> Processing...
                </>
              ) : (
                <>
                  <i className="fas fa-magic"></i> Change Clothes
                </>
              )}
            </button>
          </div>

          {error && <p className="message error-message">{error}</p>}
          {loading && <p className="message loading-message">Generating your new outfit... This might take a moment.</p>}
        </div>

        <div className="output-panel card">
          <h2 className="panel-title">Transformed Look</h2>
          {resultImage ? (
            <>
              <div className="result-image-container">
                <img src={resultImage} alt="Transformed" />
              </div>
              <div className="download-area">
                <a href={resultImage} download="time_wardrobe_output.png" className="action-button download-button">
                  <i className="fas fa-download"></i> Download Result
                </a>
              </div>
            </>
          ) : (
            <div className="placeholder-text">
              <p>Upload your image and describe the era to see your transformation here!</p>
              <i className="fas fa-image fa-5x placeholder-icon"></i>
            </div>
          )}
        </div>
      </main>

      <footer className="app-footer">
        <p>&copy; {new Date().getFullYear()} Time Wardrobe AI. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default App;
