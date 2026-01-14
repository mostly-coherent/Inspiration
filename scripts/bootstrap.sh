#!/bin/bash
# Inspiration Fast Start Bootstrap
# One-command setup for local development

set -e

echo "🚀 Inspiration Fast Start Bootstrap"
echo "===================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track if we have all prerequisites
PREREQS_OK=true

# 1. Check Node.js
echo "📦 Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -ge 18 ]; then
        echo -e "   ${GREEN}✓${NC} Node.js $(node -v) found"
    else
        echo -e "   ${YELLOW}⚠${NC} Node.js $(node -v) found, but v18+ recommended"
    fi
else
    echo -e "   ${RED}✗${NC} Node.js not found"
    echo ""
    echo "   To install Node.js:"
    echo "   • macOS: brew install node"
    echo "   • Windows: Download from https://nodejs.org"
    echo ""
    PREREQS_OK=false
fi

# 2. Check Python
echo "📦 Checking Python..."
PYTHON_CMD=""
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    # Check if it's Python 3
    PY_VERSION=$(python --version 2>&1 | cut -d' ' -f2 | cut -d'.' -f1)
    if [ "$PY_VERSION" = "3" ]; then
        PYTHON_CMD="python"
    fi
fi

if [ -n "$PYTHON_CMD" ]; then
    PY_FULL_VERSION=$($PYTHON_CMD --version 2>&1 | cut -d' ' -f2)
    PY_MINOR=$($PYTHON_CMD --version 2>&1 | cut -d' ' -f2 | cut -d'.' -f2)
    if [ "$PY_MINOR" -ge 10 ]; then
        echo -e "   ${GREEN}✓${NC} Python $PY_FULL_VERSION found"
    else
        echo -e "   ${YELLOW}⚠${NC} Python $PY_FULL_VERSION found, but 3.10+ recommended"
    fi
else
    echo -e "   ${RED}✗${NC} Python 3 not found"
    echo ""
    echo "   To install Python:"
    echo "   • macOS: brew install python@3.11"
    echo "   • Windows: Download from https://python.org"
    echo ""
    PREREQS_OK=false
fi

# 3. Check pip
echo "📦 Checking pip..."
if [ -n "$PYTHON_CMD" ]; then
    if $PYTHON_CMD -m pip --version &> /dev/null; then
        echo -e "   ${GREEN}✓${NC} pip found"
    else
        echo -e "   ${RED}✗${NC} pip not found"
        echo ""
        echo "   To install pip:"
        echo "   • Run: $PYTHON_CMD -m ensurepip --upgrade"
        echo ""
        PREREQS_OK=false
    fi
fi

# Exit if prerequisites not met
if [ "$PREREQS_OK" = false ]; then
    echo ""
    echo -e "${RED}❌ Prerequisites not met. Please install missing dependencies and try again.${NC}"
    exit 1
fi

echo ""
echo "📦 Installing Node.js dependencies..."
npm install

echo ""
echo "📦 Installing Python dependencies..."

# Create virtual environment if it doesn't exist
if [ ! -d "engine/.venv" ]; then
    echo "   Creating Python virtual environment..."
    $PYTHON_CMD -m venv engine/.venv
fi

# Activate venv and install
if [ -f "engine/.venv/bin/activate" ]; then
    # macOS/Linux
    source engine/.venv/bin/activate
    pip install -r engine/requirements-fast.txt
    deactivate
elif [ -f "engine/.venv/Scripts/activate" ]; then
    # Windows (Git Bash)
    source engine/.venv/Scripts/activate
    pip install -r engine/requirements-fast.txt
    deactivate
else
    # Fallback: install globally
    echo "   (Installing globally - venv activation failed)"
    $PYTHON_CMD -m pip install -r engine/requirements-fast.txt
fi

echo ""
echo -e "${GREEN}✅ Bootstrap complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Run: npm run dev"
echo "  2. Open: http://localhost:3000"
echo "  3. Paste your LLM API key (Anthropic/OpenAI/OpenRouter)"
echo "  4. Generate your first Theme Map!"
echo ""
