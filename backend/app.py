from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import torch
import io
import numpy as np
from transformers import SegformerImageProcessor, SegformerForSemanticSegmentation
from diffusers import StableDiffusionInpaintPipeline
import cv2 # Make sure opencv-python is installed

# --- FastAPI App Setup ---
app = FastAPI(
    title="Time Wardrobe API",
    description="API for changing clothes in an image to a specified era using AI.",
    version="1.0.0"
)

# --- CORS Configuration ---
# This is crucial for your frontend (e.g., React app) to make requests to this backend.
# In production, you might want to restrict origins to your frontend's domain.
origins = [
    "*", # Allows all origins for development and testing. Be more specific in production.
    # "http://localhost:3000", # Example for a React app running locally
    # "https://your-frontend-domain.com", # Your deployed frontend domain
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"], # Allows all HTTP methods (GET, POST, etc.)
    allow_headers=["*"], # Allows all headers
)

# --- Global Model Instances ---
seg_processor = None
seg_model = None
inpaint_pipe = None
device = "cuda" if torch.cuda.is_available() else "cpu"

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
        # Depending on deployment strategy, you might want to exit or handle gracefully
        raise RuntimeError(f"Failed to load models: {e}")


# --- Core Logic Functions ---

def get_clothing_mask(image: Image.Image):
    """
    Generates a clothing mask from an input PIL Image and resizes the image
    to Stable Diffusion-friendly dimensions (divisible by 8).
    """
    # Resize to SD-friendly dimensions (preserve aspect, divisible by 8)
    original_width, original_height = image.size
    aspect_ratio = original_width / original_height
    
    # Target resolution: SD models often work best around 512x512 to 768x768
    # Let's aim for a maximum width/height of 768 for faster processing and VRAM efficiency,
    # but ensure it's still large enough if the original is very small.
    target_max_dim = 768
    
    if original_width > original_height:
        new_width = target_max_dim
        new_height = int(new_width / aspect_ratio)
    else:
        new_height = target_max_dim
        new_width = int(new_height * aspect_ratio)
        
    # Ensure dimensions are divisible by 8
    new_width = (new_width // 8) * 8
    new_height = (new_height // 8) * 8
    
    # Ensure minimum size to avoid issues with very small images
    min_dim = 512 # SD minimum recommended
    if new_width < min_dim or new_height < min_dim:
        if aspect_ratio > 1: # width > height
            new_width = max(new_width, min_dim)
            new_height = (new_width // 8) * 8 # re-calculate height based on new_width
            new_height = max(new_height, (min_dim // 8) * 8) # ensure min height
        else:
            new_height = max(new_height, min_dim)
            new_width = (new_height // 8) * 8 # re-calculate width based on new_height
            new_width = max(new_width, (min_dim // 8) * 8) # ensure min width

    image_resized = image.resize((new_width, new_height), Image.LANCZOS)
    
    inputs = seg_processor(images=image_resized, return_tensors="pt")
    inputs = {k: v.to(device) for k, v in inputs.items()}
    
    with torch.no_grad():
        outputs = seg_model(**inputs)
    
    logits = outputs.logits.cpu()
    upsampled_logits = torch.nn.functional.interpolate(
        logits,
        size=(new_height, new_width),  # (height, width) - using resized dimensions
        mode="bilinear",
        align_corners=False
    )
    
    pred_seg = upsampled_logits.argmax(dim=1)[0].numpy()
    
    clothing_classes = [4, 5, 6, 7, 8]  # Upper-clothes, Skirt, Pants, Dress, Belt
    mask = np.zeros_like(pred_seg, dtype=np.uint8)
    for class_id in clothing_classes:
        mask[pred_seg == class_id] = 255
    
    mask_image = Image.fromarray(mask)
    
    # Dilate mask to reduce bleed (using cv2) - as in your updated code
    mask_np = np.array(mask_image)
    kernel = np.ones((5, 5), np.uint8)  # 5x5 kernel for slight expansion
    mask_dilated = cv2.dilate(mask_np, kernel, iterations=1)
    mask_image = Image.fromarray(mask_dilated)
    
    return mask_image, image_resized  # Return resized mask and resized original image

def change_clothes(image, mask, era_prompt, negative_prompt="", guidance_scale=9.0, num_steps=75):
    """
    Changes clothing on an image based on the mask and prompt.
    Uses strengthened prompts and specified guidance/steps from your new code.
    """
    # Strengthen prompts for face preservation and detail - as in your updated code
    full_prompt = f"{era_prompt}, identical face and expression, preserve original facial features and details:1.3"
    full_negative = f"{negative_prompt}, deformed face, changed face, distorted features, different person, blurry face, skin alterations"
    
    result = inpaint_pipe(
        prompt=full_prompt,
        negative_prompt=full_negative,
        image=image,
        mask_image=mask,
        guidance_scale=guidance_scale,
        num_inference_steps=num_steps,
        height=image.size[1],  # Use resized height
        width=image.size[0]    # Use resized width
    ).images[0]
    
    return result

# --- API Endpoint ---
@app.post("/time_wardrobe/", summary="Transform clothing in an image to a specified era")
async def time_wardrobe_api(
    file: UploadFile = File(..., description="Image to process (JPG, PNG)"),
    era_prompt: str = Form(..., description="Prompt describing the desired clothing style (e.g., 'a medieval knight in shining armor')")
):
    """
    Receives an image and an era prompt, then transforms the clothing
    in the image to match the description.
    """
    print(f"Received request for era_prompt: '{era_prompt}' for file: {file.filename}")
    
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file is not an image.")

    # Read image from upload
    try:
        image_bytes = await file.read()
        # original_image here is the RAW uploaded image, before any resizing
        original_image_raw = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read image file: {e}")

    # Ensure models are loaded (should be from startup event, but good for robustness)
    if seg_processor is None or seg_model is None or inpaint_pipe is None:
        raise HTTPException(status_code=503, detail="AI models are not loaded yet. Please try again in a moment.")

    try:
        # Generate mask and get the resized_image
        print("Generating clothing mask and resizing image...")
        mask, resized_image = get_clothing_mask(original_image_raw) 
        
        # The era_prompt from the user will be passed directly into change_clothes,
        # where it will be combined with the face preservation prompt.
        print(f"Generating image with user prompt: '{era_prompt}'")
        result_image = change_clothes(
            image=resized_image,
            mask=mask,
            era_prompt=era_prompt, # User's prompt
            negative_prompt="modern clothing, contemporary fashion, distorted, blurry, low quality, bad quality, bad anatomy, deformed, glitch, disfigured, extra limbs, extra fingers, naked",
            guidance_scale=9.0, # From your updated code
            num_steps=75 # From your updated code
        )

    except Exception as e:
        print(f"Error during image processing: {e}")
        # Log the full traceback for debugging server-side
        import traceback
        traceback.print_exc() 
        raise HTTPException(status_code=500, detail=f"Internal server error during image processing: {e}")

    # Convert result to bytes for response
    img_byte_arr = io.BytesIO()
    result_image.save(img_byte_arr, format="PNG") # Always return PNG for consistency
    img_byte_arr.seek(0)

    print("Image processed successfully! Returning result.")
    return StreamingResponse(img_byte_arr, media_type="image/png")

# --- Health Check Endpoint ---
@app.get("/", summary="Health check endpoint")
async def health_check():
    """Returns the API status."""
    return {"status": "ok", "message": "Time Wardrobe API is running!"}