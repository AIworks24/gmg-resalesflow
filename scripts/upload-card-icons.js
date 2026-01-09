/**
 * Script to extract SVG icons from react-svg-credit-card-payment-icons,
 * convert them to optimized PNG images, and upload to Supabase storage.
 * 
 * This script helps keep email HTML size small by hosting card icons externally,
 * preventing Gmail's 102KB clipping threshold.
 * 
 * Usage:
 *   1. Install dependencies: npm install --save-dev sharp
 *   2. Set environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   3. Run: node scripts/upload-card-icons.js
 */

// Load environment variables from .env.local or .env
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

// Try .env.local first, then .env
const envPath = path.resolve(__dirname, '../.env.local');
const envPathFallback = path.resolve(__dirname, '../.env');

const result = dotenv.config({ path: envPath });
if (result.error) {
  dotenv.config({ path: envPathFallback });
}

// Card brands we want to support (matching Stripe's supported brands)
const CARD_BRANDS = [
  { name: 'visa', displayName: 'VISA', stripeBrand: 'visa' },
  { name: 'mastercard', displayName: 'MASTERCARD', stripeBrand: 'mastercard' },
  { name: 'americanexpress', displayName: 'AMEX', stripeBrand: 'amex' },
  { name: 'discover', displayName: 'DISCOVER', stripeBrand: 'discover' },
  { name: 'dinersclub', displayName: 'DINERS', stripeBrand: 'diners' },
  { name: 'jcb', displayName: 'JCB', stripeBrand: 'jcb' },
];

// Check if sharp is available
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.error('❌ Error: sharp is not installed.');
  console.error('Please install it with: npm install --save-dev sharp');
  process.exit(1);
}

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Missing required environment variables:');
  if (!supabaseUrl) console.error('   - NEXT_PUBLIC_SUPABASE_URL');
  if (!supabaseKey) console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  console.error('');
  console.error('💡 Tip: Make sure these are set in your .env.local or .env file');
  console.error('   Or export them in your shell before running the script:');
  console.error('   export NEXT_PUBLIC_SUPABASE_URL="your-url"');
  console.error('   export SUPABASE_SERVICE_ROLE_KEY="your-key"');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Extract SVG string from React component file
 * The components are re-exports, so we need to find and read the chunk files
 */
function extractSvgFromComponent(componentPath) {
  try {
    const content = fs.readFileSync(componentPath, 'utf8');
    const componentDir = path.dirname(componentPath);
    
    // The component files are re-exports that require chunk files
    // Find the first chunk file reference (usually the default export)
    // Match: require('./chunk-HJZSDYLT.js') or require('./chunk-HJZSDYLT')
    const chunkMatch = content.match(/require\(['"]\.\/(chunk-[^'"]+)(?:\.js)?['"]\)/);
    
    if (!chunkMatch) {
      // Try to find viewBox directly in the file (might be a direct component)
      return extractSvgFromContent(content);
    }
    
    // Read the chunk file (add .js if not already present)
    const chunkName = chunkMatch[1].endsWith('.js') ? chunkMatch[1] : `${chunkMatch[1]}.js`;
    const chunkPath = path.join(componentDir, chunkName);
    
    if (!fs.existsSync(chunkPath)) {
      throw new Error(`Chunk file not found: ${chunkPath}`);
    }
    
    const chunkContent = fs.readFileSync(chunkPath, 'utf8');
    return extractSvgFromContent(chunkContent);
  } catch (error) {
    console.error(`Error extracting SVG from ${componentPath}:`, error.message);
    return null;
  }
}

/**
 * Extract SVG from file content (chunk file or direct component)
 */
