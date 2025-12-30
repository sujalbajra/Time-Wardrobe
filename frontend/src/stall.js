// App.js (Updated for WebSockets)
import React, { useState, useRef, useEffect, useCallback } from 'react';
import './App.css'; // Make sure to import the CSS file

function App() {
  const [selectedImage, setSelectedImage] = useState(null);
  const [previewImage, setPreviewImage] = useState(null); // Preview of original image for phone
  const [eraPrompt, setEraPrompt] = useState('');
  const [resultImage, setResultImage] = useState(null); // For displaying the result on the laptop
  const [originalImageForDisplay, setOriginalImageForDisplay] = useState(null); // Original image for laptop display
  const [loading, setLoading] = useState(false); // For both phone and laptop
  const [error, setError] = useState(null); // For both phone and laptop
  const [isLaptopDisplay, setIsLaptopDisplay] = useState(false);
  const [displayId, setDisplayId] = useState(null); // Unique ID for the laptop display
  const [currentPromptForDisplay, setCurrentPromptForDisplay] = useState(''); // Prompt for laptop display

  const fileInputRef = useRef(null);
  const ws = useRef(null); // WebSocket reference

  // --- IMPORTANT: Configure your backend URLs here ---
  // For local development:
  const HTTP_BACKEND_URL = 'http://localhost:8000';
  const WS_BACKEND_URL = 'ws://localhost:8000'; // WebSocket URL
  // For deployment (e.g., Hugging Face Spaces):
  // const HTTP_BACKEND_URL = 'https://your-huggingface-space-name.hf.space';
  // const WS_BACKEND_URL = 'wss://your-huggingface-space-name.hf.space'; // Secure WebSocket URL (wss://)
  // --------------------------------------------------

  // --- Initialize Display ID and detect laptop mode ---
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const idFromUrl = urlParams.get('display_id');

    if (urlParams.get('mode') === 'display' && idFromUrl) {
      setIsLaptopDisplay(true);
      setDisplayId(idFromUrl);
      console.log(`Running in Laptop Display Mode with ID: ${idFromUrl}`);
    } else {
      // For input phone, we just need *a* display ID to send results to.
      // We can generate one or assume a default.
      // For a dedicated stall, you'd likely hardcode the laptop's display_id into the phone's app.
      // Or, the phone could dynamically ask for an active display ID.
      // For simplicity, let's hardcode a common display ID for the stall, or generate.
      // If no display_id in URL, let's default to a generic one or generate for input devices
      const genericDisplayId = localStorage.getItem('stallDisplayId') || uuidv4();
      localStorage.setItem('stallDisplayId', genericDisplayId);
      setDisplayId(genericDisplayId);
      console.log(`Running in Input Mode, targeting Display ID: ${genericDisplayId}`);
    }
  }, []);

  // --- WebSocket Setup for Laptop Display ---
  useEffect(() => {
    if (isLaptopDisplay && displayId) {
      ws.current = new WebSocket(`${WS_BACKEND_URL}/ws/${displayId}`);

      ws.current.onopen = () => {
        console.log('WebSocket connection opened');
        setError(null); // Clear any network errors
      };

      ws.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('Received WS message:', message);

          if (message.type === 'status') {
            if (message.status === 'processing') {
              setLoading(true);
              setResultImage(null); // Clear previous result
              setOriginalImageForDisplay(`data:image/png;base64,${message.original_image}`); // Set original image
              setCurrentPromptForDisplay(message.prompt);
              setError(null);
            } else if (message.status === 'error') {
              setLoading(false);
              setError(`Processing Error: ${message.message}`);
              setResultImage(null);
              setOriginalImageForDisplay(null);
              setCurrentPromptForDisplay('');
            }
          } else if (message.type === 'result') {
            setLoading(false);
            setResultImage(`data:image/png;base64,${message.result_image}`);
            setCurrentPromptForDisplay(message.prompt);
            setError(null);
          }
        } catch (e) {
          console.error('Failed to parse WS message:', e);
          setError('Failed to receive valid data from server.');
        }
      };

      ws.current.onclose = () => {
        console.log('WebSocket connection closed. Attempting to reconnect...');
        setError('Connection to display server lost. Please refresh.');
        setLoading(false);
        setTimeout(() => { // Basic reconnect logic
          if (isLaptopDisplay && displayId && ws.current.readyState === WebSocket.CLOSED) {
            console.log("Attempting WebSocket reconnect...");
            ws.current = new WebSocket(`${WS_BACKEND_URL}/ws/${displayId}`); // Re-initiate
          }
        }, 3000); // Try to reconnect after 3 seconds
      };

      ws.current.onerror = (err) => {
        console.error('WebSocket error:', err);
        setError('WebSocket error. Please check network and refresh.');
        setLoading(false);
      };

      return () => {
        if (ws.current) {
          ws.current.close();
        }
      };
    }
  }, [isLaptopDisplay, displayId, WS_BACKEND_URL]);

  // --- Utility for generating UUIDs (for display_id, if not hardcoded) ---
  const uuidv4 = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const handleImageChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedImage(file);
      setPreviewImage(URL.createObjectURL(file)); // For phone's own preview
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
    if (!displayId) {
        setError("Error: No display ID found. Please refresh or configure the display.");
        return;
    }

    setLoading(true); // Indicate loading on the phone
    setError(null);

    const formData = new FormData();
    formData.append('file', selectedImage);
    formData.append('era_prompt', eraPrompt);
    formData.append('display_id', displayId); // Send the display ID to the backend

    try {
      const response = await fetch(`${HTTP_BACKEND_URL}/time_wardrobe/`, {
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

      // Backend now returns a simple JSON message, results sent via WS
      const data = await response.json();
      console.log("Submit success:", data.message);
      
      // Clear phone's input for next user
      alert("Image sent for transformation! Please see the main display for the result.");
      setSelectedImage(null);
      setPreviewImage(null);
      setEraPrompt('');
      setLoading(false); // Stop loading on phone

    } catch (e) {
      console.error("Error submitting image:", e);
      setError(`Submission Failed: ${e.message}. Please try again.`);
      setLoading(false);
    }
  };


  // --- Render Logic ---
  if (isLaptopDisplay) {
    return (
      <div className="App laptop-display-mode">
        <header className="app-header">
          <h1>Time Wardrobe AI Display</h1>
          <p>Real-time Clothing Transformations</p>
        </header>
        <main className="main-content centered-main-content">
          <div className="output-panel card large-output-card">
            <h2 className="panel-title">Latest Transformation</h2>
            {error && <p className="message error-message">{error}</p>}
            
            {loading ? (
                <div className="processing-display">
                    <i className="fas fa-spinner fa-spin fa-3x"></i>
                    <p>Transforming to: "<em>{currentPromptForDisplay}</em>"</p>
                    {originalImageForDisplay && (
                        <div className="image-preview processing-preview">
                            <h3>Original:</h3>
                            <img src={originalImageForDisplay} alt="Original processing" />
                        </div>
                    )}
                    <p className="loading-message">Please wait a moment...</p>
                </div>
            ) : (
                resultImage ? (
                    <>
                        {originalImageForDisplay && (
                             <div className="image-comparison">
                                <div className="image-box">
                                   <h3>Original:</h3>
                                   <img src={originalImageForDisplay} alt="Original" />
                                </div>
                                <div className="image-box">
                                   <h3>Transformed:</h3>
                                   <img src={resultImage} alt="Transformed" />
                                </div>
                             </div>
                        )}
                        {!originalImageForDisplay && (
                           // Fallback if original image somehow not sent/displayed
                           <div className="result-image-container">
                               <img src={resultImage} alt="Transformed" />
                           </div>
                        )}
                        <p className="prompt-display">Prompt: "<em>{currentPromptForDisplay}</em>"</p>
                        <div className="download-area">
                            <a href={resultImage} download={`time_wardrobe_output_${displayId}_${Date.now()}.png`} className="action-button download-button">
                                <i className="fas fa-download"></i> Download Result
                            </a>
                        </div>
                    </>
                ) : (
                    <div className="placeholder-text">
                        <p>Waiting for the next amazing transformation...</p>
                        <i className="fas fa-magic fa-5x placeholder-icon"></i>
                        <p>Share this link on the input phone: <br/> <code>{window.location.origin}</code></p>
                        <p>This display's ID: <code>{displayId}</code></p>
                    </div>
                )
            )}
          </div>
        </main>
        <footer className="app-footer">
          <p>&copy; {new Date().getFullYear()} Time Wardrobe AI. Powered by FastAPI & React. Display ID: {displayId}</p>
        </footer>
      </div>
    );
  }

  // --- Render for Phone/Input Device ---
  return (
    <div className="App">
      <header className="app-header">
        <h1>Time Wardrobe AI</h1>
        <p>Transform your look through different eras!</p>
      </header>

      <main className="main-content">
        <div className="input-panel card">
          <h2 className="panel-title">Your Photo & Prompt</h2>
          <p className="instruction-text">Use this device to capture your image and enter your creative prompt.</p>
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
                <h3>Original Image Preview:</h3>
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
              disabled={loading || !selectedImage || !eraPrompt.trim() || !displayId}
            >
              {loading ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i> Processing...
                </>
              ) : (
                <>
                  <i className="fas fa-magic"></i> Send to Display
                </>
              )}
            </button>
          </div>

          {error && <p className="message error-message">{error}</p>}
          {loading && <p className="message loading-message">Your image is being transformed! Please wait for the main display...</p>}
          <p className="debug-info">Targeting Display ID: {displayId}</p> {/* For debugging */}
        </div>
      </main>

      <footer className="app-footer">
        <p>&copy; {new Date().getFullYear()} Time Wardrobe AI. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default App;