/**
 * Test script to verify Gemini API is working
 * Run with: node test-gemini.js
 */

require('dotenv').config({ path: '.env.local' });

async function testGemini() {
  console.log('Testing Gemini API...');
  console.log('API Key configured:', !!process.env.GOOGLE_API_KEY);
  console.log('API Key (first 20 chars):', process.env.GOOGLE_API_KEY?.substring(0, 20));
  
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    console.log('✅ Gemini client initialized');
    
    // Test text generation with gemini-1.5-flash (most reliable free model)
    console.log('\\nTesting with gemini-1.5-flash...');
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const prompt = 'Say "Hello! I am working correctly." in JSON format with a key "message".';
    
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    
    const response = await result.response;
    const text = response.text();
    
    console.log('\\n✅ Gemini API Response:');
    console.log(text);
    
    // Try to parse JSON
    try {
      const jsonMatch = text.match(/```(?:json)?\\s*([\\s\\S]*?)\\s*```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        console.log('\\n✅ Parsed JSON:', parsed);
      } else {
        const parsed = JSON.parse(text);
        console.log('\\n✅ Parsed JSON:', parsed);
      }
    } catch (e) {
      console.log('\\n⚠️  Response is not JSON, but API is working!');
    }
    
    console.log('\\n✅ SUCCESS! Gemini API is working correctly.');
    
  } catch (error) {
    console.error('\\n❌ ERROR:', error.message);
    console.error('\\nFull error:', error);
    
    if (error.message.includes('API_KEY_INVALID')) {
      console.error('\\n⚠️  Your GOOGLE_API_KEY appears to be invalid.');
      console.error('Get a new key from: https://ai.google.dev/');
    }
    
    process.exit(1);
  }
}

testGemini();