function extractSvgFromContent(content) {
  // Find the SVG viewBox (in createElement format: viewBox: "0 0 780 500")
  const viewBoxMatch = content.match(/viewBox[:\s]*"([^"]+)"/);
  if (!viewBoxMatch) {
    throw new Error('Could not find viewBox in component');
  }
  const viewBox = viewBoxMatch[1];
  
  // Extract path data and fill colors from createElement format
  // Pattern: d: "M780 0H0V500H780V0Z", fill: "#1434CB"
  const pathDataRegex = /d:\s*"([^"]+)"/g;
  const fillRegex = /fill:\s*"([^"]+)"/g;
  
  const paths = [];
  const fills = [];
  
  let dataMatch;
  while ((dataMatch = pathDataRegex.exec(content)) !== null) {
    paths.push(dataMatch[1]);
  }
  
  let fillMatch;
  while ((fillMatch = fillRegex.exec(content)) !== null) {
    fills.push(fillMatch[1]);
  }
  
  if (paths.length === 0) {
    throw new Error('Could not extract path data');
  }
  
  // Build SVG from extracted data
  // Match paths with fills (use corresponding fill or first available)
  const svgPaths = paths.map((d, i) => {
    const fill = fills[i] !== undefined ? fills[i] : (fills[0] || '#000000');
    return `  <path d="${d}" fill="${fill}"/>`;
  }).join('\n');
  
  // Check for clipPath definitions
  const clipPathMatch = content.match(/clipPath[^}]*id[:\s]*"([^"]+)"/);
  let clipPathDef = '';
  let useClipPath = false;
  
  if (clipPathMatch) {
    const clipId = clipPathMatch[1];
    // Try to find rect definition for clipPath
    const rectMatch = content.match(/rect[^}]*width[:\s]*(\d+)[^}]*height[:\s]*(\d+)/);
    if (rectMatch) {
      clipPathDef = `  <defs>
    <clipPath id="${clipId}">
      <rect width="${rectMatch[1]}" height="${rectMatch[2]}" fill="white"/>
    </clipPath>
  </defs>`;
      useClipPath = true;
    }
  }
  
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg">
${useClipPath ? `  <g clip-path="url(#${clipPathMatch[1]})">\n${svgPaths}\n  </g>` : svgPaths}
${clipPathDef}
</svg>`;
  
  return svg;
}

/**
 * Convert SVG to optimized PNG
 */
async function convertSvgToPng(svgString, outputPath, width = 120, height = 80) {
  try {
    const svgBuffer = Buffer.from(svgString);
    
    // Convert SVG to PNG with sharp
    // Use high quality but optimize for small file size
    await sharp(svgBuffer)
      .resize(width, height, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 } // Transparent background
      })
      .png({
        quality: 90,
        compressionLevel: 9,
        palette: true, // Use palette for smaller file size
        colors: 256
      })
      .toFile(outputPath);
    
    // Get file size
    const stats = fs.statSync(outputPath);
    return stats.size;
  } catch (error) {
    console.error(`Error converting SVG to PNG:`, error.message);
    throw error;
  }
}

/**
 * Upload PNG to Supabase storage
 */
async function uploadToSupabase(filePath, storagePath) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    
    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from('bucket0')
      .upload(storagePath, fileBuffer, {
        contentType: 'image/png',
        upsert: true, // Replace if exists
      });
    
    if (error) {
      throw error;
    }
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('bucket0')
      .getPublicUrl(storagePath);
    
    return publicUrl;
  } catch (error) {
    console.error(`Error uploading to Supabase:`, error.message);
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting card icon upload process...\n');
  
  const iconsDir = path.join(__dirname, '../node_modules/react-svg-credit-card-payment-icons/dist');
  const tempDir = path.join(__dirname, '../temp-card-icons');
  
  // Create temp directory
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const results = [];
  
  for (const brand of CARD_BRANDS) {
    console.log(`Processing ${brand.displayName}...`);
    
    try {
      // Find the component file
      const componentFile = path.join(iconsDir, `${brand.name}.js`);
      
      if (!fs.existsSync(componentFile)) {
        console.warn(`  ⚠️  Component file not found: ${componentFile}`);
        continue;
      }
      
      // Extract SVG
      const svgString = extractSvgFromComponent(componentFile);
      if (!svgString) {
        console.warn(`  ⚠️  Could not extract SVG for ${brand.displayName}`);
        continue;
      }
      
      // Convert to PNG
      const tempPngPath = path.join(tempDir, `${brand.name}.png`);
      const fileSize = await convertSvgToPng(svgString, tempPngPath, 120, 80);
      console.log(`  ✓ Converted to PNG (${(fileSize / 1024).toFixed(2)} KB)`);
      
      // Upload to Supabase
      const storagePath = `assets/card-icons/${brand.name}.png`;
      const publicUrl = await uploadToSupabase(tempPngPath, storagePath);
      console.log(`  ✓ Uploaded to Supabase: ${publicUrl}`);
      
      results.push({
        brand: brand.displayName,
        stripeBrand: brand.stripeBrand,
        publicUrl,
        fileSize,
      });
      
      // Clean up temp file
      fs.unlinkSync(tempPngPath);
      
    } catch (error) {
      console.error(`  ❌ Error processing ${brand.displayName}:`, error.message);
    }
  }
  
  // Clean up temp directory
  if (fs.existsSync(tempDir)) {
    fs.rmdirSync(tempDir);
  }
  
  // Print summary
  console.log('\n📊 Summary:');
  console.log('='.repeat(60));
  results.forEach(result => {
    console.log(`${result.brand.padEnd(15)} ${(result.fileSize / 1024).toFixed(2).padStart(6)} KB  ${result.publicUrl}`);
  });
  
  const totalSize = results.reduce((sum, r) => sum + r.fileSize, 0);
  console.log('='.repeat(60));
  console.log(`Total: ${results.length} icons, ${(totalSize / 1024).toFixed(2)} KB\n`);
  
  // Generate code snippet for emailService.js
  console.log('📝 Code snippet for emailService.js:');
  console.log('='.repeat(60));
  console.log(`
// Card icon URLs from Supabase storage
const getCardIconUrl = (brand) => {
  const brandUpper = brand?.toUpperCase();
  const iconMap = {
${results.map(r => `    '${r.stripeBrand.toUpperCase()}': '${r.publicUrl}',`).join('\n')}
  };
  return iconMap[brandUpper] || null;
};
  `);
  
  console.log('\n✅ Done!');
}

// Run the script
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

