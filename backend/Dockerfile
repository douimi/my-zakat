FROM python:3.11-slim

WORKDIR /app

# Install system dependencies including ffmpeg for video processing
RUN apt-get update && apt-get install -y \
    gcc \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create uploads directory
RUN mkdir -p uploads/images uploads/videos

# Create certificates directory
RUN mkdir -p certificates

# Expose port
EXPOSE 8000

# Run the application with optimized settings for production
# --log-level info: Shows info, warnings, and errors (change to "warning" for production)
# Python unbuffered output ensures print statements appear immediately
ENV PYTHONUNBUFFERED=1
# --no-access-log: uvicorn's access log was one line per request, including
# every media file, and it bypassed our formatter entirely so none of those
# lines carried a timestamp. Traefik already records access at the edge and
# ships it to Loki, and the audit middleware logs every state-changing request
# with a timestamp and structure. setup_logging() also disables the logger, so
# this flag and that call agree; the flag just avoids the work.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4", "--timeout-keep-alive", "65", "--limit-concurrency", "1000", "--backlog", "2048", "--log-level", "info", "--no-access-log"]
