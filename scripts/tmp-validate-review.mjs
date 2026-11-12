import fs from 'node:fs';
const raw = fs.readFileSync('C:/Users/Raihan/AppData/Local/Temp/opencode/nowshin-bad-glosses-review.csv', 'utf8').replace(/^\uFEFF/, '');
function parse(text) {
  const rows=[]; let row=[], field='', q=false;
  for (let i=0;i<text.length;i++){const c=text[i];
    if(q){ if(c=='"'&&text[i+1]=='"'){field+='"';i++;} else if(c=='"'){q=false;} else field+=c; }
    else if(c=='"')q=true; else if(c==','){row.push(field);field='';}
    else if(c=='\r'){} else if(c=='\n'){row.push(field);rows.push(row);row=[];field='';}
    else field+=c;
  }
  if(field.length||row.length){row.push(field);rows.push(row);} return rows;
}
const [h,...r]=parse(raw); const ix=Object.fromEntries(h.map((x,i)=>[x,i]));
const ids=r.map(x=>x[ix.id]); const dup=ids.filter((id,i)=>ids.indexOf(id)!==i);
const empty=r.filter(x=>!x[ix.proposed_t1]||!x[ix.proposed_t2]);
const noop=r.filter(x=>x[ix.current_t1]===x[ix.proposed_t1]&&x[ix.current_t2]===x[ix.proposed_t2]&&x[ix.current_t1]!==undefined&&x[ix.proposedMainWord]===x[ix.mainWord]);
console.log('rows',r.length,'unique',new Set(ids).size,'dups',dup.length,'empty proposed',empty.length,'fully no-op',noop.length);
for(const x of noop) console.log('NOOP',x[ix.section],x[ix.mainWord]);
