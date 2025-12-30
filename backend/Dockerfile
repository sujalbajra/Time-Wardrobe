# Dockerfile

# Use a PyTorch base image with CUDA support. This is crucial for GPU usage.
# Adapt the version to match your PyTorch/CUDA setup if different.
# This specific image includes Python, PyTorch, CUDA, and cuDNN.
FROM pytorch/pytorch:2.0.1-cuda11.7-cudnn8-runtime

# Set the working directory inside the container
WORKDIR /app

# Install system dependencies
# libgl1-mesa-glx and libglib2.0-0 are often required by Pillow/OpenCV for image processing.
# Also ensure you have git if diffusers/transformers needs to download models (though from_pretrained handles much of this).
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy the requirements file into the container
COPY requirements.txt .

# Install Python dependencies
# --no-cache-dir prevents pip from storing cache, reducing image size.
RUN pip install --no-cache-dir -r requirements.txt

# Copy your FastAPI application code into the container
COPY . .

# Expose the port that your FastAPI application will run on (default for Uvicorn)
EXPOSE 8000

# Command to run the application using Uvicorn
# 'app:app' refers to the 'app' variable in 'app.py'
# --host 0.0.0.0 makes the server accessible from outside the container
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]