#!/bin/bash

# Port where the FastAPI server runs
PORT=8002

echo "======================================"
echo " Restarting Attendance Server"
echo "======================================"

# Find and kill any process currently using the port
PID=$(lsof -ti :$PORT)
if [ ! -z "$PID" ]; then
    echo "Stopping existing server on port $PORT (PID: $PID)..."
    kill -9 $PID
else
    echo "No existing server found on port $PORT."
fi

# Set up or activate the virtual environment
if [ ! -d "venv" ]; then
    echo "Virtual environment not found. Creating 'venv'..."
    python3 -m venv venv
fi

echo "Activating virtual environment..."
source venv/bin/activate

# Optional: Install requirements if anything is missing (usually fast if already met)
echo "Ensuring dependencies are installed..."
pip install -r requirements.txt

echo "======================================"
echo " Starting Server (uvicorn)..."
echo " Live at: http://localhost:$PORT"
echo "======================================"

# Start uvicorn with live reload. Output is streamed to both the terminal and attendance.log
# PYTHONUNBUFFERED=1 prevents python from buffering logs so they appear instantly
export PYTHONUNBUFFERED=1
uvicorn main:app --reload --port $PORT 2>&1 | while IFS= read -r line; do
    ts=$(date "+%Y-%m-%d %H:%M:%S")
    if [[ "$line" == *"ERROR"* || "$line" == *"Exception"* || "$line" == *"Traceback"* || "$line" == *"Failed"* || "$line" == *"500 Internal"* ]]; then
        printf "\033[31m[%s] %s\033[0m\n" "$ts" "$line"
    else
        printf "[%s] %s\n" "$ts" "$line"
    fi
done | tee -a attendance.log
