from fastapi import FastAPI, File, UploadFile, Form, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import torch
import io
import numpy as np
from transformers import SegformerImageProcessor, SegformerForSemanticSegmentation
from diffusers import StableDiffusionInpaintPipeline
import cv2
import json # To serialize messages for WebSocket
import base64 # To send images via WebSocket if not using external storage
import uuid # For generating unique IDs for connections/sessions

# --- FastAPI App Setup ---
app = FastAPI(
    title="Time Wardrobe API",
    description="API for changing clothes in an image to a specified era using AI.",
    version="1.0.0"
)

# --- CORS Configuration ---
origins = [
    "*", # Allows all origins for development and testing. Be more specific in production.
    # "http://localhost:3000",
    # "https://your-frontend-domain.com",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Global Model Instances ---
seg_processor = None
seg_model = None
inpaint_pipe = None
device = "cuda" if torch.cuda.is_available() else "cpu"

# --- WebSocket Connection Manager ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
        # Store a mapping from a display_id (e.g., from laptop URL) to its WebSocket
        self.display_connections: dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, client_type: str = "normal", display_id: str = None):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"WebSocket connected. Type: {client_type}, ID: {display_id}")
        if client_type == "display" and display_id:
            self.display_connections[display_id] = websocket

    def disconnect(self, websocket: WebSocket, client_type: str = "normal", display_id: str = None):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            print(f"WebSocket disconnected. Type: {client_type}, ID: {display_id}")
        if client_type == "display" and display_id in self.display_connections and self.display_connections[display_id] == websocket:
            del self.display_connections[display_id]

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except WebSocketDisconnect:
                self.active_connections.remove(connection)
                print("Removed disconnected WebSocket during broadcast.")

    async def send_to_display(self, display_id: str, message: dict):
        if display_id in self.display_connections:
            try:
                await self.display_connections[display_id].send_json(message)
                print(f"Sent message to display {display_id}")
            except WebSocketDisconnect:
                print(f"Display {display_id} disconnected during send, removing.")
                del self.display_connections[display_id]
            except Exception as e:
                print(f"Error sending to display {display_id}: {e}")
        else:
            print(f"Display {display_id} not found for sending message.")


manager = ConnectionManager()

# --- Model Loading on Startup ---
@app.on_event("startup")
async def load_models():
    global seg_processor, seg_model, inpaint_pipe
    print(f"Loading models on device: {device}...")
    
    try:
        seg_processor = SegformerImageProcessor.from_pretrained("mattmdjaga/segformer_b2_clothes")
        seg_model = SegformerForSemanticSegmentation.from_pretrained("mattmdjaga/segformer_b2_clothes").to(device)
        inpaint_pipe = StableDiffusionInpaintPipeline.from_pretrained(
            "runwayml/stable-diffusion-inpainting",
            torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32
        ).to(device)
        print("Models loaded successfully!")
    except Exception as e:
        print(f"Error loading models: {e}")
        raise RuntimeError(f"Failed to load models: {e}")


# --- Core Logic Functions ---
# (These remain the same as your last updated app.py)

