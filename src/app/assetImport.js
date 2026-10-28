export const ASSET_TYPES=['splice','handhole','vault','pedestal','pole','fiber_segment','tap','amplifier','splitter','node','equipment','bore','road_crossing','conduit','custom'];

// RFC-style quoted fields, escaped quotes and CRLF; never evaluate spreadsheet formulas.
export function previewAssetCsv(text, existing=[]){
 if(text.length>2_000_000)throw new Error('CSV exceeds 2 MB.');
 const records=[];let row=[],field='',quoted=false,closed=false;
 const push=()=>{row.push(field);field='';closed=false;};
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
  if(c==='"'){if(field||closed)throw new Error('Unexpected quote in CSV.');quoted=true;}
  else if(c===',')push();
  else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;push();if(row.some(v=>v.trim()))records.push(row);row=[];}
  else {if(closed)throw new Error('Unexpected text after quoted field.');field+=c;}
 }
 if(quoted)throw new Error('Unclosed CSV quote.');
 push();if(row.some(v=>v.trim()))records.push(row);
 const headers=(records.shift()||[]).map(v=>v.replace(/^\uFEFF/,'').trim());
 const allowed=['identifier','asset_type','planned_description','fiber_count'];
 if(!headers.includes('identifier')||!headers.includes('asset_type')||new Set(headers).size!==headers.length||headers.some(h=>!allowed.includes(h)))throw new Error(`Use unique headers: ${allowed.join(', ')}. identifier and asset_type are required.`);
 if(!records.length||records.length>1000)throw new Error('Import must contain 1 to 1000 rows.');
 const seen=new Set(existing.map(a=>a.identifier));
 const rows=records.map((values,index)=>{
  const data=Object.fromEntries(headers.map((h,i)=>[h,(values[i]||'').trim()]));const errors=[];
  if(values.length!==headers.length)errors.push('Column count differs from header');
  if(!data.identifier||data.identifier.length>160)errors.push('Identifier must be 1–160 characters');
  if(seen.has(data.identifier))errors.push('Duplicate identifier');seen.add(data.identifier);
  if(!ASSET_TYPES.includes(data.asset_type))errors.push('Unknown asset type');
  if(data.fiber_count&&!/^\d+$/.test(data.fiber_count))errors.push('Fiber count must be a nonnegative integer');
  if(data.fiber_count&&!Number.isSafeInteger(Number(data.fiber_count)))errors.push('Fiber count is too large');
  return {line:index+2,errors,identifier:data.identifier,asset_type:data.asset_type,planned_description:data.planned_description||'',attributes:data.fiber_count?{fiber_count:Number(data.fiber_count)}:{}};
 });
 return {rows,valid:rows.every(row=>!row.errors.length)};
}
