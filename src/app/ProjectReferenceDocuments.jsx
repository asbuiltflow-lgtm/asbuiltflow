import { useState } from 'react';
import { isProjectWritable } from './workflow';

const CATEGORIES = [
  'Construction Map',
  'Workbook',
  'Design Package',
  'Permit / Reference Document',
  'Traffic Control Plan',
  'BOM / Material Reference',
  'Other Project Document',
];
const PREFIX = 'Project reference · ';

export default function ProjectReferenceDocuments({ project, canUpload, onUpload, onFile }) {
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const documents = (project.files || []).filter(file => file.category?.startsWith(PREFIX));

  function upload(event) {
    event.preventDefault();
    if (!selectedFiles.length) return;
    onUpload(selectedFiles, `${PREFIX}${category}`);
    setSelectedFiles([]);
    event.currentTarget.reset();
  }

  return <Panel title="Project reference documents">
    <p className="rwNote">Documents used to plan and perform the work—separate from closeout evidence submitted for review.</p>
    {canUpload && isProjectWritable(project) && <form className="rwForm rwReferenceUpload" onSubmit={upload}>
      <label>Document type<select value={category} onChange={event => setCategory(event.target.value)}>{CATEGORIES.map(item => <option key={item}>{item}</option>)}</select></label>
      <label>Add maps, workbooks, plans, or references<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={event => setSelectedFiles(Array.from(event.target.files || []))}/></label>
      {selectedFiles.length > 0 && <p role="status">{selectedFiles.length} file{selectedFiles.length === 1 ? '' : 's'} ready to upload as {category}.</p>}
      <button className="rwPrimary" disabled={!selectedFiles.length}>Upload reference documents</button>
    </form>}
    {documents.length ? <div className="rwReferenceList">{documents.map(file => <article key={file.id}>
      <span className="rwReferenceType">{file.category.slice(PREFIX.length)}</span>
      <span className="rwReferenceFile"><strong>{file.file_name}</strong><small>{file.mime_type} · {new Date(file.created_at).toLocaleDateString()}</small></span>
      <button type="button" className="rwLink" onClick={() => onFile(file)}>Open</button>
    </article>)}</div> : <Empty text={canUpload ? 'No project reference documents yet. Add the map, workbook, or plans the crew will use.' : 'No project reference documents have been shared yet.'}/>}
  </Panel>;
}

function Panel({ title, children }) {
  return <section className="rwPanel"><header><h2>{title}</h2></header><div>{children}</div></section>;
}

function Empty({ text }) {
  return <div className="rwEmpty"><strong>{text}</strong></div>;
}
