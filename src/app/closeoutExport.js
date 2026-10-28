// Dependency-free, uncompressed ZIP (ZIP32). Never persist signed URLs in the archive.
import {archiveFilePath,closeoutIndex} from './closeoutIndex.js';
const encoder=new TextEncoder();
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function header(length){const bytes=new Uint8Array(length);return [bytes,new DataView(bytes.buffer)];}
export function createZip(entries){
 if(entries.length>65535)throw new Error('Too many archive entries.');
 const parts=[],directory=[];let offset=0,directorySize=0;
 for(const entry of entries){
  if(!entry.name||entry.name.includes('..')||entry.name.startsWith('/')||entry.name.includes('\\'))throw new Error('Unsafe archive path.');
  const name=encoder.encode(entry.name),data=entry.data instanceof Uint8Array?entry.data:encoder.encode(entry.data);
  if(name.length>65535||offset+data.length>0xffffffff)throw new Error('Archive exceeds ZIP32 limits.');
  const crc=crc32(data),[local,lv]=header(30),[central,cv]=header(46);
  lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x800,true);lv.setUint16(12,33,true);lv.setUint32(14,crc,true);lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);lv.setUint16(26,name.length,true);
  cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(14,33,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);
  parts.push(local,name,data);directory.push(central,name);offset+=30+name.length+data.length;directorySize+=46+name.length;
 }
 const [end,ev]=header(22);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,entries.length,true);ev.setUint16(10,entries.length,true);ev.setUint32(12,directorySize,true);ev.setUint32(16,offset,true);
 return new Blob([...parts,...directory,end],{type:'application/zip'});
}
export async function buildCloseoutArchive(receipt,download,{brandLogo}={}){
 if(!receipt?.accepted_at||!receipt.snapshot)throw new Error('Accepted closeout receipt required.');
 const files=receipt.snapshot.files||[];
 if(files.reduce((n,f)=>n+Number(f.size_bytes||0),0)>250*1024*1024)throw new Error('Archive exceeds the 250 MiB browser export limit. Download documents individually.');
 const {index,html}=closeoutIndex(receipt,{includeLogo:!!brandLogo});
 const entries=[{name:'index.html',data:html},{name:'manifest.json',data:JSON.stringify({...receipt,archive_index:index},null,2)},{name:'README.txt',data:`AsBuiltFlow final closeout package\nProject: ${receipt.snapshot.project.project_number}\nAccepted: ${receipt.accepted_at}\nReceipt: ${receipt.id}\n\nExtract the ZIP, then open index.html for the readable handoff and document links.\nmanifest.json contains the frozen closeout snapshot and archive file index; it is not a complete activity-feed or issue-conversation archive.\nfiles/construction/current is the released construction package; history folders are reference only.\nfiles/evidence and files/invoices preserve all document revisions.\nfiles/field-changes contains uploaded walkout/change attachments.\nSubmission notes and construction revision-at-submission snapshots are preserved in manifest.json and summarized in index.html.\nInvoice approvals do not represent payment. No signed URLs or credentials are included.\n`}];
 if(brandLogo)entries.push({name:'branding/asbuiltflow-logo.jpg',data:brandLogo});
 let total=brandLogo?.length||0;
 for(const file of files){const bytes=await download(file);total+=bytes.length;if(total>250*1024*1024)throw new Error('Archive exceeds browser export limit.');entries.push({name:archiveFilePath(receipt.snapshot,file),data:bytes});}
 return createZip(entries);
}
