/**
 * Test script to verify Gemini API models and functionality
 * Run with: node test-gemini-api.js
 */

// Try to load env from multiple locations
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

// Try new SDK first, fallback to legacy
let GoogleGenAI, GoogleGenerativeAI;
let useNewSDK = false;

try {
  const genai = require('@google/genai');
  GoogleGenAI = genai.GoogleGenAI;
  useNewSDK = true;
  console.log('✅ Using new SDK: @google/genai\n');
} catch (error) {
  const genai = require('@google/generative-ai');
  GoogleGenerativeAI = genai.GoogleGenerativeAI;
  useNewSDK = false;
  console.log('⚠️  Using legacy SDK: @google/generative-ai\n');
}

async function testGeminiModels() {
  // Check if API key is available
  // Can be provided as: node test-gemini-api.js YOUR_API_KEY
  // Or set as: GOOGLE_API_KEY=xxx node test-gemini-api.js
  const apiKey = process.argv[2] || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.error('❌ GOOGLE_API_KEY or GEMINI_API_KEY not found');
    console.error('\nUsage options:');
    console.error('  1. Set environment variable:');
    console.error('     GOOGLE_API_KEY=your_key node test-gemini-api.js');
    console.error('  2. Pass as argument:');
    console.error('     node test-gemini-api.js your_api_key');
    console.error('  3. Create .env.local file with:');
    console.error('     GOOGLE_API_KEY=your_key');
    process.exit(1);
  }

  console.log('🔑 API Key found:', apiKey.substring(0, 10) + '...');
  console.log('\n🧪 Testing Gemini API models...\n');

  const client = useNewSDK 
    ? new GoogleGenAI({ apiKey })
    : new GoogleGenerativeAI(apiKey);

  // List of models to test (based on official docs)
  const modelsToTest = [
    'gemini-2.5-flash',        // Free tier, recommended
    'gemini-3-flash-preview', // Latest preview
    'gemini-2.5-pro',         // More capable
    'gemini-2.5-flash-lite',  // Fastest
    'gemini-1.5-flash',       // Legacy fallback
    'gemini-1.5-pro',         // Legacy fallback
  ];

  console.log('📝 Testing TEXT generation...\n');
  
  const textPrompt = 'Say "Hello, this is a test" in JSON format: {"message": "..."}';
  const textResults = {};

  for (const modelName of modelsToTest) {
    try {
      console.log(`  Testing ${modelName}...`);
      let text;
      
      if (useNewSDK) {
        // New SDK API structure
        const result = await client.models.generateContent({
          model: modelName,
          contents: [{ text: textPrompt }]
        });
        text = result.text || result.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } else {
        // Legacy SDK API structure
        const model = client.getGenerativeModel({ model: modelName });
        const result = await model.generateContent({ 
          contents: [{ role: 'user', parts: [{ text: textPrompt }] }] 
        });
        const response = await result.response;
        text = response.text();
      }
      
      textResults[modelName] = { success: true, response: text.substring(0, 100) };
      console.log(`    ✅ SUCCESS: ${text.substring(0, 50)}...\n`);
    } catch (error) {
      textResults[modelName] = { success: false, error: error.message };
      const errorMsg = error.message.includes('404') ? '❌ Model not found (404)' : 
                      error.message.includes('403') ? '❌ Permission denied (403)' :
                      error.message.includes('400') ? '❌ Bad request (400)' : 
                      `❌ Error: ${error.message.substring(0, 80)}`;
      console.log(`    ${errorMsg}\n`);
    }
  }

  console.log('\n🖼️  Testing VISION (image analysis)...\n');
  
  // Create a simple test image (1x1 pixel PNG in base64)
  const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  
  const visionPrompt = 'What is in this image? Respond with JSON: {"description": "..."}';
  const visionResults = {};

  for (const modelName of modelsToTest) {
    try {
      console.log(`  Testing ${modelName}...`);
      let text;
      
      if (useNewSDK) {
        // New SDK API structure
        const result = await client.models.generateContent({
          model: modelName,
          contents: [
            { text: visionPrompt },
            {
              inlineData: {
                mimeType: 'image/png',
                data: testImageBase64
              }
            }
          ]
        });
        text = result.text || result.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } else {
        // Legacy SDK API structure
        const model = client.getGenerativeModel({ model: modelName });
        const result = await model.generateContent({
          contents: [{
            role: 'user',
            parts: [
              { text: visionPrompt },
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: testImageBase64
                }
              }
            ]
          }]
        });
        const response = await result.response;
        text = response.text();
      }
      
      visionResults[modelName] = { success: true, response: text.substring(0, 100) };
      console.log(`    ✅ SUCCESS: ${text.substring(0, 50)}...\n`);
    } catch (error) {
      visionResults[modelName] = { success: false, error: error.message };
      const errorMsg = error.message.includes('404') ? '❌ Model not found (404)' : 
                      error.message.includes('403') ? '❌ Permission denied (403)' :
                      error.message.includes('400') ? '❌ Bad request (400)' : 
                      error.message.includes('vision') ? '❌ Vision not supported' :
                      `❌ Error: ${error.message.substring(0, 80)}`;
      console.log(`    ${errorMsg}\n`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  
  console.log('\n✅ Working TEXT models:');
  const workingText = Object.entries(textResults).filter(([_, r]) => r.success);
  if (workingText.length > 0) {
    workingText.forEach(([model, result]) => {
      console.log(`   • ${model}`);
    });
  } else {
    console.log('   ❌ No working text models found');
  }

  console.log('\n✅ Working VISION models:');
  const workingVision = Object.entries(visionResults).filter(([_, r]) => r.success);
  if (workingVision.length > 0) {
    workingVision.forEach(([model, result]) => {
      console.log(`   • ${model}`);
    });
  } else {
    console.log('   ❌ No working vision models found');
  }

  console.log('\n❌ Failed models:');
  const failed = Object.entries(textResults).filter(([_, r]) => !r.success);
  if (failed.length > 0) {
    failed.forEach(([model, result]) => {
      const errorType = result.error.includes('404') ? 'Not Found' :
                       result.error.includes('403') ? 'Permission Denied' :
                       result.error.includes('400') ? 'Bad Request' : 'Error';
      console.log(`   • ${model}: ${errorType}`);
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log('💡 RECOMMENDATIONS:');
  console.log('='.repeat(60));
  
  if (workingText.length > 0) {
    console.log(`\nUse this model for TEXT generation: ${workingText[0][0]}`);
    console.log(`   Add to .env.local: GEMINI_MODEL_TEXT=${workingText[0][0]}`);
  }
  
  if (workingVision.length > 0) {
    console.log(`\nUse this model for VISION: ${workingVision[0][0]}`);
    console.log(`   Add to .env.local: GEMINI_MODEL_VISION=${workingVision[0][0]}`);
  }
  
  if (workingText.length === 0 && workingVision.length === 0) {
    console.log('\n⚠️  No working models found. Possible issues:');
    console.log('   1. API key might be invalid or expired');
    console.log('   2. API key might not have access to Gemini models');
    console.log('   3. SDK version might be outdated');
    console.log('   4. Models might require different API endpoint');
    console.log('\n   Try: npm install @google/generative-ai@latest');
  }

  console.log('\n');
}

// Run the test
console.log('🚀 Starting Gemini API Test...\n');
testGeminiModels().catch(error => {
  console.error('\n❌ Test failed:', error.message);
  if (error.stack) {
    console.error('\nStack trace:', error.stack);
  }
  process.exit(1);
});

