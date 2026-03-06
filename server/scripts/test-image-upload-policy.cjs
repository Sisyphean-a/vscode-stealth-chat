const assert = require('node:assert/strict');
const {
  buildImageUploadPlan,
  shouldCompressBeforeUpload,
} = require('../../packages/chat-core/index.cjs');

function run() {
  assert.equal(typeof shouldCompressBeforeUpload, 'function', 'should export shouldCompressBeforeUpload');
  assert.equal(typeof buildImageUploadPlan, 'function', 'should export buildImageUploadPlan');

  assert.equal(
    shouldCompressBeforeUpload({ mimeType: 'image/jpeg', size: 2 * 1024 * 1024 }),
    true,
    'large jpeg should be compressed',
  );

  assert.equal(
    shouldCompressBeforeUpload({ mimeType: 'image/png', size: 4 * 1024 * 1024 }),
    false,
    'png screenshot should stay untouched',
  );

  const plan = buildImageUploadPlan({ mimeType: 'image/jpeg', size: 2 * 1024 * 1024 });
  assert.equal(plan.shouldCompress, true, 'large jpeg plan should enable compression');
  assert.equal(plan.outputMimeType, 'image/jpeg', 'compressed photos should upload as jpeg');
  assert.equal(plan.targetMaxDimension, 1920, 'photos should cap max dimension');
  assert.ok(plan.targetQuality > 0.7 && plan.targetQuality < 0.9, 'quality should stay in safe range');
}

run();
console.log('image upload policy tests passed');
