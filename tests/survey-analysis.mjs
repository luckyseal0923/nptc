import assert from 'node:assert/strict';
import test from 'node:test';
import { metricValue, metricRange, scaleKey, orderedAssignments, surveyPeople, surveyTrend } from '../lib/survey-analysis.ts';

const definition={code:'test',version:'v1',title:'測試量表',notice:'僅測試',instructions:[],minScore:0,maxScore:4,items:[{text:'甲'},{text:'乙'}],reverseItems:[],dimensions:{domain:[1],total:[2]}};
const assignment=(id,wid,date,version='v1')=>({id,workshop_id:wid,scale_code:'test',scale_version:version,definition:{...definition,version},created_at:date,note:id,status:'open',revision:0,opens_at:null,closes_at:null});
const response=(assignment_id,student_id,identity,total)=>({assignment_id,student_id,identity,submitted_at:'2026-10-29T00:00:00Z',answers:[total,0],scores:{itemScores:[total,0],total,dimensions:{domain:total,total:0}}});
const a=assignment('first','w1','2026-01-01'),b=assignment('missing','w1','2026-01-02'),c=assignment('last','w2','2026-01-03'),other=assignment('other','w1','2026-01-04','v2');
const data={includesArchived:false,workshops:[{id:'w1',name:'一'},{id:'w2',name:'二'}],assignments:[c,b,a,other],students:[{id:'s1',name:'同名',identity:'user1',workshop_id:'w1'},{id:'s2',name:'同名',identity:'user1',workshop_id:'w2'},{id:'s3',name:'同名',identity:'user2',workshop_id:'w1'}],responses:[response(a.id,'s1','user1',0),response(a.id,'s3','user2',4),response(c.id,'s2','user1',4),response(other.id,'s1','user1',100)]};

test('trend aggregates valid scores, keeps zero, leaves missing values and separates versions and identities',()=>{
  const same=data.assignments.filter(r=>scaleKey(r)===scaleKey(a));
  assert.deepEqual(orderedAssignments(same).map(a=>a.id),['first','missing','last']);
  assert.deepEqual(orderedAssignments([{...a,id:'z'},{...a,id:'a'}]).map(a=>a.id),['z','a'],'equal timestamps retain source order rather than random UUID order');
  const people=surveyPeople(data,same);assert.equal(people.length,2);
  const personal=people.find(p=>p.identity==='user1');assert.deepEqual(personal.studentIds.sort(),['s1','s2']);
  const all=surveyTrend(data,same,people,'total');assert.deepEqual(all.map(p=>[p.value,p.count]),[[2,2],[null,0],[4,1]]);
  assert.deepEqual(surveyTrend(data,same,[personal],'total').map(p=>p.value),[0,null,4]);
  assert.deepEqual(surveyTrend(data,same,[],'total').map(p=>p.value),[null,null,null]);
  assert.deepEqual(metricRange(definition,'total'),{min:0,max:8});assert.deepEqual(metricRange(definition,'dimension:domain'),{min:0,max:4});
  assert.equal(metricValue(data.responses[1].scores,'dimension:total'),0);
  assert.equal(metricValue({total:NaN,itemScores:[]},'total'),null);
  assert.equal(metricValue({total:0,itemScores:[]},'dimension:missing'),null);
  assert.equal(metricValue({total:0,itemScores:[],flexibility:0},'dimension:flexibility'),0);
});
test('historical account identity stays separate when roster is later attached to a replacement account',()=>{
  const changed={...data,students:data.students.map(s=>s.id==='s1'?{...s,identity:'replacement'}:s)};
  const people=surveyPeople(changed,[a]);assert.equal(people.length,3);
  assert.deepEqual(surveyTrend(changed,[a],people.filter(p=>p.identity==='replacement'),'total').map(p=>p.value),[null]);
  assert.deepEqual(surveyTrend(changed,[a],people.filter(p=>p.identity==='user1'),'total').map(p=>p.value),[0]);
});
