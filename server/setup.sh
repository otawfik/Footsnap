#!/bin/bash
# FootSnap Flask Backend Setup
set -e

echo "🚀 Setting up FootSnap Flask backend..."

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit server/.env and set your FOOTBALL_API_KEY"
echo "     Get a free key at: https://www.football-data.org/client/register"
echo "  2. Activate the venv:   source venv/bin/activate"
echo "  3. Start the server:    python app.py"
echo "     or for production:   gunicorn app:app --bind 0.0.0.0:5000"
