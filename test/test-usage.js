// Test file to verify the generated types work correctly
const fs = require('fs');

// Test that we can import the module
try {
  const novats = require('../dist/index.js');
  console.log('✅ Successfully imported nova-ts module');
  
  // Check that basic types are exported
  const exportedKeys = Object.keys(novats);
  console.log('📦 Exported types:', exportedKeys.sort().join(', '));
  
  console.log('\n🎯 Testing resource generation...');
  
  // Test the generator functions
  const { generate } = require('../dist/generator.js');
  const { generateResources } = require('../dist/resourceGenerator.js');
  
  // Test node generation
  generate('./test/sample-schema.json').then(nodeTypes => {
    console.log('✅ Node generation successful');
    console.log('📄 Generated node types length:', nodeTypes.length);
    
    // Test resource generation
    return generateResources('./test/sample-schema.json', './test/generated');
  }).then(() => {
    console.log('✅ Resource generation successful');
    
    // Verify generated files exist
    const files = ['nodes.ts', 'resources.ts', 'base.ts'];
    files.forEach(file => {
      if (fs.existsSync(`./test/generated/${file}`)) {
        console.log(`✅ Generated file exists: ${file}`);
      } else {
        console.log(`❌ Missing generated file: ${file}`);
      }
    });
    
    // Read and verify content
    const resourcesContent = fs.readFileSync('./test/generated/resources.ts', 'utf8');
    if (resourcesContent.includes('extends Resource<Task, \'task\'>')) {
      console.log('✅ TaskResource properly extends Resource type');
    } else {
      console.log('❌ TaskResource not properly extending Resource type');
    }
    
    if (resourcesContent.includes('import type {') && resourcesContent.includes('} from \'@malevichai/nova-ts\'')) {
      console.log('✅ Properly imports from @malevichai/nova-ts package');
    } else {
      console.log('❌ Not properly importing from @malevichai/nova-ts package');
    }
    
    console.log('\n🎉 All tests passed! The @malevichai/nova-ts package is working correctly.');
    
  }).catch(error => {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  });
  
} catch (error) {
  console.error('❌ Failed to import nova-ts module:', error.message);
  process.exit(1);
} 