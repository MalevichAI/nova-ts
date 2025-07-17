// Test enhanced resource generation with explicit pivot metadata
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import fs from 'node:fs';

async function testEnhancedGeneration() {
  const { generateResources } = require('../dist/resourceGenerator');
  
  console.log('🔧 Testing enhanced resource generation...');
  
  try {
    // Generate resources from the enhanced schema
    await generateResources('/Users/lxbanov/Malevich/centre-api-demo/schema.json', './generated-enhanced');
    
    console.log('✅ Enhanced generation completed');
    
    // Read and verify the enhanced output
    const resourcesContent = fs.readFileSync('./generated-enhanced/resources.ts', 'utf8');
    
    // Test specific improvements
    const tests = [
      {
        name: 'ClientCompanyResource uses explicit pivot',
        test: () => resourcesContent.includes('ClientCompanyResource extends Resource<ClientCompany, \'company\'>')
      },
      {
        name: 'CaseResource uses explicit pivot',
        test: () => resourcesContent.includes('CaseResource extends Resource<Case, \'case\'>')
      },
      {
        name: 'CaseCategoryResource uses explicit pivot',
        test: () => resourcesContent.includes('CaseCategoryResource extends Resource<CaseCategory, \'case_category\'>')
      },
      {
        name: 'TicketChangeResource uses explicit pivot',
        test: () => resourcesContent.includes('TicketChangeResource extends Resource<TicketChange, \'change\'>')
      },
      {
        name: 'All resources extend Resource type',
        test: () => {
          const resourceLines = resourcesContent.split('\n').filter(line => 
            line.includes('export interface') && line.includes('Resource')
          );
          return resourceLines.every(line => line.includes('extends Resource<'));
        }
      }
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const { name, test } of tests) {
      if (test()) {
        console.log(`✅ ${name}`);
        passed++;
      } else {
        console.log(`❌ ${name}`);
        failed++;
      }
    }
    
    // Count total resources generated
    const resourceInterfaces = (resourcesContent.match(/export interface \w+Resource/g) || []).length;
    console.log(`📊 Generated ${resourceInterfaces} resource interfaces`);
    
    console.log(`\n🎯 Test Results: ${passed} passed, ${failed} failed`);
    
    if (failed === 0) {
      console.log('🎉 All enhanced generation tests passed!');
      console.log('✨ The nova-ts generator now uses explicit pivot metadata');
      console.log('📈 Resources are generated with correct type safety');
    } else {
      console.log('⚠️ Some tests failed - check the output above');
    }
    
  } catch (error) {
    console.error('❌ Enhanced generation test failed:', error.message);
    process.exit(1);
  }
}

testEnhancedGeneration(); 