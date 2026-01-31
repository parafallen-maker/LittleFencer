#!/bin/bash

# LittleFencer Web - Development Server Script
# Usage: ./serve.sh [port]

PORT=${1:-8080}

echo "🤺 LittleFencer Web App"
echo "========================"
echo ""

# Check for Python 3
if command -v python3 &> /dev/null; then
    echo "📡 Starting server at http://localhost:$PORT"
    echo "📱 Scan QR code or visit URL on your phone (same WiFi)"
    echo ""
    echo "Press Ctrl+C to stop"
    echo ""
    
    # Get local IP for mobile access
    if command -v ifconfig &> /dev/null; then
        LOCAL_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)
        if [ ! -z "$LOCAL_IP" ]; then
            echo "📲 Mobile URL: http://$LOCAL_IP:$PORT"
            echo ""
        fi
    fi
    
    python3 -m http.server $PORT
    
elif command -v python &> /dev/null; then
    echo "📡 Starting server at http://localhost:$PORT"
    python -m SimpleHTTPServer $PORT
    
else
    echo "❌ Python not found. Please install Python 3."
    echo ""
    echo "Alternative: Use any HTTP server:"
    echo "  npx serve ."
    echo "  npx http-server ."
    exit 1
fi
