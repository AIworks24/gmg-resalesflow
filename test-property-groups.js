// Test script to create property groups for Application #61
const fetch = require('node-fetch');

async function createPropertyGroups() {
  try {
    const response = await fetch('http://localhost:3000/api/admin/create-property-groups', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        applicationId: 61
      })
    });

    const result = await response.json();
    console.log('Result:', result);
  } catch (error) {
    console.error('Error:', error);
  }
}

createPropertyGroups();