#!/bin/bash

set -e  

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' 

RESOURCES_DIR="src-tauri/resources/kokoro"
VOICES_DIR="$RESOURCES_DIR/voices"

echo -e "${BLUE}Creating directories...${NC}"
mkdir -p "$RESOURCES_DIR"
mkdir -p "$VOICES_DIR"

download_file() {
    local url=$1
    local output=$2
    local filename=$(basename "$output")

    echo -e "${BLUE}Downloading $filename...${NC}"

    if command -v wget &> /dev/null; then
        wget --show-progress -O "$output" "$url"
    elif command -v curl &> /dev/null; then
        curl -L --progress-bar -o "$output" "$url"
    else
        echo -e "${RED}Error: Neither wget nor curl is installed${NC}"
        exit 1
    fi

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Successfully downloaded $filename${NC}"
    else
        echo -e "${RED}✗ Failed to download $filename${NC}"
        exit 1
    fi
}

echo -e "${BLUE}Starting download of Kokoro-82M model files...${NC}"
echo ""

download_file "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx" "$RESOURCES_DIR/model.onnx"
echo ""

download_file "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/tree/main/voices/af_heart.bin" "$VOICES_DIR/af_heart.bin"
echo ""

echo -e "${GREEN}All files downloaded successfully!${NC}"
echo -e "${BLUE}Files are located in: $RESOURCES_DIR${NC}"
