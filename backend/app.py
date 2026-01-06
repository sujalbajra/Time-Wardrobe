from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import torch
import io
import numpy as np
import time
import cv2
from transformers import SegformerImageProcessor, SegformerForSemanticSegmentation
from diffusers import StableDiffusionInpaintPipeline

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Global Storage for Stall Mode ---
stall_store = {
    "bytes": None,
    "timestamp": 0
}

# --- Model Loading ---
seg_processor = None
seg_model = None
inpaint_pipe = None
device = "cuda" if torch.cuda.is_available() else "cpu"

@app.on_event("startup")
async def load_models():
    global seg_processor, seg_model, inpaint_pipe
    print(f"Loading Models on {device}...")
    try:
        seg_processor = SegformerImageProcessor.from_pretrained("mattmdjaga/segformer_b2_clothes")
        seg_model = SegformerForSemanticSegmentation.from_pretrained("mattmdjaga/segformer_b2_clothes").to(device)
        inpaint_pipe = StableDiffusionInpaintPipeline.from_pretrained(
            "runwayml/stable-diffusion-inpainting",
            torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32
        ).to(device)
        print("Models Loaded Successfully!")
    except Exception as e:
        print(f"Loading Error: {e}")

def get_clothing_mask(image: Image.Image):
    target_dim = 768
    w, h = image.size
    aspect = w / h
    if w > h:
        nw, nh = target_dim, int(target_dim / aspect)
    else:
        nh, nw = target_dim, int(target_dim * aspect)
    
    nw, nh = (nw // 8) * 8, (nh // 8) * 8
    img_res = image.resize((nw, nh), Image.LANCZOS)
    
    inputs = seg_processor(images=img_res, return_tensors="pt").to(device)
    with torch.no_grad():
        outputs = seg_model(**inputs)
    
    logits = torch.nn.functional.interpolate(outputs.logits.cpu(), size=(nh, nw), mode="bilinear")
    pred_seg = logits.argmax(dim=1)[0].numpy()
    
    mask = np.zeros_like(pred_seg, dtype=np.uint8)
    for cid in [4, 5, 6, 7, 8]: # Clothing classes
        mask[pred_seg == cid] = 255
    
    mask = cv2.dilate(mask, np.ones((5, 5), np.uint8), iterations=1)
    return Image.fromarray(mask), img_res

@app.post("/time_wardrobe/")
async def time_wardrobe_api(
    file: UploadFile = File(...),
    era_prompt: str = Form(...),
    is_stall: str = Form("false") # Received as string from FormData
):
    global stall_store
    try:
        content = await file.read()
        raw_img = Image.open(io.BytesIO(content)).convert("RGB")
        mask, resized_img = get_clothing_mask(raw_img)
        
        prompt = f"{era_prompt}, identical face, preserve facial features, high quality"
        
        result = inpaint_pipe(
            prompt=prompt,
            negative_prompt="modern, deformed face, blurry, naked, bad anatomy",
            image=resized_img,
            mask_image=mask,
            guidance_scale=8.5,
            num_inference_steps=50
        ).images[0]

        img_io = io.BytesIO()
        result.save(img_io, format="PNG")
        final_bytes = img_io.getvalue()
        
        # Only update the global display if the request came from the Controller
        if is_stall.lower() == "true":
            stall_store["bytes"] = final_bytes
            stall_store["timestamp"] = time.time()

        return StreamingResponse(io.BytesIO(final_bytes), media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/stall/status")
async def get_status():
    return {"ts": stall_store["timestamp"]}

@app.get("/stall/latest")
async def get_latest():
    if not stall_store["bytes"]:
        raise HTTPException(status_code=404)
    return StreamingResponse(io.BytesIO(stall_store["bytes"]), media_type="image/png")



