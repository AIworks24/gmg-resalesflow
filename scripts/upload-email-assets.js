/**
 * Script to optimize and upload email assets (logos, etc.) to Supabase storage.
 * 
 * This script helps keep email HTML size small by hosting assets externally,
 * preventing Gmail's 102KB clipping threshold.
 * 
 * Usage:
 *   1. Install dependencies: npm install --save-dev sharp
 *   2. Set environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   3. Run: node scripts/upload-email-assets.js
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
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Assets to optimize and upload
const EMAIL_ASSETS = [
  {
    name: 'company_logo_white',
    sourcePath: path.join(__dirname, '../assets/company_logo_white.png'),
    fallbackPath: path.join(__dirname, '../public/company_logo_white.png'),
    storagePath: 'assets/company_logo_white.png',
    width: 200, // Max width for email (will maintain aspect ratio)
    height: null, // Auto height
    description: 'Company logo (white version) for email headers'
  }
];

/**
 * Optimize and compress PNG image
 */
async function optimizeImage(inputPath, outputPath, width, height = null) {
  try {
    const image = sharp(inputPath);
    const metadata = await image.metadata();
    
    // Calculate height if not provided (maintain aspect ratio)
    let targetHeight = height;
    if (!targetHeight && width && metadata.width) {
      targetHeight = Math.round((width / metadata.width) * metadata.height);
    }
    
    // Optimize PNG for email
    await image
      .resize(width, targetHeight, {
        fit: 'inside', // Maintain aspect ratio, fit within dimensions
        withoutEnlargement: true // Don't upscale small images
      })
      .png({
        quality: 90,
        compressionLevel: 9, // Maximum compression
        palette: true, // Use palette for smaller file size
        colors: 256,
        adaptiveFiltering: true
      })
      .toFile(outputPath);
    
    // Get file size
    const stats = fs.statSync(outputPath);
    return stats.size;
  } catch (error) {
    console.error(`Error optimizing image:`, error.message);
    throw error;
  }
}

/**
 * Upload file to Supabase storage
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
 * Get file size in KB
 */
function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return (stats.size / 1024).toFixed(2);
  } catch (error) {
    return 'N/A';
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting email assets upload process...\n');
  
  const tempDir = path.join(__dirname, '../temp-email-assets');
  
  // Create temp directory
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const results = [];
  
  for (const asset of EMAIL_ASSETS) {
    console.log(`Processing ${asset.name}...`);
    
    try {
      // Find source file (try primary path, then fallback)
      let sourceFile = null;
      if (fs.existsSync(asset.sourcePath)) {
        sourceFile = asset.sourcePath;
      } else if (asset.fallbackPath && fs.existsSync(asset.fallbackPath)) {
        sourceFile = asset.fallbackPath;
      }
      
      if (!sourceFile) {
        console.warn(`  ⚠️  Source file not found: ${asset.sourcePath}`);
        if (asset.fallbackPath) {
          console.warn(`  ⚠️  Fallback file not found: ${asset.fallbackPath}`);
        }
        continue;
      }
      
      const originalSize = getFileSize(sourceFile);
      console.log(`  📄 Found source file (${originalSize} KB)`);
      
      // Optimize image
      const tempPngPath = path.join(tempDir, `${asset.name}.png`);
      const optimizedSize = await optimizeImage(sourceFile, tempPngPath, asset.width, asset.height);
      const optimizedSizeKB = (optimizedSize / 1024).toFixed(2);
      const savings = ((1 - optimizedSize / (parseFloat(originalSize) * 1024)) * 100).toFixed(1);
      console.log(`  ✓ Optimized to PNG (${optimizedSizeKB} KB${savings > 0 ? `, ${savings}% smaller` : ''})`);
      
      // Upload to Supabase
      const publicUrl = await uploadToSupabase(tempPngPath, asset.storagePath);
      console.log(`  ✓ Uploaded to Supabase: ${publicUrl}`);
      
      results.push({
        name: asset.name,
        description: asset.description,
        publicUrl,
        originalSize: parseFloat(originalSize),
        optimizedSize: parseFloat(optimizedSizeKB),
        savings: parseFloat(savings)
      });
      
      // Clean up temp file
      fs.unlinkSync(tempPngPath);
      
    } catch (error) {
      console.error(`  ❌ Error processing ${asset.name}:`, error.message);
    }
  }
  
  // Clean up temp directory
  if (fs.existsSync(tempDir)) {
    try {
      fs.rmdirSync(tempDir);
    } catch (e) {
      // Directory might not be empty, ignore
    }
  }
  
  // Print summary
  console.log('\n📊 Summary:');
  console.log('='.repeat(80));
  results.forEach(result => {
    console.log(`${result.name.padEnd(25)} ${result.originalSize.toFixed(2).padStart(8)} KB → ${result.optimizedSize.toFixed(2).padStart(6)} KB (${result.savings > 0 ? '-' : '+'}${Math.abs(result.savings).toFixed(1)}%)`);
    console.log(`  ${result.publicUrl}`);
  });
  
  const totalOriginal = results.reduce((sum, r) => sum + r.originalSize, 0);
  const totalOptimized = results.reduce((sum, r) => sum + r.optimizedSize, 0);
  const totalSavings = ((1 - totalOptimized / totalOriginal) * 100).toFixed(1);
  
  console.log('='.repeat(80));
  console.log(`Total: ${results.length} asset(s), ${totalOriginal.toFixed(2)} KB → ${totalOptimized.toFixed(2)} KB (${totalSavings}% reduction)\n`);
  
  console.log('✅ Done!');
  console.log('\n💡 Tip: The email service is already configured to use these URLs via NEXT_PUBLIC_SUPABASE_URL');
}

// Run the script
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

