import {useState} from 'react';
import {ASSET_TYPES} from './assetImport';
import {humanize} from './projectPresentation';
export default function AssetEditor({asset,busy,onSave}){
 const [type,setType]=useState(asset?.asset_type||'splice');
 const fiber=['splice','fiber_segment','splitter','node'].includes(type);
 const sized=['conduit','bore','road_crossing','handhole','vault','pedestal','pole'].includes(type);
 return <form className="rwForm coEditor" onSubmit={e=>{e.preventDefault();const values=Object.fromEntries(new FormData(e.currentTarget));const attributes={...asset?.attributes,notes:values.notes};if(fiber&&values.fiber_count!=='')attributes.fiber_count=Number(values.fiber_count);if(sized)attributes.size=values.size;delete values.notes;delete values.fiber_count;delete values.size;onSave({...values,attributes})}}>
  <h3>{asset?'Update asset / as-built record':'Add project asset'}</h3><p>Record only the information relevant to this asset. Saved changes preserve the earlier record.</p>
  <div className="coAssetFields"><label>Identifier<input name="identifier" required maxLength={160} defaultValue={asset?.identifier||''} readOnly={!!asset}/></label><label>Asset type<select name="asset_type" value={type} onChange={e=>setType(e.target.value)}>{ASSET_TYPES.map(t=><option key={t} value={t}>{humanize(t)}</option>)}</select></label></div>
  {Object.entries({planned_description:'Planned location / condition',revised_description:'Revised location / condition',actual_description:'As-built location / condition'}).map(([name,label])=><label key={name}>{label}<textarea name={name} defaultValue={asset?.[name]||''}/></label>)}
  {fiber&&<label>Fiber count<input type="number" name="fiber_count" min="0" max="100000" step="1" defaultValue={asset?.attributes?.fiber_count??''}/></label>}
  {sized&&<label>Size / dimensions (include units)<input name="size" maxLength={200} defaultValue={asset?.attributes?.size||''}/></label>}
  <label>Field notes<textarea name="notes" maxLength={4000} defaultValue={asset?.attributes?.notes||''}/></label><button className="rwPrimary" disabled={busy}>{busy?'Saving…':'Save asset record'}</button>
 </form>;
}