def get_clothing_mask(image: Image.Image):
    """
    Generates a clothing mask from an input PIL Image and resizes the image
    to Stable Diffusion-friendly dimensions (divisible by 8).
    """
    original_width, original_height = image.size
    aspect_ratio = original_width / original_height
    
    target_max_dim = 768
    
    if original_width > original_height:
        new_width = target_max_dim
        new_height = int(new_width / aspect_ratio)
    else:
        new_height = target_max_dim
        new_width = int(new_height * aspect_ratio)
        
    new_width = (new_width // 8) * 8
    new_height = (new_height // 8) * 8
    
    min_dim = 512
    if new_width < min_dim or new_height < min_dim:
        if aspect_ratio > 1:
            new_width = max(new_width, min_dim)
            new_height = (new_width // 8) * 8
            new_height = max(new_height, (min_dim // 8) * 8)
        else:
            new_height = max(new_height, min_dim)
            new_width = (new_height // 8) * 8
            new_width = max(new_width, (min_dim // 8) * 8)

    image_resized = image.resize((new_width, new_height), Image.LANCZOS)
    
    inputs = seg_processor(images=image_resized, return_tensors="pt")
    inputs = {k: v.to(device) for k, v in inputs.items()}
    
    with torch.no_grad():
        outputs = seg_model(**inputs)
    
    logits = outputs.logits.cpu()
    upsampled_logits = torch.nn.functional.interpolate(
        logits,
        size=(new_height, new_width),
        mode="bilinear",
        align_corners=False
    )
    
    pred_seg = upsampled_logits.argmax(dim=1)[0].numpy()
    
    clothing_classes = [4, 5, 6, 7, 8]
    mask = np.zeros_like(pred_seg, dtype=np.uint8)
    for class_id in clothing_classes:
        mask[pred_seg == class_id] = 255
    
    mask_image = Image.fromarray(mask)
    
    mask_np = np.array(mask_image)
    kernel = np.ones((5, 5), np.uint8)
    mask_dilated = cv2.dilate(mask_np, kernel, iterations=1)
    mask_image = Image.fromarray(mask_dilated)
    
    return mask_image, image_resized

def change_clothes(image, mask, era_prompt, negative_prompt="", guidance_scale=9.0, num_steps=75):
    """
    Changes clothing on an image based on the mask and prompt.
    """
    full_prompt = f"{era_prompt}, identical face and expression, preserve original facial features and details:1.3"
    full_negative = f"{negative_prompt}, deformed face, changed face, distorted features, different person, blurry face, skin alterations"
    
    result = inpaint_pipe(
        prompt=full_prompt,
        negative_prompt=full_negative,
        image=image,
        mask_image=mask,
        guidance_scale=guidance_scale,
        num_inference_steps=num_steps,
        height=image.size[1],
        width=image.size[0]
    ).images[0]
    
    return result

# --- API Endpoint (HTTP for image submission) ---
@app.post("/time_wardrobe/", summary="Transform clothing in an image to a specified era")
async def time_wardrobe_api(
    file: UploadFile = File(..., description="Image to process (JPG, PNG)"),
    era_prompt: str = Form(..., description="Prompt describing the desired clothing style (e.g., 'a medieval knight in shining armor')"),
    display_id: str = Form(..., description="ID of the laptop display to send results to") # New parameter
):
    """
    Receives an image and an era prompt, then transforms the clothing
    in the image to match the description.
    Sends the result to a specific WebSocket display.
    """
    print(f"Received request for era_prompt: '{era_prompt}' for file: {file.filename}, display_id: {display_id}")
    
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file is not an image.")

    try:
        image_bytes = await file.read()
        original_image_raw = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read image file: {e}")

    if seg_processor is None or seg_model is None or inpaint_pipe is None:
        raise HTTPException(status_code=503, detail="AI models are not loaded yet. Please try again in a moment.")

    try:
        # Before processing, send a 'processing' message to the display
        await manager.send_to_display(display_id, {
            "type": "status",
            "status": "processing",
            "prompt": era_prompt,
            "original_image": base64.b64encode(image_bytes).decode('utf-8') # Send original image too
        })
        print(f"Sent processing status to display {display_id}")

        mask, resized_image = get_clothing_mask(original_image_raw)
        
        result_image = change_clothes(
            image=resized_image,
            mask=mask,
            era_prompt=era_prompt,
            negative_prompt="modern clothing, contemporary fashion, distorted, blurry, low quality, bad quality, bad anatomy, deformed, glitch, disfigured, extra limbs, extra fingers, naked",
            guidance_scale=9.0,
            num_steps=75
        )

    except Exception as e:
        print(f"Error during image processing: {e}")
        import traceback
        traceback.print_exc() 
        # Send an error message to the display if something went wrong
        await manager.send_to_display(display_id, {
            "type": "status",
            "status": "error",
            "message": f"Error processing image: {e}"
        })
        raise HTTPException(status_code=500, detail=f"Internal server error during image processing: {e}")

    # Convert result to base64 for WebSocket transport (or upload to storage)
    img_byte_arr = io.BytesIO()
    result_image.save(img_byte_arr, format="PNG")
    b64_result_image = base64.b64encode(img_byte_arr.getvalue()).decode('utf-8')

    # Send the final result via WebSocket to the specified display
    await manager.send_to_display(display_id, {
        "type": "result",
        "result_image": b64_result_image,
        "prompt": era_prompt
    })

    print("Image processed successfully! Result sent via WebSocket.")
    # Return a minimal HTTP response to the phone. The phone doesn't need the image back via HTTP.
    return {"message": "Image submitted and result sent to display."}


# --- WebSocket Endpoint ---
@app.websocket("/ws/{display_id}")
async def websocket_endpoint(websocket: WebSocket, display_id: str):
    print(f"Attempting to connect WebSocket for display_id: {display_id}")
    await manager.connect(websocket, client_type="display", display_id=display_id)
    try:
        while True:
            # Displays don't send messages, so this loop just keeps the connection alive
            # You could listen for a 'ping' from the client if needed
            data = await websocket.receive_text()
            print(f"Received message from {display_id}: {data}") # For debugging if clients send data
    except WebSocketDisconnect:
        print(f"WebSocketDisconnect for display_id: {display_id}")
        manager.disconnect(websocket, client_type="display", display_id=display_id)
    except Exception as e:
        print(f"WebSocket error for display_id {display_id}: {e}")
        manager.disconnect(websocket, client_type="display", display_id=display_id)


# --- Health Check Endpoint ---
@app.get("/", summary="Health check endpoint")
async def health_check():
    """Returns the API status."""
    return {"status": "ok", "message": "Time Wardrobe API is running!"}