require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');

// Get Supabase credentials
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials!');
  console.error('Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Convert a value to CSV-safe format
 */
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  
  const str = String(value);
  
  // If contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  
  return str;
}

/**
 * Export a table to both JSON and CSV
 */
async function exportTable(tableName) {
  console.log(`📥 Exporting ${tableName}...`);
  
  try {
    // Fetch all data (you may want to add pagination for very large tables)
    const { data, error } = await supabase
      .from(tableName)
      .select('*');
    
    if (error) {
      console.error(`❌ Error exporting ${tableName}:`, error.message);
      return { table: tableName, success: false, error: error.message };
    }
    
    const rowCount = data?.length || 0;
    console.log(`   Found ${rowCount} rows`);
    
    if (rowCount === 0) {
      console.log(`   ⚠️  Table ${tableName} is empty`);
      return { table: tableName, success: true, rows: 0 };
    }
    
    // Export as JSON
    const jsonPath = path.join(__dirname, '../database-exports', `${tableName}.json`);
    await fs.writeFile(jsonPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`   ✅ JSON: ${jsonPath}`);
    
    // Export as CSV
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => escapeCSV(row[header])).join(',')
      )
    ];
    
    const csvPath = path.join(__dirname, '../database-exports', `${tableName}.csv`);
    await fs.writeFile(csvPath, csvRows.join('\n'), 'utf8');
    console.log(`   ✅ CSV:  ${csvPath}`);
    
    return { table: tableName, success: true, rows: rowCount };
    
  } catch (error) {
    console.error(`❌ Unexpected error exporting ${tableName}:`, error.message);
    return { table: tableName, success: false, error: error.message };
  }
}

/**
 * Get list of all tables in the database
 */
async function getAllTables() {
  try {
    // Query information_schema to get all tables
    const { data, error } = await supabase.rpc('exec_sql', {
      query: `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name;
      `
    });
    
    // If RPC doesn't work, use the hardcoded list
    if (error) {
      console.log('⚠️  Could not fetch table list automatically, using predefined list');
      return [
        'applications',
        'profiles',
        'hoa_properties',
        'property_owner_forms',
        'notifications',
        'application_property_groups',
        'property_documents',
        // Add more tables as needed
      ];
    }
    
    return data?.map(row => row.table_name) || [];
  } catch (error) {
    console.log('⚠️  Could not fetch table list, using predefined list');
    return [
      'applications',
      'profiles',
      'hoa_properties',
      'property_owner_forms',
      'notifications',
      'application_property_groups',
      'property_documents',
    ];
  }
}

/**
 * Main export function
 */
async function exportDatabase() {
  console.log('🚀 Starting database export...\n');
  
  // Create exports directory
  const exportDir = path.join(__dirname, '../database-exports');
  try {
    await fs.mkdir(exportDir, { recursive: true });
    console.log(`📁 Export directory: ${exportDir}\n`);
  } catch (error) {
    console.error('❌ Could not create export directory:', error.message);
    process.exit(1);
  }
  
  // Get list of tables
  const tables = await getAllTables();
  console.log(`📋 Found ${tables.length} tables to export:\n`);
  tables.forEach((table, i) => console.log(`   ${i + 1}. ${table}`));
  console.log('');
  
  // Export each table
  const results = [];
  for (const table of tables) {
    const result = await exportTable(table);
    results.push(result);
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 300));
    console.log('');
  }
  
  // Summary
  console.log('📊 Export Summary:');
  console.log('═'.repeat(50));
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const totalRows = results.reduce((sum, r) => sum + (r.rows || 0), 0);
  
  console.log(`✅ Successful: ${successful.length}/${results.length}`);
  console.log(`❌ Failed: ${failed.length}/${results.length}`);
  console.log(`📦 Total rows exported: ${totalRows.toLocaleString()}`);
  
  if (failed.length > 0) {
    console.log('\n❌ Failed tables:');
    failed.forEach(r => {
      console.log(`   - ${r.table}: ${r.error}`);
    });
  }
  
  console.log(`\n✅ Export complete! Files saved to: ${exportDir}`);
  console.log('\n💡 Tip: Add "database-exports/" to .gitignore to avoid committing data');
}

// Run export
exportDatabase().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});



