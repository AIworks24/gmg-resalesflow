# Installing Canvas for AI Form Builder

The AI Form Builder requires the `canvas` package for PDF to image conversion when analyzing PDFs without fillable form fields.

## Installation

### macOS

1. Install system dependencies using Homebrew:
```bash
brew install pkg-config cairo pango libpng jpeg giflib librsvg
```

2. Install the canvas package:
```bash
npm install canvas
```

### Ubuntu/Debian

1. Install system dependencies:
```bash
sudo apt-get update
sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
```

2. Install the canvas package:
```bash
npm install canvas
```

### Windows

1. Install [node-gyp](https://github.com/nodejs/node-gyp) prerequisites:
   - Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)
   - Install Python 3.x

2. Install the canvas package:
```bash
npm install canvas
```

## Verification

After installation, restart your development server. The AI Form Builder should now be able to:
- Convert PDF pages to images
- Use AI vision to extract form fields from non-fillable PDFs
- Generate proper field labels from PDF images

## Alternative

If you cannot install canvas, you can:
1. Use the Visual Form Builder to create forms from scratch
2. Ensure your PDFs have interactive form fields with proper names
3. Use PDFs that already have fillable form fields

## Troubleshooting

If you encounter errors:
- Make sure all system dependencies are installed
- Try rebuilding: `npm rebuild canvas`
- Check Node.js version compatibility (Node 18+ recommended)

