import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const home=read('../src/pages/Home.jsx'),demo=read('../src/Demo.jsx'),contact=read('../src/components/ContactForm.jsx'),metadata=read('../index.html');
test('public home links to the demo and signed-in app without product overclaims',()=>{
 assert.match(home,/href="\/demo"/);assert.match(home,/Explore the interactive demo/);assert.match(home,/Sign In/);assert.match(demo,/Simulation only/);assert.match(demo,/Fictional sample workspace/);assert.match(demo,/separate from the live application/);
});
test('pilot onboarding copy avoids unverified price or duration promises',()=>{
 assert.match(home,/Pilot onboarding/);assert.match(home,/Map the project team/);assert.match(home,/no fixed price or timeline is implied/);assert.match(home,/mailto:hello@asbuiltflow\.com/);
});
test('site metadata uses the official brand and accurate product description',()=>{
 assert.match(metadata,/<title>AsBuiltFlow \| Telecom Construction Closeout<\/title>/);assert.match(metadata,/og:image" content="https:\/\/www\.asbuiltflow\.com\/brand\/asbuiltflow-logo\.jpg/);assert.match(metadata,/rel="canonical" href="https:\/\/www\.asbuiltflow\.com\//);assert.match(contact,/mailto:hello@asbuiltflow\.com/);
});
