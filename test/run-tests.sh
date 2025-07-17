#!/bin/bash

echo "🚀 Running nova-ts tests..."
echo "=========================="

# Build the project
echo "📦 Building project..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

# Test module imports and generation
echo "🧪 Testing module functionality..."
node test/test-usage.js
if [ $? -ne 0 ]; then
    echo "❌ Module tests failed"
    exit 1
fi

# Test TypeScript type safety
echo "🔍 Testing TypeScript type safety..."
npx tsc --noEmit test/test-types-local.ts --moduleResolution node --esModuleInterop --strict --target ES2020
if [ $? -ne 0 ]; then
    echo "❌ TypeScript type safety tests failed"
    exit 1
fi

# Test CLI functionality
echo "🖥️ Testing CLI generation..."
node dist/cli.js test/sample-schema.json > test/cli-output.ts
if [ $? -ne 0 ]; then
    echo "❌ CLI generation failed"
    exit 1
fi

# Verify CLI output
if [ -f "test/cli-output.ts" ] && [ -s "test/cli-output.ts" ]; then
    echo "✅ CLI generation successful"
    echo "📄 Generated $(wc -l < test/cli-output.ts) lines of TypeScript"
else
    echo "❌ CLI output file is empty or missing"
    exit 1
fi

# Test resource generation with different output directory
echo "🏗️ Testing resource generation..."
rm -rf test/generated2
node -e "
  const { generateResources } = require('./dist/resourceGenerator');
  generateResources('./test/sample-schema.json', './test/generated2')
    .then(() => console.log('✅ Resource generation test passed'))
    .catch(err => { console.error('❌ Resource generation failed:', err.message); process.exit(1); })
"

# Test enhanced generation with real schema (if available)
if [ -f "/Users/lxbanov/Malevich/centre-api-demo/schema.json" ]; then
  echo "🚀 Testing enhanced resource generation..."
  node test/test-enhanced.js
  if [ $? -ne 0 ]; then
      echo "❌ Enhanced generation tests failed"
      exit 1
  fi
else
  echo "ℹ️ Skipping enhanced tests (demo schema not found)"
fi

echo ""
echo "🎉 All tests passed successfully!"
echo "✅ Build works"
echo "✅ Module imports work" 
echo "✅ Type safety verified"
echo "✅ CLI generation works"
echo "✅ Resource generation works"
echo ""
echo "📁 Generated test files:"
ls -la test/generated*/
echo ""
echo "Your nova-ts package is ready for use! 🚀" 