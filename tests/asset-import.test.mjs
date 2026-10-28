import {test} from 'node:test';
import assert from 'node:assert/strict';
import {previewAssetCsv} from '../src/app/assetImport.js';
test('CSV preview handles quotes, BOM, multiline fields and numeric metadata',()=>{
 const preview=previewAssetCsv('\uFEFFidentifier,asset_type,planned_description,fiber_count\r\nSP-1,splice,"New, \"\"planned\"\"\nsplice",144');
 assert.equal(preview.valid,true);assert.equal(preview.rows[0].planned_description,'New, "planned"\nsplice');assert.equal(preview.rows[0].attributes.fiber_count,144);
});
test('CSV rejects duplicates including existing assets and invalid types without writes',()=>{
 const preview=previewAssetCsv('identifier,asset_type\nA,splice\nA,bogus',[{identifier:'A'}]);
 assert.equal(preview.valid,false);assert.equal(preview.rows[0].errors.length,1);assert.equal(preview.rows[1].errors.length,2);
});
test('CSV malformed input and unsupported headers fail closed',()=>{
 for(const csv of ['identifier,asset_type\n"A,splice','identifier,asset_type,secret\nA,splice,x','identifier,identifier\nA,B'])assert.throws(()=>previewAssetCsv(csv));
 assert.equal(previewAssetCsv('identifier,asset_type,fiber_count\nA,splice,Infinity').valid,false);
});
