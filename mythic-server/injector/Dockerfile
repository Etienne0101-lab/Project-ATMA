FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libjpeg-dev \
    zlib1g-dev \
    libpng-dev \
    && rm -rf /var/lib/apt/lists/*

# Create and set working directory
WORKDIR /app/injector

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the injector module
COPY . .

# Create entry point script
RUN echo '#!/bin/bash' > /app/injector-entrypoint.sh && \
    echo 'cd /app/injector' >> /app/injector-entrypoint.sh && \
    echo 'exec python3 ps_instructions_inject.py "$@"' >> /app/injector-entrypoint.sh && \
    chmod +x /app/injector-entrypoint.sh

# Expose port for web API (if running as service)
EXPOSE 5000

# Set default command
ENTRYPOINT ["/app/injector-entrypoint.sh"]
CMD ["--help"]
