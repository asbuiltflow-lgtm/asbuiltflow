import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createZip,buildCloseoutArchive} from '../src/app/closeoutExport.js';
import {archiveFilePath} from '../src/app/closeoutIndex.js';

test('independent Windows ZIP reader extracts manifest and original binary bytes',{skip:process.platform!=='win32'},async()=>{
 const archive=await createZip([{name:'manifest.json',data:'{"accepted":true}'},{name:'files/test.pdf',data:new Uint8Array([0,1,2,255])}]).arrayBuffer();
 const base64=Buffer.from(archive).toString('base64');
 const script=`Add-Type -AssemblyName System.IO.Compression; $data=[Convert]::FromBase64String('${base64}'); $stream=[IO.MemoryStream]::new($data); $zip=[IO.Compression.ZipArchive]::new($stream); if ($zip.Entries.Count -ne 2) {throw 'Entry count'}; $reader=[IO.StreamReader]::new($zip.GetEntry('manifest.json').Open()); if ($reader.ReadToEnd() -ne '{"accepted":true}') {throw 'Manifest mismatch'}; $reader.Dispose(); $bytes=[IO.MemoryStream]::new(); $zip.GetEntry('files/test.pdf').Open().CopyTo($bytes); if ([Convert]::ToBase64String($bytes.ToArray()) -ne 'AAEC/w==') {throw 'Bytes mismatch'}; $zip.Dispose(); 'ZIP verified'`;
 assert.match(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8'}),/ZIP verified/);
});
test('ZIP stores exact bytes and central directory without credentials',async()=>{
 const bytes=new Uint8Array(await createZip([{name:'hello.txt',data:'hello'}]).arrayBuffer()),view=new DataView(bytes.buffer);
 assert.equal(view.getUint32(0,true),0x04034b50);assert.equal(view.getUint32(14,true),0x3610a686);assert.equal(view.getUint32(bytes.length-22,true),0x06054b50);
 assert.equal(new TextDecoder().decode(bytes.slice(39,44)),'hello');
 assert.throws(()=>createZip([{name:'../escape',data:'bad'}]),/Unsafe/);
});
test('turnover export requires acceptance and fails on missing file instead of emitting partial success',async()=>{
 await assert.rejects(buildCloseoutArchive({},()=>{}),/Accepted/);
 const receipt={id:'receipt',accepted_at:'2026-09-22',snapshot:{project:{project_number:'STAGING'},files:[{id:'file',file_name:'test.pdf',size_bytes:4}]}};
 await assert.rejects(buildCloseoutArchive(receipt,async()=>{throw new Error('Download denied')}),/denied/);
 const archive=await buildCloseoutArchive(receipt,async()=>new Uint8Array([1,2,3,4]));assert.equal(archive.type,'application/zip');assert.ok(archive.size>100);
});

test('accepted archive includes immutable invoice metadata, decisions and original revision files',async()=>{
 const receipt={id:'receipt',accepted_at:'2026-10-06',snapshot:{project:{project_number:'SYNTHETIC'},invoice_state:{complete:true},invoice_versions:[{id:'v1',version:1,file_id:'f1',invoice_number:'INV-1'},{id:'v2',version:2,file_id:'f2',invoice_number:'INV-1'}],invoice_reviews:[{version_id:'v1',decision:'needs_correction'},{version_id:'v2',decision:'approved'}],files:[{id:'f1',file_name:'invoice-v1.pdf',size_bytes:1},{id:'f2',file_name:'invoice-v2.pdf',size_bytes:1}]}};
 const requested=[];const archive=await buildCloseoutArchive(receipt,async f=>{requested.push(f.id);return new Uint8Array([42])});
 assert.deepEqual(requested,['f1','f2']);
 const text=new TextDecoder().decode(await archive.arrayBuffer());
 for(const marker of ['invoice_versions','needs_correction','approved','files/invoices/history/f1-invoice-v1.pdf','files/invoices/approved/f2-invoice-v2.pdf','index.html','AsBuiltFlow final closeout package','not a complete activity-feed or issue-conversation archive'])assert.ok(text.includes(marker));
});

test('final ZIP indexes field-change attachments and preserves submission context in the manifest',async()=>{
 const snapshot={project:{project_number:'DOC-1'},field_changes:[{id:'fc1',title:'Handhole relocation',sheet_reference:'C-04'}],field_change_files:[{id:'link1',field_change_id:'fc1',file_id:'photo1'}],submissions:[{id:'s1',sequence:1,submission_notes:'Location checked at station 14+20.',construction_package_snapshot:{revision_label:'Rev 2'}}],files:[{id:'photo1',file_name:'walkout.jpg',size_bytes:3}]};
 const file=snapshot.files[0];
 assert.equal(archiveFilePath(snapshot,file),'files/field-changes/Handhole_relocation/photo1-walkout.jpg');
 const archive=await buildCloseoutArchive({id:'receipt',accepted_at:'2026-10-20',snapshot},async()=>new Uint8Array([1,2,3]));
 const text=new TextDecoder().decode(await archive.arrayBuffer());
 for(const marker of ['files/field-changes/Handhole_relocation/photo1-walkout.jpg','submission_notes','Location checked at station 14+20.','construction_package_snapshot','Rev 2','files/field-changes contains uploaded walkout/change attachments'])assert.ok(text.includes(marker));
});
