# Use a slim Python image for a smaller footprint
FROM python:3.12-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
ENV WORKDIR /app

# Set work directory
WORKDIR $WORKDIR

# Install system dependencies
# git is required for the specific androidtvremote2 dependency in requirements.txt
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
# We copy requirements.txt first to leverage Docker's layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Ensure certs directory exists for persistence mapping
RUN mkdir -p certs

# Expose the app port
EXPOSE 8504

# Run the application
# Note: --host 0.0.0.0 is required to be reachable from outside the container
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8504"]
